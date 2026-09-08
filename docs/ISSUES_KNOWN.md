# Known Issues & Production Verification Tracker — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Current Branch:** `email-provider-failover-implementation`  
**Last Updated:** September 8, 2026  

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
*None open.* The September 2026 reliability pass (ADR-001 through ADR-006) closed the confirmed defects listed under "Resolved" below.

### 🟠 Active Incident Follow-Up

#### ISSUE-23: Signup Abuse Cleanup Pending Approval
- **Status**: 🟠 Mitigated, cleanup awaiting explicit approval
- **Description**: 1,233 automated test/spam accounts created 2026-09-06/07 (see [`INCIDENT_2026-09-06_SIGNUP_ABUSE.md`](INCIDENT_2026-09-06_SIGNUP_ABUSE.md)). `allowSignups` is currently `false` in production.
- **Required Action**: (1) decide on a CAPTCHA provider before reopening signups, (2) approve or reject the proposed ban-not-delete cleanup of the 1,233 flagged accounts.
- **Note**: the root-cause fixes (signup rate limiting, pre-dispatch daily quota enforcement, provider failover) are implemented and test-passing. Deployment requires migrations `20260907000001` and `20260908000001`.

---

### ⚠️ Deferred — Known and Deliberate

These were found during the September 2026 pass and consciously left. They are not defects in the shipped behaviour but they are open work.

| # | Item | Why deferred |
|---|---|---|
| D-01 | **No circuit breaker on failover.** Sustained double-provider failure raises a `critical` incident but is not rate-limited. | Volume is already capped by the daily quota gate and signup rate limiting. Add one if double outages become real. See [ADR-001](decisions/ADR-001-email-provider-resolution-and-failover.md). |
| D-02 | **~18 admin API routes still return `err.message`.** | Behind `requireAdminUser`, and the messages are diagnostic by design. The two that embed database text are sanitized. See [ADR-006](decisions/ADR-006-api-error-response-contract.md). |
| D-03 | **Alert facets (kind, retryability, provider) are client-side**, over the loaded 100-row window. | `kind`/`retryability` are not query parameters and `provider` lives inside JSONB `details`; server-side faceting needs API changes. |
| D-04 | **Two error-token families coexist.** `components/feedback/{error,success}-state.tsx` use `danger`/`success`; the other 22 files use `destructive`. | Only `waitlist-form.tsx` consumes the former. Migrating families is a broader visual change. |
| D-05 | **Dead settings types remain** in `lib/admin/types.ts` and `settings-service.ts` defaults, though their UI controls were removed. | Reshaping the settings schema is a backend change; the persisted values are inert. |
| D-06 | **`/api/cron/retry-failed` still duplicates the queue cron** and performs no dead-letter recovery; `/api/cron/cleanup` remains a no-op returning `cleanedRows: 0`. | Both were out of the phases' scope. ISSUE-21 stands. |
| D-07 | **Quota key timezone.** `increment_daily_email_quota()` derives its key from Postgres `NOW()`; `EmailAutomationsService` derives it from JS UTC. | If the database session timezone is not UTC the admin-displayed count reads a different key than the one incremented. Verify `SHOW timezone` in production. |
| D-08 | **`lib/email.ts` and the provider registry remain separate transports.** | They now share resolution and classification. Full consolidation would change sender behaviour for the campaign scripts. See [ADR-001](decisions/ADR-001-email-provider-resolution-and-failover.md). |

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
- **Status**: 🟢 Resolved & Verified
- **Resolution**: Integrated `resolvePersonalizedPath()` and `resolveNextRecommendedMilestone()` on `/dashboard` with dynamic `PersonalizedGoalBanner` highlighting the learner's personalized curriculum track based on their onboarding persona. Verified with automated test suite `lib/__tests__/path-resolver.test.ts`.

#### ISSUE-08: In-App GA4 Learning Event Instrumentation
- **Status**: 🟢 Resolved & Verified
- **Resolution**: Added comprehensive Google Analytics 4 event tracking wrappers in `apps/web/lib/analytics.ts` (`trackLessonStarted`, `trackTheoryRead`, `trackQuizCompleted`, `trackLessonCompleted`, `trackCapstoneSubmitted`, `trackBadgeEarned`, `trackLevelUp`, `trackFirstSessionStarted`, `trackGoalContextViewed`) with payload sanitization and null-safety. Verified with automated suite `lib/__tests__/analytics-learning-lifecycle.test.ts`.

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
- **Status**: 🟢 Resolved & Verified
- **Resolution**: Quality evaluation, grading rubrics, reviewer comments, and admin review queues are formally out of scope. Submitted capstones display directly on the learner's public portfolio with real-time deliverable readiness progress indicators. Verified with `lib/__tests__/capstones.test.ts`.

#### ISSUE-14: Leaderboard 2.0 Tiers & Admin Console Management
- **Status**: 🟢 Resolved & Verified
- **Resolution**: Added tiered rank badges (`Bronze`, `Silver`, `Gold`, `Diamond`, `Fellow`), `pointsToNextRank` deltas, 45s in-memory TTL query caching, real-time weekly recap metrics, `/admin/leaderboard` inspection console, and learner search multi-picker with broadcast safety guardrails. Verified with `lib/__tests__/leaderboard.test.ts` and `next build`.

#### ISSUE-15: Add Friend Broken for Non-UUID Usernames
- **Status**: 🟢 Resolved & Verified
- **Description**: `addFriend()` used a single `.or('username.eq.X,id.eq.X')` filter. Postgres rejected the whole query with an "invalid input syntax for type uuid" error whenever `X` was a plain username (since `id` is a UUID column), and the resulting DB error was silently swallowed (only `data` was read).
- **Resolution**: Branch on a UUID regex to query the correct single column (`id` vs `username`), and surface DB errors instead of discarding them. Verified with `lib/__tests__/friend-accountability.test.ts` (8 tests).

#### ISSUE-16: Email-Change Confirmation Redirect
- **Status**: 🟢 Resolved — best-effort root cause, recommend live click-through confirmation
- **Description**: Email-change verification links could land somewhere other than a dedicated success page (reported as landing on a certificate/verify page).
- **Resolution**: `normalizeOtpType()` in `/api/auth/callback/route.ts` collapses Supabase's granular `email_change_current`/`email_change_new` sub-types to the canonical `email_change` OTP type; both the success and failure paths for `email_change` now unconditionally redirect to a new dedicated `/email-verified` page (success or `?status=error` state) instead of any other destination; `public.users.email` is synced from `auth.users.email` on every successful confirmation; a new isolated template key `auth.email_change_verify` eliminates any risk of template cross-contamination with `auth.verify_email`. Verified with `lib/__tests__/auth-callback-email-change.test.ts` (12 tests). The exact original root cause could not be 100% confirmed without live Supabase dashboard access — recommend a live click-through test to confirm.

#### ISSUE-17: Automatic Portfolio Verification (New Feature)
- **Status**: 🟢 Resolved & Verified
- **Description**: Portfolios had no verification signal distinct from the manually-admin-granted PM Fellow designation.
- **Resolution**: Added `calculatePortfolioVerification()` (reuses the existing readiness checklist's avatar/bio signals): auto-verified when avatar + bio + ≥2 of {LinkedIn, GitHub, website} are present. Admin can force-override via nullable `users.portfolio_verification_override` (`'verified' | 'rejected' | null`), surfaced via `UserPortfolioVerificationToggle` in the User Detail Drawer. Migration `20260906000001_add_portfolio_verification_override.sql` applied to production. Verified with `lib/__tests__/portfolio-verification.test.ts` (8 tests). **Note:** this is a genuinely separate concept from PM Fellow (`is_fellow`) despite the similar naming — see [`docs/admin/portfolio-verification.md`](admin/portfolio-verification.md) and [`docs/admin/fellow-designation.md`](admin/fellow-designation.md).

#### ISSUE-18: Portfolio OG Card Brand Mismatch
- **Status**: 🟢 Resolved & Verified
- **Description**: The dynamic OG card (`/api/og/portfolio/[username]`) used an invented dark/admin-console-styled palette that didn't match Prodily's actual light-theme brand identity.
- **Resolution**: Rewrote using the app's real light-theme tokens (`theme/tokens.ts`) and exact logo colors — cream background, white cards, navy text, green primary/logo accents — plus icon badges on the stat cards and a link icon in the footer, matching the product's actual visual language. Preserves 1200×630 dimensions, cache headers, and the private-portfolio fallback.

#### ISSUE-19: Email Template Editor Had No Variable Tooling
- **Status**: 🟢 Resolved & Verified
- **Description**: The admin HTML template editor had no way to discover, insert, or validate `{{variable}}` tokens; the editor and the server-side preview/test-send routes each kept their own separate, drifted copy of the sample-variable list.
- **Resolution**: Extracted a single isomorphic source of truth (`lib/admin/template-variables.ts`: `TEMPLATE_SAMPLE_VARIABLES`, `TEMPLATE_VARIABLE_CATALOG`, `findUnknownVariables`), shared by the server (`communications-service.ts` re-exports it) and both editor UIs. Added click-to-insert-at-cursor and unknown-variable warnings to `AdminTemplateEditor.tsx` and `AdminCreateTemplateModal.tsx`. The lightweight plain-HTML-textarea editing model was deliberately preserved — no WYSIWYG was introduced.

---

### 🟠 Newly Identified — Confirmed Code-Level Broken (found during 2026-09-06 documentation audit)

#### ISSUE-20: Admin Analytics "XP Source Attribution" Always Reports 100% "Other"
- **Status**: 🟢 Resolved (September 2026) — `computeXpBySource` now reads `source_type`, `XP_SOURCE_LABELS` is keyed on the real `XpSourceType` union, and the parameter type was narrowed so the compiler catches the next drift.
- **Description**: `AnalyticsService.getAnalyticsWorkspaceData` selects the `source_type` column from `xp_events`, but `computeXpBySource()` reads `event.source` (a field that doesn't exist on the row) — every event's source resolves to `'other'`. Even once the field-name mismatch is fixed, `XP_SOURCE_LABELS` doesn't recognize several real `XpSourceType` values (`theory_read`, `quiz_correct`, `quiz_bonus`, `referral`), so those would still fall into "Other." Evidence: `lib/admin/analytics-service.ts` vs `lib/admin/analytics-aggregation.ts` vs `lib/xp/xp.ts`.
- **Impact**: The Analytics workspace's XP-by-source breakdown chart is non-functional as shipped.

#### ISSUE-21: `/api/cron/cleanup` Is a No-Op Placeholder
- **Status**: ⚪ Known Architectural Debt
- **Description**: The route always returns `{ cleanedRows: 0 }` and performs no actual deletion, despite being scheduled hourly-equivalent in `notification-scheduler.yml` and despite prior documentation describing it as purging old delivery logs and expired tokens.
- **Impact**: No automatic cleanup of old records currently happens; not urgent, but the scheduled job is currently dead weight.

#### ISSUE-22: Email Quota Settings Partially Dead
- **Status**: 🟢 Resolved (September 2026) — `retryDelayMinutes` is now read by the queue backoff and `dailySendLimit` writes through to the key the quota gate enforces. `hourlySendLimit` and `maxRetryAttempts` had no coherent runtime meaning (there is no hourly gate; attempts are per-priority), so their controls were removed instead of wired. See [`admin/platform-settings.md`](admin/platform-settings.md) §3.G.
- **Description**: The admin Platform Settings UI exposes an `hourlySendLimit` and `maxRetryAttempts`, neither of which is read by the actual send/retry pipeline (`lib/notifications/queue/processor.ts`). Only the daily quota (`email_daily_send_limit`) has any real effect, and even that isn't enforced as a hard gate mid-batch.
- **Impact**: Admins configuring these two settings will see no behavioral change. Low urgency, but worth fixing or removing the dead controls.

#### ISSUE-23: Badge Auto-Award Trigger Point Not Found
- **Status**: 🟡 Needs Verification
- **Description**: `evaluateAndAwardBadges()` is only ever called from `POST /api/badges`, and no caller of that endpoint was found anywhere in the current frontend (badges/progress pages only read via `getUserBadgesData`). It's possible a caller exists via a dynamically-constructed URL that a static search missed — this needs a targeted follow-up rather than an assumption either way.
- **Impact**: If genuinely orphaned, badges may not be auto-awarded in production despite the feature being otherwise fully implemented.
