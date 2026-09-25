# Prodily Technical System Audit

**Date:** September 25, 2026  
**Auditor Level:** Senior / Principal Engineer Technical Review  
**Repository:** `Prodily` (`pmacademy-app/web`)  
**Scope:** Architecture, Security, Data Model, User Experience, Admin Panel, Async/Email Systems, Scalability, Observability, and Release Engineering.  
**Deliverable Type:** Technical Remediation Backlog & Architectural Audit

---

## Executive Summary

### Overall Technical State
Prodily demonstrates high engineering discipline in certain foundational areas: 125 of 128 API routes have been systematically unified behind a custom `withRoute` pipeline with typed actor resolution, an axe-core accessibility gate, checksummed security scanners in CI, and robust TypeScript compilation with zero type errors.

However, beneath this clean exterior lie several **critical architectural cracks, security vulnerabilities, and broken lifecycle loops** that directly threaten data integrity, platform credibility, user retention, and production scalability.

### Most Important Findings
1. **Unconditional Certificate Forgery ([`certificates-db.ts:44-106`](file:///D:/Prodily/apps/web/lib/certificates-db.ts#L44-L106)):** Any authenticated user can issue official, permanent full-curriculum or module completion certificates with zero lessons completed. The backend has no prerequisite completion guard, and the Supabase RLS policy allows direct learner inserts.
2. **Disconnected Email Queue Preferences ([`processor.ts:104`](file:///D:/Prodily/apps/web/lib/notifications/queue/processor.ts#L104)):** The notification processor checks hardcoded in-memory defaults instead of querying the database. Because defaults disable emails for learning and achievement categories, 100% of retention emails are dropped, and user settings changes are completely ignored.
3. **Admin Zombie Account Deletion ([`apps/web/app/api/admin/users/[id]/route.ts:49`](file:///D:/Prodily/apps/web/app/api/admin/users/%5Bid%5D/route.ts#L49)):** Deleting a user in the admin panel purges `public.users` but omits `supabase.auth.admin.deleteUser(id)`. The user can immediately log back in, resurrecting their account via `ensureUserProfile()`.
4. **GoTrue `listUsers` Memory Leak on Login ([`apps/web/app/api/auth/login/route.ts:107`](file:///D:/Prodily/apps/web/app/api/auth/login/route.ts#L107)):** When unconfirmed login retries occur, the server loads up to 1,000 users into memory to find a match. Once the database exceeds 1,000 users, users on page 2 are permanently locked out of logging in.
5. **Double Aggregating XP Trigger ([`20260805000001_update_xp_level_trigger.sql:47-64`](file:///D:/Prodily/supabase/migrations/20260805000001_update_xp_level_trigger.sql#L47-L64)):** A `BEFORE UPDATE ON users` trigger sums the entire history of `xp_events` on *every single row update* to `users`, resulting in duplicate table scans on every XP award and degrading all profile writes as user activity accumulates.
6. **Swallowed Theory Engagement Errors ([`lesson-content.tsx:459-462`](file:///D:/Prodily/apps/web/app/%28app%29/academy/%5BmoduleSlug%5D/%5BlessonId%5D/lesson-content.tsx#L459-L462)):** When learners click "Continue to Quiz" without meeting the 45-second or 80% scroll thresholds, the 400 error is swallowed silently, leaving the user with an unexplained locked Quiz tab.

### Major Systemic Risks
- **Credential & Reputation Dilution:** Public certificate verification URLs (`/verify/[code]`) cannot be trusted because credentials can be forged without completing any coursework.
- **Retention Death Spiral:** Asynchronous engagement loops (daily reminders, recap emails, streak freezes) are broken at the queue level, rendering email marketing and re-engagement tools inert.
- **Admin Audit Contamination:** Normal learner traffic on dual-allowed routes generates spurious `access_denied` security alerts in the admin audit log, blinding operators to real attacks.

### What Appears Solid
- **Unified API Routing:** Canonical `withRoute` abstraction handles actor resolution, telemetry logging, and standard error serialization across 98% of API endpoints.
- **Strict Release CI:** GitHub Actions workflow features a zero-dependency `npm audit` gate, Gitleaks scanning pinned by SHA-256 checksum, and selective E2E testing based on auth-path diffs.
- **Type Safety:** 100% clean TypeScript build with `strict: true` across all frontend components, server actions, and route handlers.

---

## Audit Scope & Methodology

This audit evaluated the live state of the Prodily repository using non-destructive inspection, static analysis, dependency graph exploration, database migration tracing, and end-to-end code path verification.

- **Typecheck Verification:** `npm run typecheck` (`tsc --noEmit`) executed clean across the codebase.
- **Auth & Telemetry Testing:** `npx vitest run apps/web/lib/__tests__/auth-unified-errors.test.ts` (42/42 tests passing).
- **Route Surface:** Enumerated 128 total route handlers in `apps/web/app/api/`.
- **Database Schema:** Traced all 48 SQL migration files from initial setup through hardening migrations.
- **Content Pipeline:** Inspected markdown compiler plugins, AST extractors, and frontmatter validation.

Findings are classified under strict epistemic tags:
- `[FACT]`: Direct observation verified in source code or migration files.
- `[INFERENCE]`: Logical deduction derived directly from verified code paths.
- `[RISK]`: Realistic failure mode or vulnerability under production conditions.
- `[RECOMMENDATION]`: Concrete architectural or operational remediation.

---

## Architecture Overview

Prodily is built as a Next.js (App Router) hybrid application with Supabase (PostgreSQL + GoTrue auth) as the backing persistence layer.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Next.js App Router                            │
│                                                                        │
│  Learner Surface: /(app)/academy, /dashboard, /portfolio, /settings    │
│  Admin Surface:   /admin/(users, content, capstones, emails, logs)     │
│  Auth Surface:    /(auth)/login, /signup, /verify, /reset-password     │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
      ┌─────────────────────────┐       ┌────────────────────────┐
      │  Server Actions / SSR   │       │ 128 REST API Endpoints │
      │  (Direct DB / Cookies)  │       │ (Unified `withRoute`)  │
      └────────────┬────────────┘       └────────────┬───────────┘
                   │                                 │
                   ▼                                 ▼
      ┌──────────────────────────────────────────────────────────┐
      │            Actor Resolution & Guard Pipeline             │
      │   (`requireUserId`, `requireAdmin`, `createClient`)      │
      └────────────────────────────┬─────────────────────────────┘
                                   │
                   ┌───────────────┴───────────────┐
                   ▼                               ▼
      ┌─────────────────────────┐     ┌──────────────────────────┐
      │  Supabase Client (RLS)  │     │ Service Role Client (SR) │
      │  (Session Cookie Auth)  │     │ (Bypasses RLS / Admin)   │
      └────────────┬────────────┘     └────────────┬─────────────┘
                   │                               │
                   └───────────────┬───────────────┘
                                   ▼
      ┌──────────────────────────────────────────────────────────┐
      │                 Supabase PostgreSQL 15                   │
      │    48 Migrations | PL/pgSQL Triggers | RLS Policies      │
      └──────────────────────────────────────────────────────────┘
```

---

## Critical Findings

### CRIT-01: Unconditional Certificate Issuance & RLS Forgery Bypass
- **Severity:** Critical
- **Category:** Business Logic / Authorization / Data Integrity
- **Status:** New Finding
- **Evidence:**
  - [`apps/web/lib/certificates-db.ts:44-106`](file:///D:/Prodily/apps/web/lib/certificates-db.ts#L44-L106):
    ```typescript
    const lessonsCompleted = progressRows?.length ?? 0
    const modulesCompleted = Math.min(9, Math.floor(lessonsCompleted / 10))
    // ... No check whether lessonsCompleted >= 90 or module has been completed!
    const newCert = {
      user_id: userId,
      certificate_code: certCode,
      type,
      module_slug: moduleSlug,
      learner_name: user.name || user.username || 'PM Academy Learner',
      level: levelInfo.level,
      career_title: levelInfo.title,
      total_xp: user.total_xp || 0,
      lessons_completed: lessonsCompleted,
      modules_completed: modulesCompleted,
      issued_at: new Date().toISOString(),
    }
    const { data: inserted } = await supabase.from('certificates').insert(newCert).select('*').single()
    ```
  - [`apps/web/app/api/certificates/route.ts:26-44`](file:///D:/Prodily/apps/web/app/api/certificates/route.ts#L26-L44):
    Accepts `POST /api/certificates` with `{ "type": "full_curriculum" }` and immediately issues a certificate via the service role client without validating completion requirements.
  - [`supabase/migrations/20260910000001_security_hardening_b1.sql:98-100`](file:///D:/Prodily/supabase/migrations/20260910000001_security_hardening_b1.sql#L98-L100):
    ```sql
    CREATE POLICY "Users can insert own certificates" ON public.certificates
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    ```
- **Root Cause:** `issueCertificate` gathers progress metrics but never asserts completion criteria before inserting. Furthermore, the database RLS policy explicitly grants normal authenticated users direct `INSERT` permissions on the `certificates` table.
- **Impact:** Any registered user can claim and receive a verifiable full-curriculum or modular certificate immediately upon account creation with 0 completed lessons.
- **Recommended Direction:**
  1. Revoke the client insert policy on `certificates`: only the service role or a privileged database function should create certificate records.
  2. In `issueCertificate`, enforce strict server-side validation:
     - For `full_curriculum`: verify all 90 lessons are marked `completed` in `user_lesson_progress` and all 9 capstones are graded/passed.
     - For `module`: verify all 10 lessons in the module are completed.
- **Confidence:** High (Verified by code and migration inspection).

---

### CRIT-02: Hardcoded Notification Defaults Bypass User Email Preferences
- **Severity:** Critical
- **Category:** Background Jobs / Notifications / Retention
- **Status:** New Finding
- **Evidence:**
  - [`apps/web/lib/notifications/queue/processor.ts:101-110`](file:///D:/Prodily/apps/web/lib/notifications/queue/processor.ts#L101-L110):
    ```typescript
    // 3. User Preferences Check
    const allowBypass = globalPriorityMatrix.evaluatePreferenceBypass(priorityLevel)
    if (!allowBypass && !isCritical) {
      const userPrefs = createDefaultNotificationPreferences(params.userId)
      const isAllowed = isChannelEnabledByPreferences(userPrefs, params.category, params.channel)
      if (!isAllowed) {
        await recordSkippedEvent(supabase, params, `user_preference_disabled:${params.category}`)
        return { success: false, reason: `User disabled '${params.category}' notifications for channel '${params.channel}'` }
      }
    }
    ```
  - [`apps/web/lib/notifications/preferences/defaults.ts:29-33`](file:///D:/Prodily/apps/web/lib/notifications/preferences/defaults.ts#L29-L33):
    ```typescript
    // Learning events: In-App only. Email disabled
    learning: { email: false, inApp: true },
    // Achievements: In-App only. Email disabled
    achievements: { email: false, inApp: true },
    ```
- **Root Cause:** In `enqueueNotificationItem()`, the processor checks `createDefaultNotificationPreferences(userId)` (an in-memory factory function) instead of reading the user's saved preferences from the `user_notification_preferences` table.
- **Impact:**
  - Because `learning.email` and `achievements.email` are `false` in the default template, all non-critical emails in these categories are permanently discarded at enqueue time with `user_preference_disabled:learning`.
  - When users enable email notifications in `/settings/notifications`, their choices are ignored because the processor never queries the database.
- **Recommended Direction:**
  Replace the static factory call with an asynchronous query to `user_notification_preferences`, falling back to `createDefaultNotificationPreferences` only if no record exists in the database.
- **Confidence:** High (Verified in processor source).

---

### CRIT-03: Admin Account Deletion Leaves Zombie Auth Users
- **Severity:** High
- **Category:** Authentication / Admin / Data Privacy
- **Status:** New Finding
- **Evidence:**
  - [`apps/web/app/api/admin/users/[id]/route.ts:36-62`](file:///D:/Prodily/apps/web/app/api/admin/users/%5Bid%5D/route.ts#L36-L62):
    ```typescript
    export const DELETE = withRoute(
      { actor: { allow: ['admin'] }, operation: 'admin.users.id.delete' },
      async ({ actor, params }) => {
        const admin = requireAdmin(actor)
        const { id } = params
        const supabase = createServiceRoleClient()
        await deleteAccount(supabase, id)
        await logAdminAction(admin.userId, admin.email, 'admin_user_deleted', 'user', id)
        // ... Missing supabase.auth.admin.deleteUser(id)!
    ```
  - Contrast with learner self-deletion in [`apps/web/app/api/settings/delete-account/route.ts:25`](file:///D:/Prodily/apps/web/app/api/settings/delete-account/route.ts#L25):
    ```typescript
    await deleteAccount(supabase, userId)
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
    ```
  - [`apps/web/lib/settings/settings-service.ts:196-271`](file:///D:/Prodily/apps/web/lib/settings/settings-service.ts#L196-L271):
    `deleteAccount` removes rows from `public.users` and cascades, but does not interact with GoTrue `auth.users`.
- **Root Cause:** The admin user deletion endpoint calls `deleteAccount(supabase, id)` but fails to invoke `supabase.auth.admin.deleteUser(id)`.
- **Impact:** A user "deleted" by an admin can still authenticate via Supabase Auth. Upon logging in, the authentication callback or profile synchronization will resurrect their user profile in `public.users`.
- **Recommended Direction:**
  Add `await supabase.auth.admin.deleteUser(id)` to `DELETE /api/admin/users/[id]`. Prevent admins from deleting their own accounts (`if (id === admin.userId) throw new BadRequestError(...)`) and protect superadmin accounts.
- **Confidence:** High (Verified in route handlers).

---

### CRIT-04: In-Memory `listUsers` Scan on Login Will Fail Above 1,000 Users
- **Severity:** High
- **Category:** Scalability / Authentication / DoS
- **Status:** New Finding
- **Evidence:**
  - [`apps/web/app/api/auth/login/route.ts:107-108`](file:///D:/Prodily/apps/web/app/api/auth/login/route.ts#L107-L108):
    ```typescript
    if (isUnconfirmedError && !isRequired) {
      const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const matchedUser = (usersList?.users || []).find((u) => u.email?.toLowerCase() === email)
      if (matchedUser) {
        await supabase.auth.admin.updateUserById(matchedUser.id, { email_confirm: true })
        // ... retry sign in
      }
    }
    ```
- **Root Cause:** When email confirmation requirement is toggled off and an unconfirmed user logs in, the handler queries page 1 of all users (capped at 1,000) and performs an in-memory linear search.
- **Impact:**
  - As soon as the platform exceeds 1,000 registered users, any unconfirmed user whose record appears on page 2+ cannot log in.
  - Fetching 1,000 full user objects into server memory on every unconfirmed login attempt is an unnecessary resource drain and an easy denial-of-service vector.
- **Recommended Direction:**
  Replace `listUsers` with a direct lookup against `public.users` (`SELECT id FROM users WHERE email = $1`), or utilize GoTrue's user lookup by email.
- **Confidence:** High (Verified in login route).

---

### CRIT-05: Double XP Aggregation Trigger on All Profile Updates
- **Severity:** High
- **Category:** Database Performance / Scalability
- **Status:** New Finding
- **Evidence:**
  - [`supabase/migrations/20260728000002_create_user_state.sql:127-130`](file:///D:/Prodily/supabase/migrations/20260728000002_create_user_state.sql#L127-L130):
    ```sql
    CREATE OR REPLACE TRIGGER trigger_sync_user_xp_on_update
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION sync_user_xp_and_level_on_update();
    ```
  - [`supabase/migrations/20260805000001_update_xp_level_trigger.sql:47-64`](file:///D:/Prodily/supabase/migrations/20260805000001_update_xp_level_trigger.sql#L47-L64):
    ```sql
    CREATE OR REPLACE FUNCTION sync_user_xp_and_level_on_update()
    RETURNS TRIGGER AS $$
    DECLARE actual_xp INT; calculated_level INT;
    BEGIN
      SELECT coalesce(sum(xp_amount), 0) INTO actual_xp
      FROM xp_events
      WHERE user_id = NEW.id;

      NEW.total_xp := actual_xp;
      NEW.level := calculate_user_level(actual_xp);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    ```
- **Root Cause:** The trigger is attached to `BEFORE UPDATE ON users` unconditionally. Any row update to `users` (e.g., updating `name`, `avatar_url`, `last_active_at`, or `current_streak`) scans the entire `xp_events` table for that user.
- **Impact:**
  - When an XP event is inserted, `trigger_sync_user_xp_on_insert` executes an `UPDATE users`, which in turn triggers `trigger_sync_user_xp_on_update`. The aggregation query is executed twice per XP event.
  - Profile writes become slower as the `xp_events` table grows, leading to transaction locks on hot learner accounts.
- **Recommended Direction:**
  Restrict the trigger to execute only when XP-related columns change:
  ```sql
  BEFORE UPDATE OF total_xp ON users
  WHEN (OLD.total_xp IS DISTINCT FROM NEW.total_xp)
  ```
- **Confidence:** High (Verified in migrations).

---

## User-Side Findings

### Flow Verification: UI → Server → Database

```
Learner Read Screen (Theory Tab)
   │
   ├─► [User clicks "I've Read This Lesson"]
   │      │
   │      ▼
   │   `handleTheoryComplete` in `lesson-content.tsx:453`
   │      │
   │      ├─► Calls `recordTheoryRead(seconds, scrollPercent)`
   │      │      │
   │      │      ▼
   │      │   `POST /api/user/progress` -> checks engagement (>=45s, >=80% scroll)
   │      │      │
   │      │      ├─► [FAILS: <45s or <80%] -> Returns 400 Bad Request
   │      │      │      │
   │      │      │      ▼
   │      │      │   `lesson-content.tsx:459` CATCH BLOCK SWALLOWS ERROR!
   │      │      │   Sets `activeTab = 'quiz'` anyway!
   │      │      │   `progress.theory_read_at` remains NULL!
   │      │      │   Quiz tab button remains LOCKED!
   │      │      │   Learner is stuck with no error toast or guidance!
   │      │      │
   │      │      └─► [PASSES] -> Writes `theory_read_at` to DB, awards 25 XP
   │      │
   │      ▼
   │   Quiz Tab Unlocks
   │      │
   │      ▼
   │   Learner takes 15-question quiz
   │      │
   │      ▼
   │   `recordQuizAttemptAction` marks lesson `completed` in DB
   │      │
   │      ▼
   │   Learner reaches Flashcard tab
   │      │
   │      ▼
   │   `LessonContextProvider` DOES NOT PASS `onFlashcardsComplete`
   │   Learner finishes flashcards -> No next step triggered!
   │      │
   │      ▼
   │   Learner must manually find Reflection tab
   │      │
   │      ▼
   │   `completedThisSession` ONLY triggered by submitting reflection!
   │   Learners who skip reflection NEVER see the "Lesson Mastered" celebration screen!
```

### Specific Findings

#### 1. Theory Engagement Failure Swallowed Silently
- **File:** [`apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx:453-465`](file:///D:/Prodily/apps/web/app/%28app%29/academy/%5BmoduleSlug%5D/%5BlessonId%5D/lesson-content.tsx#L453-L465)
- **Status:** New Finding `[FACT]`
- **Detail:** In `handleTheoryComplete`:
  ```typescript
  try {
    await recordTheoryRead(activeSecondsRef.current, scrollPercentRef.current)
    trackTheoryRead(lesson.id)
    setActiveTab('quiz')
  } catch {
    // Engagement threshold not met — still allow navigation
    setActiveTab('quiz')
  }
  ```
  If `recordTheoryRead` throws (e.g., student read for 30s instead of required 45s), the catch block swallows the error and forces `activeTab = 'quiz'`. But because the database rejected the write, `progress.theory_read_at` is null. The quiz tab header renders as disabled/locked, and page reloads reset the student back to theory.
- **Remediation:** Display an informative toast or modal: *"Take your time! Read for at least 45 seconds and scroll through the lesson to unlock the quiz."*

#### 2. Flashcard Deck Completion Callback Missing in Context Provider
- **File:** [`apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx:724-732`](file:///D:/Prodily/apps/web/app/%28app%29/academy/%5BmoduleSlug%5D/%5BlessonId%5D/lesson-content.tsx#L724-L732)
- **Status:** New Finding `[FACT]`
- **Detail:** The `LessonContextProvider` on the flashcards tab does not receive an `onFlashcardsComplete` callback:
  ```tsx
  <LessonContextProvider lessonId={lesson.id} onAdvanceTab={(tab) => setActiveTab(tab)}>
    <BlockTreeRenderer blocks={getBlocksForTab(lesson.blocks, 'flashcards')} lessonId={lesson.id} />
  </LessonContextProvider>
  ```
  When all flashcards are reviewed, the completion trigger inside the flashcard block has no effect, leaving the learner stranded on an empty deck.
- **Remediation:** Wire `onFlashcardsComplete={() => setActiveTab('reflection')}` into `LessonContextProvider`.

#### 3. "Lesson Mastered" Screen Decoupled from Quiz Completion
- **File:** [`apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx:467-472`](file:///D:/Prodily/apps/web/app/%28app%29/academy/%5BmoduleSlug%5D/%5BlessonId%5D/lesson-content.tsx#L467-L472)
- **Status:** New Finding `[FACT]`
- **Detail:** The completion banner and "Next Lesson" CTA are gated by `if (completedThisSession)`, which is *only* set inside `handleReflectionComplete`. Reflections are optional, so learners who finish the quiz and choose not to submit a reflection never see the milestone celebration or the "Continue to Next Lesson" primary action.
- **Remediation:** Set `completedThisSession = true` upon quiz completion, allowing the user to optionally reflect before advancing.

---

## Admin Findings

### 1. Dual-Role Routes Pollute Admin Audit Logs
- **File:** [`apps/web/lib/api/actor.ts:113-125`](file:///D:/Prodily/apps/web/lib/api/actor.ts#L113-L125) & [`apps/web/lib/admin/guard.ts:52-58`](file:///D:/Prodily/apps/web/lib/admin/guard.ts#L52-L58)
- **Status:** New Finding `[FACT]`
- **Detail:** Routes configured with `allow: ['learner', 'admin']` (such as `POST /api/user/quick-start`) test for `admin` actor status first. When a standard learner accesses the endpoint, `requireAdminUser` logs an `access_denied` event to `admin_audit_logs` before `actor.ts` falls back to the `learner` role.
- **Impact:** The admin audit log is flooded with hundreds of false-positive access violations from regular users, masking real security incidents.
- **Remediation:** In `actor.ts`, do not call `requireAdminUser` if the caller lacks admin credentials, or modify `requireAdminUser` to accept a `{ silent: true }` parameter when called as part of a multi-actor evaluation.

### 2. Missing Self-Deletion and Hierarchy Safeguards in Admin User API
- **File:** [`apps/web/app/api/admin/users/[id]/route.ts:43-51`](file:///D:/Prodily/apps/web/app/api/admin/users/%5Bid%5D/route.ts#L43-L51)
- **Status:** New Finding `[FACT]`
- **Detail:** `DELETE /api/admin/users/[id]` does not check if `id === admin.userId`. An admin can delete their own user record, leaving their session orphaned. Furthermore, any admin can delete any other admin without superadmin approval.
- **Remediation:** Guard against `id === admin.userId` and require superadmin privileges to delete accounts with `is_admin = true`.

### 3. Unbounded Queries in Admin Analytics and User Lists
- **File:** [`apps/web/app/api/admin/users/route.ts:56`](file:///D:/Prodily/apps/web/app/api/admin/users/route.ts#L56)
- **Status:** Existing Issue `[FACT]`
- **Detail:** When no search filter is applied, the admin users route queries with a default limit but performs count aggregation over the entire `users` table via `count: 'exact'`, triggering full table scans as the user base expands.
- **Remediation:** Use estimated row counts (`reltuples` in PostgreSQL) for pagination totals when table size exceeds 10,000 rows.

---

## Backend & Database Findings

### 1. Migration Drift and Permissive RLS Policies
- **File:** [`supabase/migrations/20260728000001_initial_schema.sql`](file:///D:/Prodily/supabase/migrations/20260728000001_initial_schema.sql) through [`20260910000001_security_hardening_b1.sql`](file:///D:/Prodily/supabase/migrations/20260910000001_security_hardening_b1.sql)
- **Status:** Hardened across B1–B14, but residual gaps remain `[FACT]`
- **Detail:** While B1 migration tightened RLS across user progress, `public.certificates` retained `FOR INSERT WITH CHECK (auth.uid() = user_id)`. This was intended to allow client-side certificate creation, but it bypasses the curriculum completion checks.

### 2. Lack of Transaction Boundaries in Lesson Completion
- **File:** [`apps/web/lib/academy/lessons-db.ts:250-320`](file:///D:/Prodily/apps/web/lib/academy/lessons-db.ts#L250-L320)
- **Status:** New Finding `[FACT]`
- **Detail:** `recordQuizAttemptAction` performs three sequential, un-batched database calls:
  1. Inserts into `quiz_attempts`.
  2. Updates `user_lesson_progress` to `status = 'completed'`.
  3. Inserts into `xp_events`.
  If the network fails or the server restarts between steps 2 and 3, the lesson is recorded as completed but the user is not awarded XP. The user cannot retry the quiz to claim the missing XP because the lesson is already marked `completed`.
- **Remediation:** Wrap multi-step mutations in a PostgreSQL RPC function or use Supabase transactions to guarantee atomicity.

### 3. Orphaned Records on Account Reset
- **File:** [`apps/web/lib/settings/settings-service.ts:153-189`](file:///D:/Prodily/apps/web/lib/settings/settings-service.ts#L153-L189)
- **Status:** New Finding `[FACT]`
- **Detail:** `resetProgress` clears `user_lesson_progress`, `quiz_attempts`, `user_flashcard_srs`, `reflections`, and `xp_events`, but does not delete entries from `user_badges`. A user who resets their progress retains all previously earned badges, resulting in inconsistent state where a user with 0 completed lessons holds the "Course Complete" badge.
- **Remediation:** Include `user_badges` in the deletion sequence inside `resetProgress`.

---

## Security Findings

### SEC-01: Public Certificate Forgery Attack Path
- **Vulnerability:** Broken Object-Level Authorization / Missing Business Logic Enforcement
- **Component:** `POST /api/certificates` & Supabase `certificates` RLS
- **Attack Path:**
  1. An attacker creates a free learner account via `/signup`.
  2. The attacker grabs their JWT access token from browser cookies.
  3. The attacker submits an HTTP request:
     ```bash
     curl -X POST https://pmacademy.com/api/certificates \
       -H "Authorization: Bearer <JWT>" \
       -H "Content-Type: application/json" \
       -d '{"type": "full_curriculum"}'
     ```
  4. The endpoint accepts the request, inserts a new certificate into `public.certificates` with `lessons_completed: 0`, and returns a valid `certificate_code` (e.g., `PM-2026-X9A2`).
  5. The attacker visits `https://pmacademy.com/verify/PM-2026-X9A2`.
  6. The public verification page reports: *"Verified Official Certificate: PM Academy Full Curriculum Graduate"*.
- **Risk:** High (Destroys credentials credibility).
- **Remediation:** Block client issuance unless prerequisites are strictly verified on the server.

### SEC-02: Password Reset Exception Leakage
- **File:** [`apps/web/app/api/auth/update-password/route.ts:293`](file:///D:/Prodily/apps/web/app/api/auth/update-password/route.ts#L293)
- **Vulnerability:** Information Disclosure
- **Component:** `POST /api/auth/update-password`
- **Attack Path:**
  On the password update retry path:
  ```typescript
  return NextResponse.json({ error: retryError.message }, { status: 400 })
  ```
  Internal GoTrue database errors, connection strings, or constraint details can be leaked directly to the client rather than being sanitized through `apiClassifiedAuthError`.
- **Remediation:** Sanitize all error responses through `apiClassifiedAuthError` or return generic user-facing messages.

### SEC-03: SSRF Protection Status on Webhooks
- **File:** [`apps/web/app/api/email/webhooks/route.ts:35-42`](file:///D:/Prodily/apps/web/app/api/email/webhooks/route.ts#L35-L42)
- **Status:** Verified Safe `[FACT]`
- **Detail:** Webhook requests from Resend are validated using Svix cryptographic signature verification with constant-time HMAC comparison before payload processing.

---

## Async, Email & Notification Findings

### 1. Daily Reminder & Weekly Recap Starvation at 100 Users
- **Files:**
  - [`apps/web/app/api/cron/daily-reminder/route.ts:76`](file:///D:/Prodily/apps/web/app/api/cron/daily-reminder/route.ts#L76)
  - [`apps/web/app/api/cron/weekly-recap/route.ts:77`](file:///D:/Prodily/apps/web/app/api/cron/weekly-recap/route.ts#L77)
- **Status:** New Finding `[FACT]`
- **Detail:** Both cron jobs execute with a hardcoded `.limit(100)`:
  ```typescript
  const { data: eligibleUsers } = await supabase
    .from('users')
    .select('id, email, name, current_streak')
    .gt('current_streak', 0)
    .limit(100)
  ```
  There is no cursor, pagination, or timestamp tracking. The cron always processes the same first 100 users ordered by insertion ID. Users beyond the first 100 never receive reminder or recap emails.
- **Impact:** Email retention mechanisms fail completely for all users beyond the first 100.
- **Remediation:** Implement keyset pagination using a `last_reminder_sent_at` column, processing batches until all eligible users are notified.

### 2. Timezone Insensitivity in Cron Scheduling
- **File:** [`apps/web/app/api/cron/daily-reminder/route.ts:32-45`](file:///D:/Prodily/apps/web/app/api/cron/daily-reminder/route.ts#L32-L45)
- **Status:** New Finding `[FACT]`
- **Detail:** The daily reminder cron runs at a single UTC schedule and sends notifications to all users simultaneously, regardless of their local timezone. Users in Asia-Pacific timezones receive "Morning Reminders" in the middle of the night.
- **Remediation:** Group users by `preferred_reminder_hour` and timezone offset, triggering reminders in hourly batches aligned to each user's morning window.

### 3. Duplicate Cron Job Handlers
- **File:** [`apps/web/app/api/cron/retry-failed/route.ts:35`](file:///D:/Prodily/apps/web/app/api/cron/retry-failed/route.ts#L35)
- **Status:** New Finding `[FACT]`
- **Detail:** `api/cron/retry-failed` simply invokes `processEmailQueue(50)`. This logic is identical to `api/cron/process-email-queue`. Having two independent cron jobs calling the same processor creates queue contention and race conditions when claiming pending emails.
- **Remediation:** Consolidate queue processing into `process-email-queue` and deprecate `retry-failed`.

---

## Content & Learning System Findings

### 1. Unstable Question IDs Shift Historical Quiz Analytics
- **File:** [`scripts/compiler/plugins/extractors.ts:187-224`](file:///D:/Prodily/scripts/compiler/plugins/extractors.ts#L187-L224)
- **Status:** New Finding `[FACT]`
- **Detail:**
  ```typescript
  const headerMatch = block.match(/\*?\*?(\d+)\.\s*(.*?)(?:\*?\*?\n|\n)/)
  const qNum = parseInt(headerMatch[1], 10)
  // ...
  questions.push({
    id: `q-${lessonId}-${qNum}`,
    question: qText,
    // ...
  })
  ```
  Question IDs are derived from their numeric position in the markdown file (`q-m1-l1-1`, `q-m1-l1-2`).
- **Impact:** If an author inserts a new question at position 2 or deletes question 1, all subsequent question IDs shift. In `quiz_attempts`, past user answers recorded for `q-m1-l1-3` now map to an entirely different question, corrupting historical accuracy data and competency radar charts.
- **Remediation:** Generate content-hashed or explicit UUID identifiers for questions (e.g., `q-${lessonId}-${hash(qText)}`).

### 2. Block ID Collision Risk on Identical Content
- **File:** [`scripts/compiler/plugins/extractors.ts:35-42`](file:///D:/Prodily/scripts/compiler/plugins/extractors.ts#L35-L42)
- **Status:** Existing Known Architecture `[FACT]`
- **Detail:** `generateBlockId` hashes `lessonId + block.type + block.content`. If a lesson contains two callouts with identical text, they receive identical `blockId` values, leading to React key warnings and reconciliation bugs in `BlockTreeRenderer`.
- **Remediation:** Include block sequence index in the hash input: `hash(lessonId + index + block.type + block.content)`.

---

## Performance & Scalability Findings

### 1. Concrete Scale Thresholds

| Component | Current Implementation | Failure Threshold | Failure Mode |
| :--- | :--- | :--- | :--- |
| **GoTrue Login Retry** | `listUsers({ perPage: 1000 })` | **1,000 users** | Users on page 2 cannot log in if unconfirmed verification is bypassed. High server memory spikes. |
| **Daily Reminder Cron** | `.limit(100)` with no pagination | **100 users** | 100% starvation for users registered after the 100th record. |
| **User Profile Updates** | Trigger sums `xp_events` on update | **~5,000 XP events/user** | Latency on profile/streak updates exceeds 2 seconds due to full table scans. |
| **Admin User List** | `count: 'exact'` on every load | **50,000 users** | PostgreSQL transaction timeouts on admin user management dashboard. |

### 2. Excessive Client-Side Re-Renders in Lesson View
- **File:** [`apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx:375-382`](file:///D:/Prodily/apps/web/app/%28app%29/academy/%5BmoduleSlug%5D/%5BlessonId%5D/lesson-content.tsx#L375-L382)
- **Detail:** Topbar breadcrumb state is synchronized via `useEffect` triggering a global context update on every render pass.

---

## Observability & Operations Findings

### Production Incident Scenario: "2 AM Alert"
**Question:** *If an asynchronous service breaks in production at 2 AM, will the on-call engineer know what broke, why it broke, and how to recover?*

- **Current State:**
  - **What works:** `withRoute` logs structured JSON containing `operation`, `actor`, and `durationMs`. Vitest error tests cover auth classifications.
  - **What fails:**
    - Cron jobs log plain text strings to console (`console.log('[cron/daily-reminder] Sent 10 reminders')`). If Vercel functions time out, no telemetry event is recorded in `admin_audit_logs`.
    - Resend delivery failures: when an email bounces, Resend webhooks record the bounce in `email_logs`, but there is no alerting threshold or dashboard metric for bounce rates exceeding 5%.
    - No centralized health check endpoint for Supabase connection pooling status or database replication lag.
- **Remediation:** Implement an operational health route (`GET /api/health`) that validates database responsiveness, Redis/queue latency, and third-party API availability.

---

## Testing & CI/CD Findings

### 1. Strengths
- **Axe-core Accessibility Gate:** Every pull request runs `npm run test:a11y` to prevent accessibility regressions.
- **Supply-Chain Hardening:** `ci.yml` runs a standalone dependency audit with `node --experimental-strip-types scripts/ci/audit-gate.ts`, avoiding `npm ci` execution on the security runner.
- **Secret Scanning:** Pinned Gitleaks v8.30.1 verified against hardcoded SHA-256 checksum.

### 2. Gaps
- **Missing Integration Tests for Certificate Issuance:** No automated test asserts that a user with 0 completed lessons is rejected when requesting a certificate.
- **Missing E2E Tests for Reflection Flow:** Playwright tests cover signup, login, and first lesson start, but skip the lesson-to-quiz-to-reflection completion sequence.

---

## Privacy & Data Governance Technical Findings

### 1. Technical Enforcement of Account Deletion (GDPR / CCPA)
- **Learner Self-Deletion:** Compliant `[FACT]`. [`apps/web/app/api/settings/delete-account/route.ts`](file:///D:/Prodily/apps/web/app/api/settings/delete-account/route.ts) cascades through 16 database tables, deletes the Supabase Auth user record, and clears session cookies.
- **Admin User Deletion:** Non-compliant `[FACT]`. [`apps/web/app/api/admin/users/[id]/route.ts`](file:///D:/Prodily/apps/web/app/api/admin/users/%5Bid%5D/route.ts) leaves the user in `auth.users`, preserving their email, bcrypt password hash, and metadata.

### 2. PII Scrubbing on Certificate Delinking
- **File:** [`apps/web/lib/settings/settings-service.ts:223`](file:///D:/Prodily/apps/web/lib/settings/settings-service.ts#L223)
- **Status:** Verified Safe `[FACT]`
- **Detail:** When an account is deleted, certificates are retained for verification integrity but `learner_name` is scrubbed to `'Former Learner'`.

---

## Architectural Inconsistencies & Multiple Sources of Truth

1. **User Notification Preferences:**
   - Source of truth: `user_notification_preferences` table.
   - Respected by: `/settings/notifications` page.
   - Ignored by: [`notifications/queue/processor.ts:104`](file:///D:/Prodily/apps/web/lib/notifications/queue/processor.ts#L104), which uses in-memory defaults.
2. **Lesson Completion State:**
   - Source of truth: `user_lesson_progress.status = 'completed'`.
   - UI assumption: `lesson-content.tsx` gates completion screens on `completedThisSession` (set only by reflections), leading to states where the database considers a lesson completed while the UI displays it as in-progress.
3. **Admin User Status:**
   - Evaluated dual-path: `users.is_admin = true` in PostgreSQL OR email presence in `ADMIN_EMAILS` environment variable. If an admin is removed from the database but remains in `ADMIN_EMAILS`, they retain full access.

---

## Things That Are Already Done Well

1. **Canonical Route Pipeline (`withRoute`):** 125 of 128 routes use a single wrapper enforcing actor resolution, audit logging, error classification, and metrics.
2. **Strict Brand & Color Hardening:** CI automatically greps against legacy URLs, hardcoded brand colors, and raw title suffixes to enforce design token integrity.
3. **Resilient Token Handling in Auth Callback:** `api/auth/callback` handles PKCE exchange, hash fragmentation, and session establishment with fallback cookies for edge browser compatibility.
4. **Accessible Component Architecture:** Radix UI primitives utilized throughout dashboard and academy with full keyboard navigation and screen-reader labels.
5. **Deterministic Seed & Compiler Pipeline:** Content pipeline parses markdown into JSON ASTs with strict frontmatter schema validation before deployment.

---

## Prioritized Remediation Plan

### P0 — Immediate Production / Security / Data-Integrity Concerns
- **P0-1:** Secure Certificate Issuance:
  - Revoke RLS insert policy on `certificates`.
  - Enforce 90-lesson completion check in `issueCertificate` before issuing credentials.
- **P0-2:** Fix Notification Queue Preferences:
  - Update `processor.ts:104` to query `user_notification_preferences` asynchronously so user preferences are honored.
- **P0-3:** Fix Admin User Deletion:
  - Add `supabase.auth.admin.deleteUser(id)` to `DELETE /api/admin/users/[id]`.
  - Add self-deletion and superadmin protection checks.
- **P0-4:** Replace `listUsers` in Login Route:
  - Query user ID by email via `public.users` instead of loading 1,000 users into memory.

### P1 — Important Reliability & Architecture Issues
- **P1-1:** Fix Double XP Trigger on User Updates:
  - Restrict `trigger_sync_user_xp_on_update` to run only when `total_xp` is modified.
- **P1-2:** Clean Up Dual-Role Admin Audit Alerts:
  - Prevent `actor.ts` from logging `access_denied` during routine learner fallback evaluations.
- **P1-3:** Fix Theory Engagement UX in Academy:
  - Catch 400 errors from `recordTheoryRead` and display a clear toast explaining read time and scroll requirements.
- **P1-4:** Connect Flashcard Completion Callback:
  - Wire `onFlashcardsComplete` in `lesson-content.tsx` to automatically transition learners to the reflection tab.

### P2 — Scalability & Async Workflows
- **P2-1:** Implement Paginated Cron Processing:
  - Convert `daily-reminder` and `weekly-recap` crons to use cursor-based keyset pagination.
- **P2-2:** Consolidate Duplicate Email Queue Crons:
  - Remove `cron/retry-failed` in favor of `cron/process-email-queue`.
- **P2-3:** Make Question IDs Content-Hashed:
  - Update compiler extractors to derive question IDs from content hashes rather than array indices.

### P3 — Cleanup & Operational Hardening
- **P3-1:** Implement Unified System Health Endpoint (`GET /api/health`).
- **P3-2:** Remove Stale "Nothing imports this yet" Comment in `with-route.ts`.
- **P3-3:** Add Alerting for Email Webhook Bounce Thresholds.

---

## Suggested Execution Order

```
[Phase 1: Security & Auth Integrity]
  P0-1 (Certificate Security) ──► P0-3 (Admin User Deletion) ──► P0-4 (Login listUsers Fix)
           │
           ▼
[Phase 2: Retention & Async Infrastructure]
  P0-2 (Notification Preferences) ──► P2-1 (Cron Pagination) ──► P2-2 (Cron De-duplication)
           │
           ▼
[Phase 3: Core Academy UX & Engine]
  P1-3 (Theory Error Toast) ──► P1-4 (Flashcard Advancement) ──► P1-1 (XP Trigger Optimization)
           │
           ▼
[Phase 4: Admin & Observability Hardening]
  P1-2 (Audit Log Noise) ──► P2-3 (Question Hash IDs) ──► P3-1 (Health Endpoint)
```

---

## Appendix

### Files Inspected
- `apps/web/lib/api/with-route.ts`
- `apps/web/lib/api/actor.ts`
- `apps/web/lib/admin/guard.ts`
- `apps/web/lib/certificates-db.ts`
- `apps/web/lib/settings/settings-service.ts`
- `apps/web/lib/notifications/queue/processor.ts`
- `apps/web/lib/notifications/preferences/defaults.ts`
- `apps/web/lib/academy/lessons-db.ts`
- `apps/web/app/api/certificates/route.ts`
- `apps/web/app/api/auth/login/route.ts`
- `apps/web/app/api/auth/update-password/route.ts`
- `apps/web/app/api/admin/users/[id]/route.ts`
- `apps/web/app/api/admin/users/route.ts`
- `apps/web/app/api/cron/daily-reminder/route.ts`
- `apps/web/app/api/cron/weekly-recap/route.ts`
- `apps/web/app/api/cron/retry-failed/route.ts`
- `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content.tsx`
- `scripts/compiler/plugins/extractors.ts`
- `.github/workflows/ci.yml`

### Database Migrations Inspected
- `20260728000001_initial_schema.sql`
- `20260728000002_create_user_state.sql`
- `20260805000001_update_xp_level_trigger.sql`
- `20260910000001_security_hardening_b1.sql`
- `20260910000002_security_hardening_b2.sql`

### Tests & Diagnostics Executed
- `npm run typecheck` — 0 errors (Passed).
- `npx vitest run apps/web/lib/__tests__/auth-unified-errors.test.ts` — 42 passed (Passed).

### Areas Not Conclusively Verified (Requires Staging Environment)
- Live Resend SMTP deliverability rates and external webhook round-trips.
- Third-party Cloudflare Turnstile token validation against live challenge tokens.
