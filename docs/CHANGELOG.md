# Prodily Repository Changelog

All notable changes to **Prodily** (`prodily-monorepo`) are documented in this file, newest first. Hashes are short SHAs on `main` unless an entry says otherwise. Plan IDs (PR-01, SEC-07 and so on) refer to [`../08-IMPLEMENTATION-PLAN.md`](../08-IMPLEMENTATION-PLAN.md) and the audit in [`../audit/00-INDEX.md`](../audit/00-INDEX.md). Remaining work is in [`ROADMAP.md`](ROADMAP.md).

## [Unreleased: post-Phase 3 cleanup] (branch `chore/post-phase3-cleanup`)

Not merged yet. Follows the dead-code "Phase 3" (PR #79) with the removals it deferred, a `knip` sweep and a documentation refresh.

### Removed
- **Waitlist**: the `/api/waitlist` route and its `proxy.ts` entries, the `waitlist_signup` analytics event and `trackWaitlistSignup()`, `buildWaitlistConfirmationEmail()` in `lib/email.ts`, and the waitlist types (`ROLE_OPTIONS`, `RoleOption`, `WaitlistFormValues`, `WaitlistPayload`). No UI posted to the route. The `public.waitlist` table is **not** dropped yet: the drop is held in `supabase/migrations/pending-approval/20261112000001_drop_waitlist_table.sql` (with rollback and validation) until the owner exports the rows.
- **Retired flags** `ACHIEVEMENT_EMAIL_ENABLED` and `PORTFOLIO_EMAILS_ENABLED`: defaults, types and admin toggles. Nothing read them at runtime. The stored values are cleaned by the held `pending-approval/20261112000002_remove_retired_notification_flags.sql`, which removes them from the `system_settings` `feature_flags` jsonb and from `notification_feature_flags`. Run it only after this code is deployed.
- **Unused components**: `DashboardNotificationsWidget`, `BadgeShowcaseCard`, `CapstonesOverviewCard`, the marketing product-mockup previews (`lesson-card-preview`, `module-card-preview`, `xp-row-preview`) and the marketing sections `community` and `testimonials`. Tests and allowlists updated.
- `lib/xp/duplicate-analysis.ts` and its test (the B8-D/B8-E work it supported is finished).
- **knip sweep**: dead types in `types/index.ts` (`ApiSuccess`, `ApiError`, `QuizQuestion`, `FlashcardItem`, `LessonMeta`, `FeatureItem`, `TestimonialItem`; `CompiledLessonRef`, `CompiledFlashcard` and `CompiledGlossaryEntry` are now module-private); `EXPERIENCE_FEATURES`, `COMMUNITY_FEATURES`, `TESTIMONIALS` and `PORTFOLIO_ARTIFACTS` in `config/content.ts`; `LEVEL_TITLES` and `getTitleForXp` in `lib/xp/xp.ts`; the `BrandMarkProdigy` alias; unused imports in 7 production files; the dead `onCompare` prop and Compare button in `LeaderboardTable`, with the stale `ProfileComparisonModal` ESLint entry. Test allowlists tightened to match.
- The retention rule for the dropped `user_notification_timeline` table, and the account-deletion entries for the dropped `bookmarks` and `user_notification_timeline` tables.

### Added
- `supabase/migrations/rollback/20261031000001_phase3_drop_unused_tables.down.sql`: structure-only rollback for the Phase 3 drop. Rows are not restored, and `sync_user_xp` comes back `service_role`-only. Notes added to the `rollback/20261018000001_*` files, which still reference the dropped `sync_user_xp`.
- [`ROADMAP.md`](ROADMAP.md) (remaining work), `tasks/antigravity/` (task files for that work), `.agents/` (rules and a verify skill), and a rewritten root `AGENTS.md` (it pointed at a `.tokencap/` folder that does not exist).

### Changed
- `@types/qrcode` moved to `devDependencies`. The lockfile also dropped a stale `optional` flag on `@emnapi/wasi-threads`.
- Docs refreshed across `docs/`: Next.js 16.4.3, 70 top-level migrations, 304 tracked test files, FlexSearch claims replaced (search is a compiler-built JSON index served by `/api/search-index`), "Prodily PM Academy" renamed to "Prodily", and links into the deleted `docs/archive/` now cite the deleting commit. README quickstart is `npm ci --prefix apps/web`. `tasks/google-oauth-plan.md` marked implemented (flag off).

## [PR #82: Supabase deploy fix] (2026-11-09)

Commit `777c36a`, merged as `41ce885`.

- `deploy-supabase` CI job: `supabase db push` now runs with `--include-all --linked --yes`, and the dry-run check with `--include-all --linked`.
- `supabase/config.toml`: `[auth.email]` and `[auth.sms]` use `enabled` in place of the deprecated `enable_signup` key.

## [Phase 3: dead-code pruning] (PR #79, merged 2026-11-09)

Commits `f44293f` (audit doc), `35dfe84`, `306853e`, `ce95199`, `710c174`, `6876fb7` and `18e0e0b`; merged as `0b04fd0`. "Phase 3" here means the dead-code batches 3-A to 3-D in [`DEAD_CODE_AUDIT.md`](DEAD_CODE_AUDIT.md), not plan Phase 3 (PR-14 to PR-20, platform safety), which is mostly not started.

- **Components** (`35dfe84`, `6876fb7`): removed `marketing/feature-card.tsx`, `marketing/testimonial-card.tsx`, `marketing/sections/faq.tsx`, `badges/BadgeNotification.tsx`, `leaderboard/ProfileComparisonModal.tsx`, `progress/ProgressSectionDropdown.tsx`, `feedback/error-state.tsx`, `feedback/success-state.tsx`, `ui/accordion.tsx`, `ui/badge.tsx`, `ui/card.tsx`, `ui/select.tsx`, `ui/toast.tsx`, `hooks/useXpAnimation.ts` and `emails/components/ProgressBar.tsx`. `NotificationBell.tsx` and `NotificationToast.tsx` were kept: they are mounted in `components/layout/Topbar.tsx`.
- **Backend** (`306853e`, `6876fb7`): removed `/api/dev/send-test-email`, `/api/admin/system/storage-cleanup`, `lib/search.ts`, `lib/animation.ts`, the `lib/admin/index.ts` barrel, the disabled `lib/campaigns/portfolio-activation-runner.ts` (shrunk in `306853e`, deleted in `6876fb7`), and the duplicate `'system.weekly_recap'` email template key.
- **Correction:** `/api/cron/retry-failed` was **kept**, and so was the manual `retry-failed-emails` job in `.github/workflows/notification-scheduler.yml`. The route is used by the cron heartbeat (`lib/monitoring/cron-heartbeat.ts`), the admin system service (`lib/admin/system-service.ts`) and that workflow job. An earlier version of this entry said both were removed. `/api/waitlist` was also kept in this PR; it was removed later on `chore/post-phase3-cleanup`.
- **Database** (`ce95199`, `6876fb7`): migration `20261031000001_phase3_drop_unused_tables.sql` drops `weekly_leaderboard_snapshots`, `bookmarks`, `email_dead_letter`, `user_notification_timeline` and `sync_user_xp`. `types/database.ts`, the queue processor and the notifications admin service no longer touch them; permanent email failures stay in `email_queue` with status `'dead_letter'`. The migration shipped without a rollback file; one was added on `chore/post-phase3-cleanup`.
- **Dependencies** (`710c174`, `18e0e0b`): **5** packages removed net (`bail`, `hermes-parser`, `lightningcss`, `mdn-data`, `@types/mdast`). `710c174` also removed `@emnapi/core` and `@emnapi/runtime`, but CI needs them, and `18e0e0b` restored both to `devDependencies`. An earlier version of this entry said 7.
- **Scripts** (`710c174`): removed 5 tracked scripts (`scripts/backup/postgrest-data-export.ts`, `scripts/benchmark-concurrency.ts`, `scripts/compiler/tests/compare-v1-v2.ts`, `scripts/compiler/tests/test-all-shapes.ts`, `scripts/diagnostics/xp-duplicates.ts`) and the `test:parity` and `benchmark` npm scripts. `apps/web/scripts/send-jolly-recovery-email.ts` is gitignored and was never tracked, so no commit removes it.
- **Types** (`6876fb7`): removed `MarketingModule` and `ParsedLesson` from `types/index.ts`.
- Reported at the time: 305 test files and 4,566 tests passing, and a clean `tsc --noEmit`.

## [Phase 2: trust and correctness] (PR #73, merged 2026-10-31)

Commit `002fb0f` (plan PR-05 to PR-13), with CI follow-ups `df7cc94` and `20cd137`; merged as `a893dbf`.

- Measurement foundation (PR-05): `quiz_submitted` and `lesson_completed` product events sent via `after()`, plus share, moderation, certificate and referral events, and `POST /api/portfolio/share`.
- Server-side trust (SEC-07, SEC-08): client writes on `users` and capstones locked, session-free server paths, quiz attempts validated against lesson content and access. Atomic quiz-completion RPC (CQ-05).
- Function region pinned to `bom1`, next to Supabase `ap-south-1` (PR-09).
- Scheduled email (PR-11, ENG-01): cron heartbeats, ISO send-window logic, out-of-band alerts, and a pg_cron schedule held for the owner.
- Scoped capstone draft autosave and fresh callbacks in the usage-time tracker (CQ-08, CQ-09).
- The commit title covers PR-05 to PR-13; the message details only the items above, so PR-07, PR-08, PR-10 and PR-12 are judged done from the code, not from the commit message.
- **Owner steps not done yet.** [`ops/phase2-owner-runbook.md`](ops/phase2-owner-runbook.md) lists them in order: region check, Vault secrets, and the held SQL in [`supabase/migrations/pending-approval/`](../supabase/migrations/pending-approval/README.md) (`20261024000003` pg_cron schedule, `20261027000001` username CHECK, `20261027000002` lock `public.users`, `20261030000001` cron dead-man check, `admin_backfill_from_admin_emails.sql`).

## [Phase 1: stop the bleeding] (PR #64, merged 2026-10-21)

Commit `01d5915` (plan PR-01 to PR-04), with `af5bea5`, `ea3bb33` and the docs removal `f4343d3`; merged as `bd8981c`.

- Database permissions locked down (PR-01; SEC-01, -02, -03, -05, -06, -22): migration `20261018000001` revokes the quiz-completion and `sync_user_xp` RPCs from `anon` and `authenticated`, drops the `public_profiles` view, removes the open `email_broadcasts` and `fellow_requests` policies and the learner testimonial insert policy, and pins `search_path`. Ships rollback, validation and read-only forensics scripts.
- Admin access comes only from `users.is_admin` (SEC-04, SEC-17); `ADMIN_EMAILS` is no longer read. The console refuses self-demotion, demoting the last admin and deleting an admin. The owner backfill by UUID is held in `pending-approval/`.
- Correctness (CQ-01, -02, -03, -31): the weekly summary covers only the 7-day window; suppression and preference read failures block non-critical sends; the portfolio-activation campaign is refused.
- UX and SEO (UX-01, -02, SEO-02, -04): avatar falls back to the learner's initial, quiz and flashcard keyboard handling scoped, `robots.txt` fixed, `/glossary` redirects to `/frameworks`.
- Google sign-in shipped behind `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`, **off** by default (`af5bea5`).

## [B8-E — XP Event Uniqueness] — 2026-09-13

Migration `20260913000001_xp_event_uniqueness_b8e.sql` applied to production at 18:15:34Z.
**Destructive:** removed 31 duplicate `theory_read` XP events, 310 XP across 13 users.

- Added a **partial** unique index over `(user_id, source_type, source_id)` scoped to the
  six once-only sources: `theory_read`, `quiz_bonus`, `reflection`, `streak`,
  `referral`, `capstone`. Repeatable sources — `quiz_correct` (incremental top-up),
  `flashcard` (once per day per card) and `user_reset` — remain deliberately
  unconstrained.
- Affected users' `total_xp` and `level` re-derived from the ledger. All 13 reconcile
  exactly; **no learner lost a level**; no unaffected user changed.
- Uniqueness observed in production: a duplicate `theory_read` insert is refused with
  SQLSTATE 23505, which `awardXp()` treats as already-awarded.
- Executed **direct-to-production by explicit approval, without a staging project**.
  Pre-migration backup: data-only PostgREST export (not a `pg_dump`).

Execution record: `docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md`, deleted in `1dbd2a4`. Read it with `git show 1dbd2a4^:docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md`.

## [Repository Cleanup] — 2026-09-13

Deployed as `76bc600`. Housekeeping only — no application behaviour changed.

- Removed five components verified unreferenced across every source root, two unused
  dependencies (`@vercel/speed-insights`, `flexsearch`) and the empty root
  `pnpm-lock.yaml`.
- Renamed 11 test files from historical phase/batch labels to the behaviour they
  protect. No test was deleted; all 1536 still pass.
- Retired `docs/audits/`. Thirteen completed audits, incident investigations and batch
  records moved to `docs/archive/`, kept as traceability, not guidance. `docs/archive/`
  was later deleted in `1dbd2a4`; list it with `git show 1dbd2a4^:docs/archive/`. The
  B8-E investigation was promoted to `PENDING_B8E_MIGRATION.md` (later
  `docs/archive/B8E_XP_UNIQUENESS_EXECUTION.md`) because it documented a pending operation rather than history.
- Corrected three dead-code claims that were wrong: `MarkdownRenderer` and `QuizOption`
  are live, and `lib/hooks/useUsageTimeTracker.ts` is a tested re-export shim.
- **B8-E was held** in `supabase/migrations/pending-approval/` and not applied by this change. It was applied later the same day — see the B8-E entry above.


## [Email Reliability & Observability Pass] — 2026-09-08

Architecture decisions: [`docs/decisions/`](decisions/). Requires migrations `20260907000001_email_provider_failover.sql` and `20260908000001_error_taxonomy.sql`.

### Fixed
- **Queue had no provider failover**: `processEmailQueue()` resolved one provider and retried the *same* one on every cycle, so Resend was never attempted. This was the actual cause of "Resend fallback isn't working". Now dispatches through `sendEmailWithFailover()` — one secondary attempt, never a third. ([ADR-001](decisions/ADR-001-email-provider-resolution-and-failover.md))
- **Capacity exhaustion was classified permanent**: Brevo answers a spent allowance with 402/429, both below 500, so the 2026-09-07 policy blocked failover exactly when it was needed. 402/408/429 are now failover-eligible; containment stays with the pre-dispatch quota gate and signup rate limiting. **Supersedes the fallback entry below.** ([ADR-002](decisions/ADR-002-provider-failure-classification.md))
- **Split primary-provider resolution**: `lib/email.ts` preferred Resend while the registry preferred Brevo when `PRIMARY_EMAIL_PROVIDER` was unset. Both now share `resolvePrimaryProvider()`.
- **Auth email failures were invisible**: `/api/auth/send-email-hook` and `lib/email.ts` emitted only `console.error`, producing zero `system_errors` rows for signup verification and password reset.
- **Brevo failures wrote nothing**: the `system_errors.category` CHECK omitted `'brevo'`, so every insert violated it and was swallowed by the logger's warn-and-continue path.
- **Deduplication broke after the second occurrence**: a multi-row `.maybeSingle()` returned an error that was discarded, inserting duplicates instead of grouping. Now orders, takes one row, and increments `occurrence_count`.
- **Admin actions reported false success**: production-send treated a status the processor never writes as its only failure case; retry actions left `next_retry_at` set so requeued items stayed unclaimable; a failed alerts query rendered as the green "no alerts" state.
- **Queue correctness**: the non-RPC fallback claim never incremented `attempt_count` (infinite retry); dead letters lost their user, template and variables; hard bounces were never suppressed.
- **Feature flags never left process memory**: each serverless instance served compiled defaults, so the `EMAIL_ENABLED` kill switch had no effect on the cron running the queue. ([ADR-003](decisions/ADR-003-db-backed-configuration-control-plane.md))

### Added
- Structured error taxonomy — domain, kind, retryability, derived severity, next action — with admin facets. ([ADR-004](decisions/ADR-004-structured-error-taxonomy.md))
- Two-layer secret redaction covering Brevo keys, JWTs, database credentials, session tokens and one-time auth tokens, applied to messages, `details`, dead-letter variables and API responses. ([ADR-005](decisions/ADR-005-sensitive-data-redaction.md))
- Additive API error contract: `{ success, error, code, errorId }`. ([ADR-006](decisions/ADR-006-api-error-response-contract.md))
- `email_queue.provider` / `provider_attempts` for per-attempt provider tracking.

### Changed
- Admin settings controls that persisted a value nothing read were removed rather than left implying enforcement. See [`admin/platform-settings.md`](admin/platform-settings.md) §3.G.

### Known limitations
- No circuit breaker on failover; ~18 admin routes still return raw error messages; alert facets are client-side. Tracked in [`ISSUES_KNOWN.md`](ISSUES_KNOWN.md) under Deferred.

---

## [Signup Abuse Incident Response] — 2026-09-07

Full incident writeup: `docs/archive/INCIDENT_2026-09-06_SIGNUP_ABUSE.md`, deleted in `1dbd2a4`. Read it with `git show 1dbd2a4^:docs/archive/INCIDENT_2026-09-06_SIGNUP_ABUSE.md`.

### Fixed
- **Signup rate limiting**: `/api/auth/signup` had zero throttling of any kind. Added persistent, cross-instance IP (5/15min) and canonical-email (3/24h, collapsing Gmail `+tag` aliases) rate limits.
- **Email daily quota never actually enforced**: `increment_daily_email_quota()` was called *after* a successful send with its result discarded, so the documented ~100/day cap did nothing. Moved the check before dispatch in the queue processor so it now actually gates sending.
- **Brevo↔Resend fallback too broad**: previously fell back on *any* provider failure, including quota exhaustion. Now only falls back on transient failures (timeout/network/5xx), not permanent ones (4xx).
- **Webhook bounce diagnostics**: `/api/email/webhooks` mislabeled all bounce/failure events as `"Resend event: ..."` even when they came from Brevo.

### Operational
- Production `allowSignups` flag set to `false` (existing DB-backed feature flag) to stop new registrations immediately while the above was investigated and fixed. Existing users (login, password reset, email change) unaffected.

## [Bug Fixes, Portfolio Verification & Documentation Audit] — 2026-09-06
### Fixed
- **Friend Accountability**: `addFriend()` no longer fails on non-UUID usernames (root cause: a `.or()` filter that broke Postgres query typing).
- **Email Change Verification Redirect**: confirmation links now land on a dedicated `/email-verified` success/error page instead of an unrelated destination; `public.users.email` is kept in sync with `auth.users.email`.
- **Portfolio OG Card**: replaced an invented dark palette with the real Prodily light-theme brand identity (colors, logo, layout).

### Added
- **Automatic Portfolio Verification**: eligibility-based verification (avatar + bio + ≥2 of 3 links) distinct from PM Fellow, with admin override.
- **Email Template Variable Tooling**: shared variable catalog, click-to-insert, and unknown-variable validation in the admin template editor and create-template modal.

### Documentation
- Full repository documentation audit against current code: corrected wrong database table names, fabricated curriculum module list, stale test/migration counts, an incorrect non-negotiable "no global leaderboard" product invariant, and multiple other doc/code mismatches. Added `docs/LEADERBOARD.md` and `docs/admin/fellow-designation.md`.

## [Prodily Evolution & Platform Improvements] — 2026-09-04
### Phase 1: UI/UX & Learning Experience
- **Leaderboard 2.0**: Added dynamic tier engine (`Bronze`, `Silver`, `Gold`, `Diamond`, `Fellow`) with points-to-next-rank delta indicators.
- **Progress Continuity**: Implemented sequential path resolver with prominent "Recommended Next Action" hero card.
- **Capstone Deliverable Readiness**: Added live word-count and deliverable readiness indicators in the workspace.
- **Interactive Concept Checks**: Created inline reflection checkpoints (`InlineConceptCheck.tsx`) across frameworks & mental models.

### Phase 2: Admin Panel & Operational Control
- **Leaderboard Management Surface**: Added `/admin/leaderboard` route, service (`LeaderboardAdminService`), and UI (`AdminLeaderboardView.tsx`) with anomaly detection and privacy toggles.
- **Searchable Learner Picker**: Created `AdminUserMultiSelectPicker.tsx` with debounced search, autocomplete, and removable chips.
- **Safety Guardrails**: Added confirmation modal before broad notifications (>25 recipients or "All").

### Phase 3: Backend & Data Scale
- **Leaderboard Query Caching**: Added 45s in-memory TTL caching on `getWeeklyLeaderboard` to eliminate database join overhead.
- **Real-Time Weekly Recaps**: Aggregated exact weekly XP from `xp_events` and completed lessons from `user_lesson_progress`.
- **Cron Idempotency**: Verified deterministic `eventId` deduplication for all automated notifications.

### Phase 4: Infrastructure & Monitoring Hardening
- **Public Health Endpoint**: Implemented `/api/health` checking database connectivity and returning telemetry headers.
- **Monitoring Verification**: Added unit tests in `system-monitoring.test.ts`.

## [Phases 1–10 Hardening & Production Rebuild] — 2026-08-24
### Phase 1: Repository Baseline, Audit Reconciliation & Production Data Integrity
- Standardized lesson progress IDs to `les_` format across production database (137/137 rows reconciled).
- Verified remote Supabase database migration state across all tables.

### Phase 2: Critical Admin Moderation & Data Mapping Fixes
- Resolved `users.full_name` vs `users.name` schema mismatch across admin services.
- Corrected feedback and testimonial moderation queries and mappings.

### Phase 3: Cache Invalidation, Verification State & Admin Correctness
- Added `revalidateTag('testimonials')` to testimonial approval/rejection mutations.
- Linked admin verification status to authoritative Supabase Auth `email_confirmed_at` timestamps.
- Hardened dashboard error handling against service-role connection failures.

### Phase 4: Authentication Error Classification & User Experience
- Built centralized `classifyAuthError` helper in `lib/auth/errors.ts` mapping raw Supabase/browser exceptions into safe, user-friendly error categories.
- Eliminated raw SDK/JSON error leaks on login, signup, forgot password, and admin authentication flows.

### Phase 5: Authentication Reliability, Ghost Accounts & Email Hook Hardening
- Hardened Supabase Send Email Hook (`/api/auth/send-email-hook`) with 8-second bounded execution timeouts (`AbortSignal.timeout(8000)`).
- Implemented HTTP status code mapping (429, 502, 503, 504), Brevo provider fallback, and masked email PII logging.

### Phase 6: Client Authentication Telemetry & Admin Observability
- Added client-side telemetry endpoint (`/api/auth/telemetry`) with rate-limiting and PII sanitization.
- Built real-time admin authentication observability dashboard (`/api/admin/system/auth-health`).

### Phase 7: Avatar Upload Reliability, Storage Consistency & Cleanup
- Created transactional `AvatarService` in `lib/avatar/avatar-service.ts` with safe replacement ordering and DB failure rollbacks.
- Built storage orphan cleanup scanner in `/api/admin/system/storage-cleanup`.

### Phase 8: Capstone State Consistency, Progress Integrity & Submission Reliability
- Built `validateCapstoneTransition` state transition validator in `lib/capstones.ts`.
- Implemented duplicate submission idempotency protection and atomic XP/streak updates in `lib/capstones-db.ts`.
- Added bidirectional cache revalidation for learner and admin moderation queues.

### Phase 9: Database, Query & Application Performance Optimization
- Eliminated unbounded `auth.admin.listUsers` scans; used page-scoped lookups and bounded health probes.
- Added lean column projections (`select('lesson_id, status')`) on learner dashboard and progress queries.
- Added tagged `unstable_cache` for curriculum overviews (`admin-curriculum`).
- Created migration `20260824000001_phase9_perf_indexes.sql` with targeted composite indexes.

### Phase 10: Final Admin/UI Hardening, Accessibility, Cleanup & Production Readiness
- Fixed component library resolution with native React Accordion.
- Verified 100% test pass rate across 52 test suites (405 tests).
- Verified RLS, environment variable hygiene, and accessibility focus management.

---

## [Documentation Cleanup] — 2026-08-23
### Changed
- **Documentation**: Deleted 11 obsolete documents from `docs/`: `IMPLEMENTATION_PHASES.md`, `MASTER_ENGINEERING_STATUS.md`, `VERIFIED_AUDIT.md`, `TARGET_ARCHITECTURE.md`, `REBUILD_INVENTORY.md`, `PRODUCTION_READINESS.md`, `TESTING_STRATEGY.md`, `AUTHENTICATION_ARCHITECTURE.md`, `KNOWN_ISSUES.md`, `Prodily_Quick_Start_Feature.md`, `Prodily_SEO_GEO_AEO_6_Phase_Implementation_Plan.md`. These were pre-implementation planning documents, historical audit reports, and agent-execution specifications that no longer represent the current system state.
- **Documentation**: Updated `DATABASE.md` (corrected migration count to 30, added all new migrations, added type safety section), `TESTING.md` (reflects Vitest + Playwright, 44 test files, e2e specs), `ARCHITECTURE.md` (updated tech stack, migration count, test framework, known architectural debt), `AUTHENTICATION.md` (documents current custom bridge with known gap note), `CRON_AND_SCHEDULING.md` (reflects email-cron.yml removal), `DEPLOYMENT.md` (reflects vercel.json cleanup done), `MEMORY.md` (corrected migration count), `INDEX.md` (updated to reflect clean doc set).

---

## [Notification Idempotency & Avatar Cleanup] — 2026-08-23
### Changed
- Migration `20260823000001_notification_idempotency_and_avatar_cleanup.sql`: Added notification idempotency keys and avatar cleanup.

---

## [System Announcements & Performance] — 2026-08-22
### Changed
- Migration `20260822000001_system_announcements_and_perf.sql`: Added system announcements table and performance indexes.

---

## [Phase 3 — Onboarding & Storage] — 2026-08-19
### Added
- Migration `20260819000001_phase3_onboarding_storage.sql`: Onboarding storage additions.

---

## [Testing & Type Safety Rebuild] — 2026-08-21
### Added
- `apps/web/vitest.config.mts`: Vitest unit and integration test runner configuration.
- `apps/web/vitest.setup.ts`: Test environment setup with mock env fallbacks.
- `apps/web/playwright.config.ts`: Playwright E2E test configuration.
- `apps/web/e2e/auth/login.spec.ts`: E2E spec for login, session persistence, logout.
- `apps/web/e2e/auth/protected-routes.spec.ts`: E2E spec for unauthenticated redirection and admin access gates.
- `apps/web/e2e/auth/password-reset.spec.ts`: E2E spec for password reset flow.
- `apps/web/lib/__tests__/rls.test.ts`: Real RLS integration test suite (replaces the false-passing `rls-service-role.test.ts`).
- `apps/web/types/database.ts`: Complete auto-generated Supabase TypeScript schema.
- Multiple new test files: `middleware-auth.test.ts`, `phase1-learning-notifications.test.ts`, `phase2-announcements-performance.test.ts`, `phase3-final-integrity.test.ts`, `final-learner-notification-integrity.test.ts`, `quick-start.test.ts`, `settings.test.ts`, `achievements-aggregation.test.ts`, `admin-email-test-send.test.ts`, `admin-settings.test.ts`, `curriculum-access-override.test.ts`, `dev-certificate.test.ts`, `unsubscribe.test.ts`.

### Changed
- `apps/web/lib/supabase.ts`: Refactored to re-export `Database` type from `types/database.ts` instead of inline manual definitions.
- `apps/web/package.json`: Updated `"test"` script to `"vitest run"` (replacing legacy tsx chain).
- Deleted `apps/web/lib/__tests__/rls-service-role.test.ts` (always-passing false-confidence test).

### Changed (Deployment)
- Deleted root-level `vercel.json` (Phase 0 Vercel cleanup — Vercel Dashboard uses `Root Directory: apps/web`).

---

## [Post-Phase 10 Consolidation] — 2026-08-16
### Changed
- **Documentation**: Deleted `docs/admin-panel-ui-ux-spec.md` and `docs/admin-panel-implementation-plan.md` (planning documents, fully superseded by implementation). `docs/ADMIN_PANEL.md` rewritten as the primary, current Admin Panel reference.
- **`docs/INDEX.md`**: Removed entries for the two deleted planning documents; updated `ADMIN_PANEL.md` description.
- **`/admin/feature-flags`**: Fixed legacy redirect from `/admin/content` → `/admin/settings?section=feature-flags` (the correct location per final IA).
- **`/admin/content`**: Replaced legacy content page with a redirect to `/admin/curriculum` (curriculum metrics) since the old page mixed curriculum stats + feature flags — both now have proper homes in the new IA.

---

## [`87b8b5a`] — 2026-08-16
### Changed (Phase 10 — Final Production UI/UX Polish)
- `AdminHeader`: Added `/admin/curriculum` to TITLES map; extended dynamic title derivation to cover nested curriculum, lesson and template editor routes.
- `error.tsx` (admin console error boundary): Accepts both `reset` (Next.js standard) and `unstable_retry` (legacy); added `cursor-pointer` and `focus-visible` ring to the Try Again button.
- `AdminDataTable`: Added `focus-visible:ring-2` to sortable column header buttons (previously had no keyboard focus indicator).
- `AdminPagination`: Added `focus-visible` rings + `cursor-pointer` to all page buttons; added `font-bold` to active page for stronger non-colour distinction.
- `AdminRangeSelector`: Added `focus-visible` rings to preset buttons and date inputs; added `px-2` padding to custom date range container.
- `AnalyticsWorkspace`: Added `focus-visible` rings and `cursor-pointer` to tab nav links and Export button.

---

## [`cad3bb8`] — 2026-08-14
### Added
- Admin Panel Phase 2 (Dashboard / Operations Center): added `recharts` 3.x dependency (MIT, free) for dashboard time-series visualizations.
- Rebuilt `/admin` dashboard: date-range selector (Today/7D/30D/90D/Custom via `?range=` search params), Attention Center, 8-KPI grid with prior-period trends, Learner Activity + Learning Activity Recharts, all-time Learning Funnel, Recent Activity timeline, and System Snapshot.
- Added pure aggregation helpers in `lib/admin/dashboard-aggregation.ts` with `npm run test:dashboard` (12 unit tests).
- Post-review hardening: fixed Active Learners trend, added time-based header greeting, added Learning Activity metric switching, made Total Users & Verified Users cumulative with growth trends, derived System Snapshot Database/Auth/Email status from live telemetry.

---

## [`490fea3`] — 2026-08-10
### Fixed
- Fixed ESLint `prefer-const` error in `/api/admin/emails/production-send/route.ts`.
- Removed unused `logSystemError` import in `lib/__tests__/audit-fixes.test.ts`.

---

## [`e9f5d7d`] — 2026-08-10
### Fixed
- Fixed silent failure in Admin Verification Resend by unifying `supabase.auth.admin.generateLink()` with Production Email Queue (`email_queue`) and immediate `processEmailQueue()` Resend delivery dispatch.
- Injected generated `action_link` as `verificationUrl` into `auth.verify_email` template.
- Added regression test case to `lib/__tests__/audit-fixes.test.ts`.

---

## [`5f720c9`] — 2026-08-10
### Added
- Created `lib/__tests__/audit-fixes.test.ts` test suite.
- Added `isVerified` and `emailConfirmedAt` fields to `AdminUserOverview` and `AdminUserDetail` interfaces.
- Added **Verified** (emerald) vs **Unverified** (amber) status badges in Admin Users view.
- Added **Admin Resend Verification Email** action button in User Detail Drawer.
- Added `logSystemError()` instrumentation for missing target user lookup in production email send endpoint.
- Updated signup page to detect existing account responses (`data.user.identities.length === 0`) and present direct **Go to Login →** link button.

---

## [`9456128`] — 2026-08-10
### Added
- Completed error monitoring instrumentation across `/api/email/webhooks` and cron endpoints (`/api/cron/*`).
- Added secret sanitization (`sanitizeErrorDetails()`) and 15-minute fingerprint deduplication to `logSystemError()`.
- Created `public.system_errors` and `public.rate_limits` database tables (`20260810000009_create_system_errors_and_rate_limits.sql`).

---

## [`6256717`] — 2026-08-10
### Added
- Implemented persistent 60-second rate limiter in `public.rate_limits` for user-facing verification resends (`/api/auth/resend-verification`).
- Implemented viewport-bounded fixed panel positioning for Notification Center on mobile viewports (<640px).
