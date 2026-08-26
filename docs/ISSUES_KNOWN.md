# Known Issues & Production Verification Tracker — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Branch:** `prodily-product-evolution-plan`  
**Current Baseline HEAD:** `2496754`  
**Last Updated:** August 26, 2026  

---

## 1. Issue Status Classification System

- 🟢 **Verified in Production**: Feature fully verified in live production runtime.
- 🟡 **Implemented — Production Verification Required**: Code is fully implemented and tested, but live behavior depends on production environment configuration (credentials, secrets, DNS).
- 🟠 **Partially Verified / Known Production Failure**: Functionality is implemented and executed, but an unresolved failure or gap occurs in live production requiring investigation.
- 🔴 **Confirmed Code-Level Broken**: Verified functional bugs in codebase logic.
- ⚪ **Not Implemented / Known Architectural Debt**: Planned architecture migrations or features not yet implemented.

---

## 2. Active Issue Register

### 🔴 Confirmed Code-Level Broken
*None identified.* All static App Router pages compile cleanly with 0 TypeScript errors, and all unit/integration test suites pass.

---

### 🟢 Resolved Issues

#### ISSUE-05: Admin Production Email Dispatch Pipeline
- **Status**: 🟢 Resolved & Verified
- **Resolution**: Implemented direct production send handler at `/api/admin/emails/production-send` with end-to-end recipient validation, dynamic template interpolation, direct Resend API dispatch, database queue recording with immediate status update, error handling, and structured audit logging via `logAdminAction()`. Verified with automated suite in `apps/web/lib/__tests__/admin-production-email.test.ts`.

---

### ⚠️ Production Behavior / Integration Requiring Real-World Verification

#### ISSUE-01: Resend Outbound Webhook Verification in Live Production
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: Webhook handler (`/api/email/webhooks`) is implemented with Svix HMAC signature verification (`verifySvixSignature`), database event logging, and bounce alert forwarding.
- **Required Verification**: Requires setting endpoint URL (`https://prodily.adityagangwani.me/api/email/webhooks`) and `RESEND_WEBHOOK_SECRET` in production Vercel environment variables.

#### ISSUE-02: Supabase Auth Hook Live Production Triggers
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: Supabase Auth Send Email Hook (`/api/auth/send-email-hook`) handles `signup`, `recovery`, `email_change`, `magiclink`, `invite`, and `reauthentication`.
- **Required Verification**: Requires configuring Auth Hook URL in Supabase Auth Dashboard settings and setting `SEND_EMAIL_HOOK_SECRET`.

#### ISSUE-03: GitHub Actions Production Cron Execution
- **Status**: ⚠️ Production Behavior / Integration Requiring Real-World Verification
- **Description**: Background scheduler (`.github/workflows/notification-scheduler.yml`) runs queue processing and maintenance cron triggers.
- **Required Verification**: Requires setting `CRON_SECRET` and `APP_URL` in GitHub Repository Secrets.

---

### 🟡 Known Observability / UX Issues

#### ISSUE-04: Admin Panel Email Quota vs. Resend Account Usage Metric Labeling
- **Status**: 🟡 Known Observability / UX Issues
- **Description**: The Admin Console displays `"Daily Email Quota Usage"` based on `daily_email_quota_count` in `system_settings`.
- **Architectural Fact**:
  - `daily_email_quota_count` tracks **Optional Automation Queue Sends** (`auth.welcome`, `learning.daily_reminder`, etc.). It deliberately excludes critical Auth emails (`auth.verify_email`, `auth.password_reset`), contact form forwards (`/api/contact`), webhook alerts (`/api/email/webhooks`), and test sends.
  - Resend Dashboard tracks **ALL outbound HTTPS API requests** across the entire account.
- **UX Limitation**: The Admin Panel label `"Daily Email Quota Usage"` risks making these two distinct metrics appear equivalent.
- **Recommended Resolution**: Expose two distinct metric cards:
  1. **Resend Account Outbound Usage** (Telemetry/API count)
  2. **Prodily Automation Quota** (Internal Queue Throttling Limit)

---

### ⚪ Known Architectural Debt & Verified Implementation Gaps

#### ISSUE-06: Custom Session Bridge vs. `@supabase/ssr`
- **Status**: ⚪ Known Architectural Debt
- **Description**: Current auth session synchronization uses custom cookies (`sb-access-token`, `sb-refresh-token`) via `proxy.ts`, `AuthStateListener.tsx`, and `/api/auth/session`.
- **Impact**: Server components cannot refresh expired tokens automatically (1-hour session expiry risk); slight race condition on initial sign-in.
- **Planned Resolution**: Migrate to official `@supabase/ssr` package (`createServerClient`), delete `/api/auth/session` route and `AuthStateListener.tsx`.

#### ISSUE-07: Onboarding Recommendation Disconnected from Learning Path
- **Status**: 🟠 Verified Product Gap (Targeted: Phase 3)
- **Description**: Step 4 of `OnboardingWizard.tsx` calculates a recommended module preview based on user goal, experience level, and topics. However, the recommendation is not stored as an active curriculum path override. `/dashboard` and `/academy` strictly follow the hardcoded sequential order (Lessons 1..90).
- **Evidence**: `OnboardingWizard.tsx:134-169`, `dashboard/page.tsx:96-108`.

#### ISSUE-08: In-App GA4 Learning Event Instrumentation Omission
- **Status**: 🟠 Verified Observability Gap (Targeted: Phase 1)
- **Description**: `apps/web/lib/analytics.ts` defines and tracks 11 marketing and quick-start tour events. Core in-app learning actions (lesson starts, theory completions, quiz attempts, capstone submissions, badges, level-ups, certificates) are recorded only in PostgreSQL and Admin Console aggregations, with zero telemetry dispatched to GA4.
- **Evidence**: `apps/web/lib/analytics.ts:24-110`.

#### ISSUE-09: Undispatched Notification Platform Events
- **Status**: 🟢 Resolved (Phase 0)
- **Resolution**: Registered `quiz.completed`, `streak.updated`, and `review.completed` in `IN_APP_EVENTS` in `connectors.ts`. Decoupled `user.verified` from `auth.verify_email` email queue to eliminate verification email loop. Implemented runtime event dispatches for `user.verified`, `lesson.completed`, `quiz.completed`, `capstone.submitted`, `streak.updated` (milestone days), and `review.completed`. Verified with automated unit test suite `lib/__tests__/notification-dispatch-integrity.test.ts`.

#### ISSUE-10: Stale Generated Database TypeScript Definitions
- **Status**: 🟢 Resolved (Phase 0)
- **Resolution**: Synchronized `apps/web/types/database.ts` to include `in_app_broadcasts` table definitions as well as `users` table `onboarding_topics` and `onboarding_preference` columns. Verified with automated unit test suite `lib/__tests__/db-types-alignment.test.ts`.

#### ISSUE-11: Glossary Route Sitemap Redirect Anomaly
- **Status**: 🟢 Resolved (Phase 0)
- **Resolution**: Removed `${siteUrl}/glossary` redirecting route entry from `marketingRoutes` array in `apps/web/app/sitemap.ts`. All sitemap URLs now serve canonical 200 OK endpoints without search engine crawler redirects.

#### ISSUE-12: Streak Freeze Learner UI Explanatory Copy
- **Status**: 🟢 Resolved (Phase 0)
- **Resolution**: Added clear explanatory copy and tooltip to `StreakCard.tsx` explaining that available streak freezes automatically protect the learner's study streak on missed days.

#### ISSUE-13: Capstone Direct Submit-to-Portfolio Flow Alignment
- **Status**: ⚪ Scope Clarification (Targeted: Phase 4)
- **Decision**: Quality evaluation, grading rubrics, reviewer comments, and admin review queues are formally out of scope for the current 10-phase roadmap. Submitted capstones will display directly on the learner's public portfolio as submitted work, preserving platform safety moderation while removing review bottlenecks.
- **Evidence**: Decision 2 in Planning Directive; `lib/capstones-db.ts`.
