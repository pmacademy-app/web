# Prodily Technical Remediation — Phase T2: Core Backend Reliability

## Starting State
- **Branch:** `tech-fixes`
- **T1 Commit SHA:** `681f34b51ffb3d12018032eb642b35e8c9a8169b`
- **T2 Starting SHA:** `681f34b51ffb3d12018032eb642b35e8c9a8169b`
- **Working Tree State:** Clean (no uncommitted or untracked changes at start of Phase T2).

---

## Findings Verified

### 1. T2.1: Notification Preference Source of Truth
- **Audit ID:** `CRIT-02`
- **Status:** Confirmed
- **Evidence:**
  - `apps/web/lib/notifications/queue/processor.ts:104` hardcoded `createDefaultNotificationPreferences(params.userId)` on every enqueue check.
  - `apps/web/lib/notifications/in-app/service.ts:50` similarly invoked `createDefaultNotificationPreferences(params.userId)`.
  - In `apps/web/lib/notifications/preferences/defaults.ts`, default preferences configure `learning: { email: false }` and `achievements: { email: false }`.
  - `user_notification_preferences` table exists in PostgreSQL and users update their preferences at `/settings/notifications`, but those persisted preferences were completely bypassed by the queue and in-app dispatchers.
- **Root Cause:** Enqueue paths used an in-memory default factory rather than querying `user_notification_preferences`.
- **Relevant Files:**
  - `apps/web/lib/notifications/preferences/defaults.ts`
  - `apps/web/lib/notifications/queue/processor.ts`
  - `apps/web/lib/notifications/in-app/service.ts`
  - `apps/web/app/api/settings/notifications/route.ts`

### 2. T2.2: XP Trigger Performance / Correctness
- **Audit ID:** `CRIT-05` / `P1-1`
- **Status:** Confirmed
- **Evidence:**
  - In migration `20260728000002_create_user_state.sql:127-130`, `trigger_sync_user_xp_on_update` was registered `BEFORE UPDATE ON users FOR EACH ROW`, unconditionally executing `SELECT coalesce(sum(xp_amount), 0) FROM xp_events WHERE user_id = NEW.id;`.
  - Every update to `users` (e.g. `current_streak`, `name`, `avatar_url`, `last_active_at`) forced a full aggregate scan of the `xp_events` ledger for that user.
  - When an XP event was inserted, `trigger_update_user_xp` fired `AFTER INSERT ON xp_events` and executed `UPDATE users SET total_xp = ...`, which immediately triggered `trigger_sync_user_xp_on_update` on `users`, causing duplicate aggregation for every XP event.
  - Furthermore, `trigger_update_user_xp` was only registered `AFTER INSERT`, so deleting or updating rows in `xp_events` (such as account progress reset) did not automatically re-sync `total_xp`.
- **Root Cause:** Lack of execution scope and trigger depth awareness in `users` trigger, and missing `UPDATE`/`DELETE` triggers on `xp_events`.
- **Relevant Files:**
  - `supabase/migrations/20260728000002_create_user_state.sql`
  - `supabase/migrations/20260913000001_xp_event_uniqueness_b8e.sql`
  - `supabase/migrations/20260925000002_phase_t2_backend_reliability.sql`

### 3. T2.3: Lesson Completion Atomicity
- **Audit ID:** Backend & Database — Lack of Transaction Boundaries in Lesson Completion
- **Status:** Confirmed
- **Evidence:**
  - In `apps/web/lib/academy/lessons-db.ts:223-298` (`recordQuizAttemptAction`), four separate non-transactional database operations were executed in sequence:
    1. Insert into `quiz_attempts`.
    2. Upsert into `user_lesson_progress` (`completeLesson`).
    3. Insert into `xp_events` for incremental quiz XP.
    4. Insert into `xp_events` for perfect score bonus XP.
  - Failures in steps 3 and 4 were caught with `try/catch` and silently swallowed with `console.error`, marking the lesson completed while losing XP and creating persistent ledger drift.
  - Intermittent network drops or function terminations left incomplete progress without corresponding ledger entries.
- **Root Cause:** Absence of database-level transaction boundaries across interdependent entities (`quiz_attempts`, `user_lesson_progress`, `xp_events`).
- **Relevant Files:**
  - `apps/web/lib/academy/lessons-db.ts`
  - `supabase/migrations/20260925000002_phase_t2_backend_reliability.sql`

### 4. T2.4: Progress Reset / Badge Consistency
- **Audit ID:** Backend & Database — Orphaned Badges after Account Progress Reset
- **Status:** Confirmed
- **Evidence:**
  - In `apps/web/lib/settings/settings-service.ts:10-106` (`resetProgress`), learning progress reset deleted from `user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs`, `reflections`, and `capstone_submissions`, but completely ignored `user_badges`.
  - As a result, learners who reset their course progress retained completion-derived badges (`pm_academy_graduate`, `module_complete`, `curriculum_explorer`, `first_perfect_quiz`, `quiz_master`, `first_lesson`, `first_capstone`, `capstones_all`) despite having 0 completed lessons in their progress ledger.
- **Root Cause:** Progress reset routines did not synchronize progress-derived badges with the cleared learning state.
- **Relevant Files:**
  - `apps/web/lib/settings/settings-service.ts`
  - `apps/web/config/badges.ts`

### 5. T2.5: Admin Audit Log False Positives
- **Audit ID:** `P1-2`
- **Status:** Confirmed
- **Evidence:**
  - In `apps/web/lib/api/actor.ts:113-125`, route resolution evaluated `if (allow.has('admin'))` first and called `requireAdminUser(request)`.
  - In `apps/web/lib/admin/guard.ts:52-58`, non-admin users triggered an immediate audit log:
    `await logAdminAction(authUser.id, typedUserRow.email, 'access_denied', 'system', undefined, { reason: 'Non-admin user' })`
  - Dual-role routes (e.g. routes accepting both `'learner'` and `'admin'`) resolved normal learners by first running `requireAdminUser()`, which recorded a fake security violation `access_denied` before `actor.ts` happily granted access under the `'learner'` role.
  - This flooded `admin_audit_logs` with spurious security denials on ordinary learner requests.
- **Root Cause:** Admin authorization guard coupled role determination with security violation logging, lacking awareness of whether the calling policy permitted non-admin roles.
- **Relevant Files:**
  - `apps/web/lib/admin/guard.ts`
  - `apps/web/lib/api/actor.ts`

---

## Fixes Implemented

### T2.1: Notification Preference Source of Truth
1. Implemented `mapDbRowToNotificationPreferences` in `apps/web/lib/notifications/preferences/defaults.ts` to map database rows to `UserNotificationPreferences` with explicit support for all notification categories and channels.
2. Implemented `getResolvedUserNotificationPreferences(supabase, userId)` to read persisted preferences from `user_notification_preferences`, defaulting gracefully when no record exists.
3. Implemented `getBatchUserNotificationPreferences(supabase, userIds)` to fetch preferences for batches in a single round-trip, eliminating N+1 database queries during bulk queue dispatch and broadcasts.
4. Updated `enqueueNotificationItem` in `apps/web/lib/notifications/queue/processor.ts` to check `params.preloadedPreferences || (await getResolvedUserNotificationPreferences(supabase, params.userId))`.
5. Updated `createInAppNotification` in `apps/web/lib/notifications/in-app/service.ts` to resolve user preferences from the database.
6. Normalized UI and database contract properties in `apps/web/app/api/settings/notifications/route.ts` (supporting both `all_email`/`all_in_app` and `email_enabled`/`in_app_enabled`).
7. Preserved priority bypass (`globalPriorityMatrix.evaluatePreferenceBypass`) and critical authentication bypass (`auth.verify_email`, `auth.password_reset`).

### T2.2: XP Trigger Performance & Correctness
1. Created new migration `supabase/migrations/20260925000002_phase_t2_backend_reliability.sql`:
   - Updated `update_user_xp_and_level()` to fire `AFTER INSERT OR UPDATE OR DELETE ON public.xp_events FOR EACH ROW`, establishing the `xp_events` ledger as the authoritative synchronization source.
   - Refactored `sync_user_xp_and_level_on_update()` on `users`:
     - Skips execution when `pg_trigger_depth() > 1` (preventing duplicate aggregation when updates originate from `xp_events` trigger).
     - Skips aggregation when `OLD.total_xp IS NOT DISTINCT FROM NEW.total_xp AND OLD.level IS NOT DISTINCT FROM NEW.level` (preventing table scans on unrelated profile, streak, and timestamp updates).
     - Recomputes authentic total XP from `xp_events` only when an explicit mutation to `total_xp` or `level` occurs at root depth (preserving anti-tampering).
   - Created maintenance helper `public.sync_user_xp(p_user_id uuid)`.

### T2.3: Lesson Completion Atomicity
1. Created PostgreSQL RPC `public.record_lesson_quiz_completion`:
   - Executes inside a single ACID database transaction with `FOR UPDATE` concurrency locking on `user_lesson_progress`.
   - Records quiz question attempts into `quiz_attempts`.
   - Computes incremental quiz XP and first-attempt perfect bonus XP.
   - Updates `user_lesson_progress` status to `completed`, updating attempt count, highest score, and total XP earned.
   - Inserts `quiz_correct` and `quiz_bonus` records into `xp_events` with conflict prevention (`ON CONFLICT DO NOTHING`).
   - Guarantees all-or-nothing rollback: progress, attempts, and XP never diverge.
2. Updated `recordQuizAttemptAction` in `apps/web/lib/academy/lessons-db.ts`:
   - Directly executes the atomic RPC `record_lesson_quiz_completion`.
   - Fallback path safely propagates ledger errors rather than swallowing them.

### T2.4: Progress Reset & Badge Consistency
1. Identified progress-derived badges vs. account-level achievements in `apps/web/lib/settings/settings-service.ts`:
   - Progress-derived: `first_lesson`, `module_complete`, `curriculum_explorer`, `first_perfect_quiz`, `quiz_master`, `first_capstone`, `capstones_all`, `pm_academy_graduate`.
   - Account-level (preserved): `portfolio_published`, `first_level_up`, `xp_1000`, `xp_5000`, `streak_7`, `streak_30`, `streak_comeback`.
2. Implemented `synchronizeProgressBadges(supabase, userId, isFullReset)` in `settings-service.ts`:
   - On full reset: revokes all progress-derived badges from `user_badges`.
   - On module-specific reset: inspects remaining completed lessons and capstones, revoking only badges whose criteria are no longer satisfied.
   - Preserves permanent portfolio, streak, and XP badges.

### T2.5: Admin Audit Log False Positives
1. Added `RequireAdminOptions { silent?: boolean }` to `requireAdminUser` in `apps/web/lib/admin/guard.ts`.
2. Updated WeakMap caching in `guard.ts` to preserve audit state and emit audit logs only when non-silent checks are requested.
3. Updated `apps/web/lib/api/actor.ts`:
   - Detects whether the route is strictly admin (`!allow.has('learner') && !allow.has('anonymous')`).
   - Dual-role routes test for admin with `{ silent: true }`, ensuring legitimate learners never generate `access_denied` audit records.
   - Strictly admin routes test with `{ silent: false }`, ensuring unauthorized attempts to admin endpoints continue to be audited with high fidelity.

---

## Database Changes
- **Migration File:** `supabase/migrations/20260925000002_phase_t2_backend_reliability.sql`
- **Functions & Triggers:**
  - `public.update_user_xp_and_level()`: Updated to handle `INSERT OR UPDATE OR DELETE` on `xp_events`.
  - `trigger_update_user_xp`: Recreated on `xp_events` for `AFTER INSERT OR UPDATE OR DELETE`.
  - `public.sync_user_xp_and_level_on_update()`: Guarded by `pg_trigger_depth() > 1` and column change check `(OLD.total_xp IS DISTINCT FROM NEW.total_xp OR OLD.level IS DISTINCT FROM NEW.level)`.
  - `trigger_sync_user_xp_on_update`: Recreated `BEFORE UPDATE ON public.users`.
  - `public.sync_user_xp(p_user_id uuid)`: Created maintenance RPC function.
  - `public.record_lesson_quiz_completion(...)`: Created transactional RPC function for quiz attempt persistence, lesson completion, and XP ledger insert.
- **Safety:**
  - All migrations are additive and non-destructive.
  - Historical migrations were not edited.
  - Functions use `SECURITY DEFINER` and explicit `SET search_path = public, pg_temp;`.
  - Permissions granted to `authenticated` and `service_role`.

---

## Tests Added / Updated
- Created comprehensive regression suite:
  - `apps/web/lib/__tests__/phase-t2-backend-reliability.test.ts` (19 tests covering all 5 T2 areas).
- Test categories verified:
  1. Default notification preferences (no row).
  2. Explicit preference row matching defaults.
  3. Explicit opt-out across channels and global toggles.
  4. Explicit opt-in for learning and achievement emails.
  5. Asynchronous database preference resolution and batch resolution (anti-N+1).
  6. Critical email bypass of notification preferences.
  7. XP trigger optimization and level computation across all tiers.
  8. Atomic PostgreSQL RPC `record_lesson_quiz_completion` invocation.
  9. Non-swallowed XP error propagation on fallback.
  10. Progress reset badge categorization and revocation.
  11. Module-specific badge recalculation.
  12. Zero false-positive admin audit logs on dual-role routes.
  13. Verified admin access on dual-role routes.
  14. Audited unauthorized access attempts on admin-only routes.
  15. Unauthenticated rejection (401) without false-positive audit logs.

---

## Validation Results
- **Vitest T2 Test Suite:** 19/19 tests passed (`phase-t2-backend-reliability.test.ts`).
- **Vitest T1 Regression Suite:** 15/15 tests passed (`phase-t1-security-hardening.test.ts`).
- **Vitest Notification & Email Suites:** 25/25 tests passed (`notifications.test.ts`, `email-automations.test.ts`, `curriculum-access-override.test.ts`).
- **Total Tests Passing in Phase T2:** 59/59.
- **TypeScript Typecheck (`tsc --noEmit`):** 0 errors.
- **ESLint on Modified Files:** 0 errors, 0 warnings.

---

## T1 Regression Results
- Certificate security, UUID validation, and tamper prevention: **VERIFIED PASSING** (15/15 tests).
- Account deletion auth-user cleanup: **VERIFIED INTACT**.
- Scalable email lookup by index: **VERIFIED INTACT**.
- Password error sanitization: **VERIFIED INTACT**.
- Zero regressions against Phase T1 commit `681f34b51ffb3d12018032eb642b35e8c9a8169b`.

---

## Findings Deferred to T3/T4/T5
- **T3 (Performance & Query Architecture):**
  - Notification queue cron pagination and batch worker sizing.
  - Admin audit logs pagination and date filtering.
  - Flashcard SRS batch aggregation.
- **T4 (Client-Side & Frontend Consistency):**
  - Settings UI toast feedback and dirty form state handling.
  - Navigation state retention across module lessons.
- **T5 (Operational & Observability):**
  - Email bounce and complaint webhook ingestion.
  - Health checks and provider failover alerting.

---

## Remaining Risks
- The PostgreSQL RPC `record_lesson_quiz_completion` requires applying migration `20260925000002_phase_t2_backend_reliability.sql` to the target database before RPC execution occurs in live environments. The application code provides a resilient, non-swallowing fallback path if the RPC is temporarily unavailable during deployment rollout.

---

## Changed Files
- `apps/web/app/api/settings/notifications/route.ts`
- `apps/web/lib/academy/lessons-db.ts`
- `apps/web/lib/admin/guard.ts`
- `apps/web/lib/api/actor.ts`
- `apps/web/lib/notifications/in-app/service.ts`
- `apps/web/lib/notifications/preferences/defaults.ts`
- `apps/web/lib/notifications/queue/processor.ts`
- `apps/web/lib/settings/settings-service.ts`
- `apps/web/lib/__tests__/phase-t2-backend-reliability.test.ts`
- `supabase/migrations/20260925000002_phase_t2_backend_reliability.sql`
- `docs/audits/PRODILY_TECHNICAL_REMEDIATION_T2.md`

---

## Final Diff Summary
- **Preference Source of Truth:** Replaced hardcoded default preferences with database resolution (`user_notification_preferences`) and batched lookups across queue processor and in-app service.
- **XP Performance & Correctness:** Scoped user update triggers to avoid table scans on unrelated profile updates and eliminated trigger recursion while adding ledger delete/update triggers.
- **Lesson Completion Atomicity:** Wrapped quiz attempts, lesson progress, and XP awarding in an atomic PostgreSQL RPC transaction with robust error propagation.
- **Badge Consistency:** Added progress-derived badge synchronization on account progress resets while safeguarding account-level badges.
- **Admin Audit Logging:** Added silent checking mode for dual-role route resolution, eliminating false-positive `access_denied` records from legitimate learners.
