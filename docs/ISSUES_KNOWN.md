# Known Issues & Production Verification Tracker — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Current Branch:** `main`  
**Last Updated:** September 14, 2026  

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
- **Description**: 1,233 automated test/spam accounts created 2026-09-06/07 (see [`INCIDENT_2026-09-06_SIGNUP_ABUSE.md`](archive/INCIDENT_2026-09-06_SIGNUP_ABUSE.md)). `allowSignups` is currently `false` in production.
- **Required Action**: (1) decide on a CAPTCHA provider before reopening signups, (2) approve or reject the proposed ban-not-delete cleanup of the 1,233 flagged accounts.
- **Note**: the root-cause fixes (signup rate limiting, pre-dispatch daily quota enforcement, provider failover) are implemented and test-passing. Deployment requires migrations `20260907000001` and `20260908000001`.

#### ISSUE-24: Signup Abuse Recurrence & Brevo Failover Failure (2026-09-09)
- **Status**: 🟠 Fixed in code on `main` (`10a21a5`) — **not verified in production**
- **Description**: The 2026-09-06 controls did not hold. Unauthenticated signup traffic again exhausted Brevo's allowance with no corresponding `public.users` rows, and Resend did not take over. Root causes: the auth hook sent email outside all governance; Brevo reports credit exhaustion as HTTP 400 + `not_enough_credits`, which the status-only classifier read as permanent and refused to fail over on; the per-IP limit keyed on the spoofable leftmost `X-Forwarded-For`; the limiter was non-atomic and failed open; `refCode` triggered a pre-verification welcome email.
- **Required Action**: apply migration `20260909000001_signup_abuse_email_governance.sql` to staging, exercise signup and provider failover there, then promote. **The code depends on this migration** — until it is applied, `consume_rate_limit` does not exist and fail-closed paths return 429.
- **Note**: full root-cause analysis, per-batch impact and remaining gaps are in [`HARDENING_LEDGER.md`](HARDENING_LEDGER.md). Gaps confirmed still open during the 2026-09-10 reconciliation: `/api/auth/login` and `/api/auth/update-password` have no rate limiting, `/api/auth/telemetry` still reads the leftmost `X-Forwarded-For`, and two raw Resend `fetch` calls still lack timeouts.

#### ISSUE-25: Unpatched Next.js critical advisories block the CI audit gate
- **Status**: 🟢 **Resolved 2026-09-14** — `next` upgraded 16.2.12 → 16.3.5; both advisories cleared and the audit gate passes
- **Description**: `npm audit` reports two critical advisories against `next@16.2.12`: [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) (unauthenticated RCE on Windows-hosted servers) and [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) (unauthenticated RCE in the Image Optimization API when AVIF is used). Both are cleared by `next@16.3.5`, a patch-level upgrade.
- **Reachability**: the Windows advisory does not apply to the Vercel Linux runtime. The AVIF advisory plausibly **does** apply: `/_next/image` is enabled, `next.config.ts:16` lists `image/avif` in `formats`, and `remotePatterns` allows `**.supabase.co`. `unoptimized` is set on four individual `next/image` call sites, which does not disable the optimizer endpoint. This weakens the locked plan's DEBT-07 premise that the image path is unreachable.
- **Resolution**: `next` and `eslint-config-next` upgraded to 16.3.5 (patch-level, no breaking changes). `npm audit` now reports 0 critical. The upgrade also cleared the two `sharp` and two `postcss` high advisories, whose allowlist entries were removed as stale. Neither advisory was ever added to `scripts/ci/npm-audit-allowlist.json` — an allowlist entry for a reachable production path would have been exactly the silent acceptance the gate exists to prevent.
- **Residual**: the image optimizer is still enabled with AVIF in `formats`. The RCE is patched, but if the optimizer is not actually wanted (all four `next/image` call sites pass `unoptimized`), disabling it would remove the attack surface entirely rather than patching it. Left as a separate decision — see DEBT-07.

#### ISSUE-26: Live Resend API key prefix committed to git history
- **Status**: 🟠 Open — working tree cleaned, **rotation still required**
- **Description**: The B14-B secret scan found a 28-character prefix of the production `RESEND_API_KEY` in `apps/web/lib/__tests__/system-monitoring.test.ts`, used as a redaction-test fixture. It entered history at `f839ef3` and is present in every clone. The archived Stage 2 audit's claim that a full-history scan "returned only obvious placeholders" is wrong for this value.
- **Impact**: the prefix is truncated and not directly usable, but it is a substantial fragment of a live credential published in the repository, and it materially narrows a brute-force search.
- **Required Action**: **rotate `RESEND_API_KEY` in Vercel and Resend.** Removing the literal from the working tree (done) does not remove it from history; rotation is the only remedy.
- **Note**: the fixture is now synthetic and the redaction test still passes. `.gitleaks.toml` allowlists only the `re_TestPlaceholder` markers, so a real key reintroduced into a test fails the scan.

---

### Deferred Register (D-01 – D-08) — audited 2026-09-08

Every item below was audited against the code on 2026-09-08. Two were fixed, one received a small honesty fix, and the rest were examined and consciously retained or deferred with a stated trigger for revisiting.

| # | Item | Decision |
|---|---|---|
| D-01 | Circuit breaker on failover | **Defer** — trigger defined |
| D-02 | Admin routes returning raw `err.message` | **Fixed** |
| D-03 | Client-side alert facets | **Retain** |
| D-04 | Two UI error-token families | **Defer** — approach documented |
| D-05 | Dead settings types | **Retain** |
| D-06 | `retry-failed` / `cleanup` cron routes | **Partially fixed + follow-up** |
| D-07 | Daily quota key timezone | **Fixed** |
| D-08 | Two email transports | **Defer** — trigger defined |

---

#### D-01 — Circuit breaker on provider failover · **DEFER**

- **Current state**: `sendEmailWithFailover()` attempts the primary, then the secondary once. There is no breaker, so a sustained double-provider outage retries both on every queue cycle.
- **Evidence**: `lib/notifications/providers/index.ts` keeps no state between calls. Exhaustion raises a `critical` `email.failover_exhausted` incident, deduplicated to one alert per fingerprint per hour.
- **What it would solve**: wasted latency and provider calls while both providers are down, and the original concern of a failover amplifying abusive traffic onto the secondary.
- **Protection that already exists**: the pre-dispatch daily quota gate caps optional email before any provider is called; signup rate limiting caps the abuse vector that motivated the concern; failover is hard-bounded to one secondary attempt; per-priority `max_attempts` caps retries (bulk = 1); exponential backoff spaces cycles.
- **Risk of implementing now**: a breaker is cross-instance state. In-memory state gives each serverless instance its own breaker — the exact defect ADR-003 fixed for feature flags — so a correct implementation needs a shared store. That adds a database round-trip to the hot send path and a new failure mode: a stuck-open breaker silently blocking all mail.
- **Risk of deferring**: bounded. The worst case during a double outage is wasted calls against providers already refusing, plus the existing critical alert.
- **Decision**: defer. The named problem is already covered by upstream caps.
- **Revisit when**: a double-provider outage is observed in production, **or** the daily quota is raised above ~1,000, **or** a third provider is added — at which point the attempt bound stops being "two".

---

#### D-02 — Admin routes returned raw `err.message` · **FIXED**

- **Was**: 74 sites across 56 admin route files returned or logged an unsanitized exception message. They sit behind `requireAdminUser`, but a driver error can carry a connection string and a provider error can echo an API key.
- **Fix**: `adminErrorMessage(cause, fallback)` in `lib/errors/api-response.ts` runs the message through the same redaction that guards `system_errors` (ADR-005) and falls back when there is nothing usable. Applied across `app/api/admin/**`; raw Supabase error fields (`updateErr.message`, `queryErr.message`, …) are wrapped in `sanitizeErrorMessage()`.
- **Deliberately not genericized**: admins keep the failure detail. A refused bulk requeue is actionable with the Postgres error and useless as "something went wrong". Response shapes and status codes are unchanged.
- **Out of scope**: Zod issue messages (`parsed.error.issues[0]?.message`) are our own schema copy and are left alone.
- **Tests**: `lib/__tests__/deferred-items-d02-d07.test.ts`.

---

#### D-03 — Client-side alert facets · **RETAIN**

- **Current state**: status, severity and category filter server-side; kind, retryability and provider filter client-side over the loaded window. The view requests the API maximum of 100 rows.
- **Evidence**: `app/api/admin/system/alerts/route.ts` caps `limit` at 100; `AdminSystemAlertsView.tsx` derives `visibleAlerts` in a `useMemo`.
- **Volume**: `system_errors` is deduplicated — repeats inside 15 minutes increment `occurrence_count` rather than inserting — so distinct incidents per window are low, and the default filter is `status = 'new'`.
- **Response size**: 100 rows of mostly short text plus a sanitized `details` object; tens of KB, fetched on demand by an authenticated admin.
- **Performance**: filtering 100 objects in a `useMemo` is not measurable.
- **Security**: no additional exposure. Every value was sanitized at write time (ADR-005), and client-side filtering shows a subset of what the API already returned to an authenticated admin. It does not widen access.
- **Scalability limit, stated honestly**: facets apply to the loaded window, so with more than 100 matching incidents a facet can hide older ones. The empty state names the window.
- **Decision**: retain. Server-side faceting needs `kind`/`retryability` query parameters plus a JSONB query for `provider` — real API surface for no current problem.
- **Revisit when**: `system_errors` routinely holds more than 100 `new` rows, or an operator reports a facet missing a known incident.

---

#### D-04 — Two UI error-token families · **DEFER**

- **Current state**: `destructive` (shadcn) is used by 22 files including every auth surface and the shared `AuthErrorNotice`. `danger` / `success` (semantic tokens in `globals.css`) are used only by `components/feedback/error-state.tsx` and `success-state.tsx`.
- **Evidence**: those two components are consumed by `components/forms/waitlist-form.tsx` and `components/marketing/product-mockup/lesson-card-preview.tsx`.
- **Real inconsistency?** Marginal today. The families never appear on the same screen — `destructive` covers auth and app surfaces, `danger` covers one marketing form. The visible difference is a slightly different red and a `rounded-md` versus `rounded-lg` corner.
- **Maintenance risk**: the real cost is decision friction. A new component has two plausible "error" tokens and no rule for choosing. That is how the P13 success-notice decision arose — moving auth success onto `--color-success` would have split the error/success pair across families.
- **Decision**: defer; no design-system refactor in this task.
- **Recommended approach when taken up**: adopt `destructive` as canonical (22 files versus 2), migrate the two `feedback/*` components, add a matching `success` role to the shadcn family so error and success live together, then delete the `--color-danger*` tokens. One PR, visual review only, no logic change.

---

#### D-05 — Dead settings types · **RETAIN**

- **Current state**: fields whose controls were removed in P10 still exist on `ProductSettings`, `LearningSettings`, `EmailSettings` and `NotificationSettings`, with defaults in `settings-service.ts`.
- **Evidence**: each dead field resolves to exactly two files — `lib/admin/types.ts` and `lib/admin/settings-service.ts`. Grep hits in `app/layout.tsx` and `lib/campaigns/portfolio-activation-runner.ts` are unrelated local identifiers that happen to be named `siteName` and `replyToEmail`, not these settings. No runtime code reads any of them.
- **Migration needed to remove?** No schema migration. `system_settings` stores each section as a single JSONB blob, so dropping fields is a TypeScript-only change that leaves stale keys inside existing blobs.
- **Misleading or unsafe?** No. Nothing renders them and nothing reads them; the persisted values are inert. The genuinely misleading part — controls implying enforcement — was removed in P10.
- **Decision**: retain. Removal is cosmetic, and because `upsertSettings` merges over current values, trimming the types would silently drop keys from stored blobs on the next save for no benefit.
- **Revisit when**: the settings schema is reshaped for another reason; fold the cleanup into that change.

---

#### D-06 — `retry-failed` and `cleanup` cron routes · **PARTIALLY FIXED + FOLLOW-UP**

- **Invoked in production?** Yes, both. `.github/workflows/notification-scheduler.yml` calls `/api/cron/retry-failed` hourly and `/api/cron/cleanup` daily.
- **`/api/cron/retry-failed`**: the body is `processEmailQueue(50)`, identical in effect to `/api/cron/process-email-queue`, which already runs every five minutes. It performs no dead-letter recovery and does not clear `next_retry_at`. It is a duplicate rather than a no-op — it does real work, just work the five-minute job already does — and it reported that work under a `retried` field, which reads as "failed items recovered" when it means "items a normal queue run processed".
- **`/api/cron/cleanup`**: returned `{ success: true, cleanedRows: 0 }` and deleted nothing. This one did report success while doing nothing (ISSUE-21).
- **Operational confusion**: yes for both. A green workflow run implied retention and dead-letter recovery were happening. Neither was.
- **Fixed here (small, in scope)**: both routes now state what they actually do. `cleanup` returns `implemented: false` with an explicit note and logs a warning rather than reporting a clean success; `retry-failed` renames its misleading `retried` field to `processed`, keeps the accurate value, and documents that it duplicates the five-minute job. No retention policy or recovery logic was invented.
- **Follow-up required**: decide a retention policy (which tables, what age) and implement `cleanup`; then either implement genuine dead-letter recovery in `retry-failed` or delete the route and its workflow job. Tracked as ISSUE-21.

---

#### D-07 — Daily quota key timezone · **FIXED**

- **Was**: the key `email_sent_count_YYYY_MM_DD` was computed with two clocks. `increment_daily_email_quota()` and `get_current_daily_email_count()` used `TO_CHAR(NOW(), …)`, which resolves in the **Postgres session timezone**. `EmailAutomationsService.getState()` used `toISOString()`, which is always **UTC**.
- **Enforcement was never wrong**: the RPC computes the key once and both increments and checks that same key, so the gate is internally consistent and could not over- or under-send around midnight.
- **What was wrong**: the count an operator reads on the admin dashboard came from a different row than the one being written whenever the database timezone was not UTC — for the offset window every day. During an abuse event that is precisely when the number has to be trustworthy. Supabase defaults to UTC, so this was latent rather than active, but the agreement was implicit and a timezone change would have broken it silently.
- **Serverless disagreement**: none between instances. `toISOString()` is UTC everywhere; the split was JS versus SQL.
- **Fix**: one explicit policy — **the quota day is the UTC day**. Migration `20260908000002_quota_key_utc.sql` pins both SQL functions to `TO_CHAR((NOW() AT TIME ZONE 'UTC'), 'YYYY_MM_DD')`. `lib/notifications/daily-quota-key.ts` is the single TypeScript definition, and `EmailAutomationsService` calls it.
- **Rollout note**: on a non-UTC database this shifts which key is written, so the deployment day can allow up to one extra quota's worth of optional email. Critical auth email bypasses the quota and is unaffected. Deploy near 00:00 UTC to minimise the overlap.
- **Tests**: `lib/__tests__/deferred-items-d02-d07.test.ts` covers the offset-window rollover, the exact 00:00 UTC boundary, and month/year boundaries.

---

#### D-08 — Two email transports · **DEFER**

- **Current state**: `lib/email.ts` implements its own Brevo and Resend `fetch` calls; `lib/notifications/providers/*` implements them again behind the registry.
- **Who uses each**: `lib/email.ts` serves 15 callers — the Supabase Auth hook, `/api/contact`, `/api/waitlist`, admin test-send, the webhook bounce alert, `lib/campaigns/*` and the local campaign scripts. The registry serves `processEmailQueue()` and the template test-send.
- **Do they behave differently?** Not on the axes that matter. Both resolve the primary through `resolvePrimaryProvider()` and classify failures through `classifyProviderFailure()`, so failover eligibility is identical, and both report through the error taxonomy. The remaining differences are intentional: the queue path records `provider` / `provider_attempts` on the row and is subject to the daily quota gate; the direct path has no row to annotate and is deliberately not quota-gated, because critical auth and contact mail must not be blocked by an optional-email cap.
- **Actual risk**: low. The dangerous divergences — different primary, different failover policy, silent auth failures — are closed. What remains is duplicated HTTP-call code, a maintenance cost: a future provider change must be made twice.
- **Why still separate**: the provider classes build the sender from `BRAND`, while `sendEmail()` accepts per-call `fromEmail` and `replyTo` that the marketing campaign scripts depend on. Unifying without addressing that would change sender identity for those campaigns.
- **Decision**: defer. Consolidation is refactoring with real regression surface and no current reliability gain.
- **Revisit when**: a third provider is added, or the campaign scripts stop needing per-call sender overrides — at which point `sendEmail()` can become a thin wrapper over `sendEmailWithFailover()`.

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
