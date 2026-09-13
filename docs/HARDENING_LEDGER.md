# Prodily Production Hardening — Implementation Ledger

**Branch of Record:** `main`
**Synchronized With:** `origin/main` @ `d2a59be` + B8-E applied 2026-09-13
**Date:** 2026-09-13
**Status:** B0–B6 complete · Phase 1 (B8-A…B8-E, B9-A) complete · **B8-E applied to production 2026-09-13** · Phase 2 in progress: **Next.js security prerequisite, B10-A, B14-B, B7-A and B7-B complete in code** on `b10a-b14b/error-boundaries-logout-ci-security`, not merged · **B7 is next**

> **What this document is.** The authoritative record of what has actually been
> implemented, in what order, and what remains. It is the execution state.
>
> **What it is not.** The specification. That is
> [`FINAL_IMPLEMENTATION_PLAN.md`](FINAL_IMPLEMENTATION_PLAN.md), which stays locked as
> the source of scope, locked decisions (L-01…L-17) and batch definitions. Where the
> two disagree about *status*, this ledger wins; where they disagree about *scope*, the
> plan wins.
>
> **Reading order for anyone picking up the work:** this file first, then the plan's
> batch spec for whichever batch is next.

---

## Chronology

| # | Work | Where | Status |
|---|---|---|---|
| 1 | **B0** — baseline | merged to `main` | ✅ Complete |
| 2 | **B1** — database / security exposure | merged to `main` | ✅ Complete · migration applied in production |
| 3 | **Signup-abuse incident (2026-09-09)** | `main` @ `10a21a5` | ✅ Complete · migration applied in production |
| 4 | **B2** — public portfolio XSS | merged to `main` | ✅ Complete |
| 5 | **B3** — auth & session hardening | merged to `main` | ✅ Complete |
| 6 | **B4** — governed email egress | merged to `main` | ✅ Complete |
| 7 | **B5** — rate limiting & abuse controls | merged to `main` | ✅ Complete |
| 8 | **B6** — queue & scheduler reliability | merged to `main` | ✅ Complete · migration applied in production |
| 9 | **B7** — route error contracts & auth wrapper | — | ⬜ **NEXT** |

---

## Baseline (B0) — ✅ Complete

- **Branch:** `implementation/prodily-hardening` (merged to `main`; branch since deleted)
- **Starting SHA:** `edc7436f634665fd7cf79ef82d4d89352bd56e43`
- **Working-Tree State:** Clean
- **Baseline Verification Results:**
  - **Typecheck (`npm run typecheck`):** Passed (0 errors)
  - **ESLint (`npm run lint`):** Passed (0 errors, 29 pre-existing warnings in test/admin files)
  - **Unit & Integration Suite (`npm run test`):** Passed (113 test files, 1,192 tests passing)
  - **Production Build (`npm run build`):** Passed (Next.js 16.2.12 Turbopack, 225/225 static pages compiled and emitted)

### B0 — Completed Work

- Established clean operational baseline across all build and test surfaces.
- Inspected full migration history (`supabase/migrations/`), current Next.js route handlers (`app/api/`), server components (`app/(portfolio)/`, `app/verify/`), and services (`lib/`).
- Verified audit findings against current codebase state.
- Known pre-existing non-fatal warnings recorded: 29 ESLint warnings (unused variables in test mock helpers and admin components).

---

## B1 — Security & Database Hardening — ✅ Complete in code

### 1. Findings Verified

- **S2-C1 / F-SEC-1 (SECURITY DEFINER Default EXECUTE Exposure & Search Path):**
  - **Verified in codebase:** `claim_email_queue_items(int)`, `get_admin_dashboard_summary()`, `increment_daily_email_quota(int)`, `get_current_daily_email_count()`, and `increment_portfolio_view_count(uuid)` were created as `SECURITY DEFINER` without explicit `REVOKE` from `PUBLIC, anon, authenticated`.
  - In addition, `increment_portfolio_view_count(uuid)` and the email queue/quota functions lacked explicit `search_path` declarations on the function definitions.
  - **Caller Verification:** All five functions are invoked exclusively via `createServiceRoleClient()` in server-side services (`lib/notifications/queue/processor.ts`, `lib/admin/dashboard-service.ts`, `lib/portfolio-db.ts`). No public or client-side caller uses anon or authenticated roles for these RPCs.
- **S2-C2 / F-SEC-2 (Public Exposure of Users Table via RLS Policy):**
  - **Verified in codebase:** `20260805000003_add_portfolio_columns.sql:20` created `create policy "Public can view public profiles" on users for select using (is_portfolio_public = true);`.
  - Because RLS is row-level rather than column-level, any unauthenticated client with the public anon key could execute `SELECT *` or `SELECT email, is_admin FROM users` for any public-portfolio learner.
  - **Caller Verification:** Public portfolio rendering (`/p/[username]`) and metadata generation are executed server-side via `createServiceRoleClient()`. Authenticated user operations rely on `auth.uid() = id`.
- **S2-C4 / F-SEC-3 (Certificates Blanket Anon Read Exposure):**
  - **Verified in codebase:** `20260805000004_create_certificates.sql:30` created `create policy "Public can view certificates" on certificates for select using (true);`, permitting anonymous harvesting of the entire certificate roster.
  - **Caller Verification:** Public certificate verification (`/verify/[certificateId]`) is executed server-side via `createServiceRoleClient()` calling `verifyCertificate()`.

### 2. Changes Made

1. **New Migration Added:** [`supabase/migrations/20260910000001_security_hardening_b1.sql`](../supabase/migrations/20260910000001_security_hardening_b1.sql)
   - **SECURITY DEFINER Least-Privilege:**
     - Revoked `ALL` execution privileges on `claim_email_queue_items(int)`, `get_admin_dashboard_summary()`, `increment_daily_email_quota(int)`, `get_current_daily_email_count()`, and `increment_portfolio_view_count(uuid)` from `PUBLIC, anon, authenticated`.
     - Granted `EXECUTE` strictly to `service_role` and `postgres`.
     - Set explicit `search_path = public, pg_temp` on all `SECURITY DEFINER` functions to prevent search path hijacking.
   - **Users Data Exposure Boundary:**
     - Dropped over-broad policy `"Public can view public profiles"` on `public.users`.
     - Created `public.public_profiles` view providing a strict, column-scoped projection (`id`, `username`, `name`, `bio`, `avatar_url`, `linkedin_url`, `github_url`, `website_url`, `total_xp`, `level`, `is_fellow`, `is_portfolio_public`, `portfolio_layout`, `featured_capstone_id`, `portfolio_view_count`, `current_streak`, `longest_streak`, `last_streak_date`).
     - Restricted `email`, `is_admin`, `curriculum_access_override`, `streak_freezes_available`, onboarding responses, and moderation overrides from anonymous access.
   - **Certificates Roster Protection:**
     - Dropped blanket `"Public can view certificates"` policy on `public.certificates`.
     - Created policy `"Users can view own certificates"` on `public.certificates` (`FOR SELECT USING (auth.uid() = user_id)`).
2. **Test Suite Updated:** [`apps/web/lib/__tests__/rls.test.ts`](../apps/web/lib/__tests__/rls.test.ts)
   - Added static migration invariant assertions verifying `REVOKE`, `GRANT`, `SET search_path`, policy drops, and view column exclusions.
   - Maintained live integration test coverage for anon query rejection and service-role bypass verification.

### 3. Verification & Results

- `npm run typecheck`: Passed (0 errors)
- `npm run lint`: Passed (0 errors, 29 warnings)
- `npm run test:rls`: Passed (3 tests)
- `npm run test:portfolio`: Passed (6 tests)
- `npm run test:certificates`: Passed (5 tests)
- `npm run test`: Passed (113 test files, 1,193 tests passed)
- `npm run build`: Passed (225 static pages compiled successfully)

### 4. Remaining Limitations & Environment Note

- **Live Database Grants:** Could not be directly queried from this environment as live Supabase database credentials are not configured in local environment variables.
- **Deployment Requirement:** Migration `20260910000001_security_hardening_b1.sql` must be applied to staging and verified before applying to production. **Applied in production; verified 2026-09-13 (B14-A).**
- **Migration renumbered 2026-09-10.** This migration was originally authored as `20260909000001_security_hardening_b1.sql`. The incident fix on `main` independently added `20260909000001_signup_abuse_email_governance.sql`, so after the merge two migrations shared the version `20260909000001` — the Supabase CLI keys `schema_migrations` on that version string, so the pair would not have applied correctly. The B1 file was renumbered (rather than the incident file) because the incident migration is the one already on `main` and closer to deployment, while B1's had not been applied anywhere. Only the filename and its header comment changed; the SQL body is untouched, and `rls.test.ts` locates the file by the `security_hardening_b1` substring rather than by version, so no test or code reference needed changing.

---

## Signup-Abuse Incident (2026-09-09) — ✅ Complete in code, on `main`

**Commit:** `10a21a5` — *fix: harden signup email abuse and provider failover*
**Merged into this branch:** `edfa701` (2026-09-10)
**Source investigation:** [`archive/INCIDENT_2026-09-08_SIGNUP_EMAIL_ABUSE.md`](archive/INCIDENT_2026-09-08_SIGNUP_EMAIL_ABUSE.md)

This was an unplanned production response, executed on `main` outside the batch
sequence. It lands squarely on top of scope that the locked plan had assigned to
**I-03 (B5)** and **I-04 (B4/B6)** — see [§ Roadmap](#roadmap--current-status) for the
per-batch reassessment.

### Incident

Hundreds of unauthenticated signup attempts consumed Brevo's 300-email allowance. No
corresponding rows appeared in `public.users`. Resend, configured and healthy, did not
take over as the fallback provider.

### Root causes (verified against the code, not inferred from commit messages)

1. **The auth hook was outside all email governance.** `/api/auth/send-email-hook`
   called `sendEmail()` directly, so every unauthenticated `auth.signUp()` /
   `auth.resend()` reached a paid provider with no quota, kill switch, suppression or
   deduplication in the path.
2. **Why emails were sent with no `public.users` rows.** The outbound messages were
   never welcome emails. `supabase.auth.signUp()` creates an `auth.users` row and
   nothing in `public.users`; GoTrue then invoked the hook. Welcome emails genuinely
   cannot be sent without a `public.users` row, because `email_queue.user_id` is
   `NOT NULL` with a foreign key to it — which is exactly why the two observations
   ("credits gone" and "no users") could coexist.
3. **Brevo capacity was misclassified.** Brevo answers an exhausted allowance on
   `POST /v3/smtp/email` with an ordinary **HTTP 400** carrying
   `{"code":"not_enough_credits"}`. `classifyProviderFailure()` read only the HTTP
   status; 400 is `permanent`, so failover was refused on every send. ADR-002 had
   correctly handled 402/429 but assumed those were the only shapes.
4. **Per-IP limiting was keyed on attacker-controlled input** — the leftmost
   `X-Forwarded-For` entry — so rotating a header yielded unlimited buckets.
5. **The limiter was non-atomic and failed open** to a process-local map, which on
   serverless is operationally identical to having no limit.
6. **`refCode` triggered a pre-verification welcome email.** Supplying any code made
   signup call `ensureUserProfile()`, which dispatches the welcome email — for an
   entirely unverified account.
7. **Welcome deduplication raced**, and `.maybeSingle()` errored once a duplicate
   existed, with the error discarded — so the guard stopped working permanently.

### Changes

- **New governed email gateway** (`lib/email-governance.ts`): kill switch → global
  pause → suppression → fail-closed recipient/IP/aggregate rate limits → durable
  idempotency claim → per-provider quota reservation, all before any provider call.
  The auth hook, waitlist and contact paths route through it.
- **Provider failure classification is body-code aware** — capacity codes outrank the
  HTTP status, with a deliberately narrow vocabulary so a plain `400` stays permanent.
  A capacity signal also marks the provider exhausted for the UTC day.
- **Trusted client IP** (`lib/security/client-ip.ts`): platform header, else the
  rightmost forwarded hop; never the leftmost.
- **Atomic rate limiting** via `consume_rate_limit`, with an explicit fail-closed mode
  on every path that can spend provider credit.
- **`refCode`** is validated, carried in auth metadata, and redeemed at the
  verification callback.
- **Welcome deduplication** enforced by a unique index on `email_queue.idempotency_key`.

### Migration dependency — ⚠️ operationally important

[`supabase/migrations/20260909000001_signup_abuse_email_governance.sql`](../supabase/migrations/20260909000001_signup_abuse_email_governance.sql)
adds the send ledger, the `email_queue` idempotency key, `consume_rate_limit`, and
per-provider quota accounting.

**The code depends on it.** Until it is applied, `consume_rate_limit` does not exist,
and every fail-closed path rejects — safe, but signup and auth mail will return 429.
Apply the migration before (or with) the deploy.

### Tests

118 test files / 1,256 tests passing, including 64 tests added for this incident across
five files: the provider failover state machine, signup abuse controls, welcome
deduplication, fail-closed rate limiting, and the other unauthenticated email paths.
Typecheck clean, lint 0 errors, production build succeeds.

### Deployment status — read carefully

| Claim | Status |
|---|---|
| Implemented in code | ✅ Yes — commit `10a21a5`, pushed to `origin/main` |
| Migration applied to staging | ❌ **No evidence** |
| Migration applied to production | ❌ **No evidence** |
| Verified in production | ❌ **Not verified** |

No live database or deployment credentials are available in this environment, and the
repository contains no deployment record for this commit. **Do not treat this incident
as closed in production on the strength of this document.** Verification is a human
step: apply the migration to staging, exercise signup and provider failover there, then
promote.

---

## B2 — Public Portfolio XSS / Untrusted JSON Serialization — ✅ **Complete in code**

**Primary finding:** S2-C3 (plan reference: I-12).
**Objective:** Prevent stored XSS breakouts on public portfolios (`/p/[username]`) and across all structured data JSON-LD contexts by escaping script-closing sequences (`</script>`, `</SCRIPT>`, `</ScRiPt>`, etc.) and enforcing URL validation and length boundaries on user-supplied profile data.

### 1. Root Cause & Vulnerable Data Flow

- **Vulnerability:** User-controlled profile fields (`bio`, `name`, `username`, social links) were serialized directly into `<script type="application/ld+json">` elements via `dangerouslySetInnerHTML={{ __html: JSON.stringify(profilePageJsonLd) }}`.
- **Root Cause:** Standard JavaScript `JSON.stringify()` does not escape `<`, `>`, or `&`. In an HTML script-data state, any literal `</script>` sequence (case-insensitive) terminates the script block immediately, allowing subsequent characters to execute as arbitrary HTML/JavaScript in the learner or visitor's browser context.
- **Write Boundary Exposure:** `/api/settings/profile` previously lacked schema length validation and protocol constraints on social links (`linkedin_url`, `github_url`, `website_url`), permitting dangerous URI schemes (`javascript:`, `data:`, `vbscript:`) and accepting `avatar_url` directly outside the dedicated avatar upload handler (`/api/user/avatar`).

### 2. Implementation

1. **Centralized Safe JSON-LD Serializer:** [`apps/web/lib/seo/safe-json-ld.ts`](../apps/web/lib/seo/safe-json-ld.ts)
   - Created `safeJsonLd(data: unknown): string` and `safeJsonStringify(data: unknown): string`.
   - Uses RFC 8259 Unicode escaping to replace `<`, `>`, `&`, `\u2028`, and `\u2029` with `\u003c`, `\u003e`, `\u0026`, `\u2028`, and `\u2029`.
   - **Security Invariant:** Eliminates literal `<` and `>` from the rendered HTML source while preserving exact JSON semantics when parsed by search engines and browsers (`JSON.parse` recovers identical original strings).
2. **Audit & Hardening of All 14 JSON-LD Script Contexts:**
   - Public Portfolio: `apps/web/app/(portfolio)/p/[username]/page.tsx` (`profilePageJsonLd`)
   - Certificate Verification: `apps/web/app/verify/[certificateId]/page.tsx` (`credentialJsonLd`)
   - Root Layout Schemas: `apps/web/app/layout.tsx` (`orgSchema`, `siteSchema`)
   - Marketing FAQ Component & Page: `apps/web/components/marketing/sections/faq.tsx` & `apps/web/app/(marketing)/faq/page.tsx` (`faqJsonLd`)
   - Marketing Reviews: `apps/web/app/(marketing)/reviews/page.tsx` (`jsonLd`)
   - Marketing Lessons: `apps/web/app/(marketing)/lessons/[slug]/page.tsx` (`lessonSchema`, `breadcrumbSchema`)
   - Marketing Frameworks: `apps/web/app/(marketing)/frameworks/page.tsx` (`jsonLd`)
   - Marketing Curriculum: `apps/web/app/(marketing)/curriculum/page.tsx` (`courseSchema`)
   - Marketing About: `apps/web/app/(marketing)/about/page.tsx` (`aboutSchema`)
   - Academy Lesson & Catalog: `apps/web/app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx` (`articleJsonLd`) & `apps/web/app/(app)/academy/page.tsx` (`courseJsonLd`)
3. **Profile Settings Write Boundary Hardening:** [`apps/web/app/api/settings/profile/route.ts`](../apps/web/app/api/settings/profile/route.ts)
   - Added Zod validation `profileUpdateSchema`:
     - `name`: max 100 characters.
     - `bio`: max 500 characters.
     - `linkedin_url`, `github_url`, `website_url`: max 500 characters, protocol strictly restricted to `http:` or `https:` using `validateOptionalUrl()`. Rejects `javascript:`, `data:`, `vbscript:`.
     - `avatar_url`: excluded from profile POST update (avatar upload is strictly governed through `/api/user/avatar` with 2MB size cap and image MIME-type whitelist).
4. **UI Defense-in-Depth:**
   - `apps/web/components/settings/ProfileSettingsTab.tsx`: removed `avatar_url` from form submit payload.
   - `apps/web/components/portfolio/PortfolioHero.tsx`: added `validateOptionalUrl()` guards before rendering social link `<a href="...">` anchors.

### 3. Verification & Results

- **Unit & Security Regression Test Suite:** [`apps/web/lib/__tests__/safe-json-ld.test.ts`](../apps/web/lib/__tests__/safe-json-ld.test.ts) (14 tests passed)
  - `</script><script>alert(1)</script>` injection breakout prevention.
  - Case variations (`</SCRIPT>`, `</ScRiPt>`) breakout prevention.
  - HTML tag injection payloads (`</script><img src=x onerror=alert(1)>`).
  - Escaping of `<`, `>`, `&`, `\u2028`, `\u2029`.
  - Full semantic preservation of complex user bios, newlines, and emojis.
  - Rejection of `javascript:`, `data:`, `vbscript:` URLs and oversized payload fields.
- `npm run test:portfolio`: Passed (6 tests)
- `npm run test:seo`: Passed (27 tests)
- `npm run test:settings`: Passed (6 tests)
- `npm run test`: Passed (119 test files, 1,273 tests passed, 0 failures)
- `npm run typecheck`: Passed (0 errors)
- `npm run lint`: Passed (0 errors, 34 warnings)
- `npm run build`: Passed (All 225 pages compiled and optimized successfully)

### 4. Remaining Limitations & Environment Note

- **Database Content:** Existing stored database records were not mutated or stripped. Output-context sanitization ensures all existing and future user data renders safely.
- **Production Deployment:** All changes are committed to `implementation/prodily-hardening` and tested locally; deployment to staging/production remains pending.

---

## B3 — Authentication & Session Architecture Hardening — ✅ **Complete in code**

**Primary findings:** S2-H2, S2-H3, S2-H4 (plan references: I-06, I-07).
**Objective:** Harden Prodily's authentication and session architecture by removing unverified JWT base64 parsing in middleware, eliminating session fixation and unverified token injection in `/api/auth/session`, implementing token rotation and dedicated server-side refresh/logout endpoints, and establishing httpOnly cookie session authority.

### 1. Root Cause & Security Weaknesses Addressed

- **Unverified JWT Payload Trust in Middleware (S2-H2 / Invariant 1):**
  - **Vulnerability:** `proxy.ts` contained `parseJwtUser()` which base64-decoded token payloads and evaluated expiration/user claims without cryptographic signature verification. An attacker presenting a forged JWT with spoofed claims (e.g. `sub`, `email`, `app_metadata.is_admin: true`) could bypass middleware route protection and RBAC guards.
  - **Resolution:** Removed `parseJwtUser()`. All middleware authentication now verifies session tokens cryptographically via Supabase Auth `getUser(accessToken)` with fallback to `refreshSession({ refresh_token })`. Unauthenticated or invalid requests to protected routes immediately clear cookies and redirect to `/login` (or `/admin/login`).
- **Session Fixation & Unverified Refresh Token Injection (S2-H3 / Invariant 2):**
  - **Vulnerability:** `POST /api/auth/session` previously accepted arbitrary `refresh_token` strings without validating that the refresh token matched the authenticated user's session, wrote unverified tokens into `sb-refresh-token` cookies, and returned 200 on malformed payloads.
  - **Resolution:** Re-architected `/api/auth/session` to validate both access and refresh credentials against Supabase Auth. Any mismatched or invalid refresh token returns 401. Added safe `GET /api/auth/session` endpoint for client components to check authenticated status without exposing raw tokens.
- **Refresh Token Rotation & Dedicated Endpoints (S2-H4 / Invariants 3 & 5):**
  - **Vulnerability:** Missing dedicated server-side token refresh and revocation endpoints; client-side listeners were required to manually negotiate refresh tokens.
  - **Resolution:** Created `POST /api/auth/refresh` (rotates tokens and refreshes `sb-access-token` / `sb-refresh-token` cookies) and `POST /api/auth/logout` (revokes session server-side and deletes cookies with `maxAge: -1`).
- **Session Boundary & Client Authority (Invariant 4):**
  - **Resolution:** Server-side authentication relies strictly on httpOnly cookies (`sb-access-token`, `sb-refresh-token`) and verified Bearer tokens. `localStorage` is used solely for non-sensitive draft UI state (capstone autosave, wizard drafts) and has zero authority in server authorization.

### 2. Files Changed / Created

1. [`apps/web/proxy.ts`](../apps/web/proxy.ts) — Removed `parseJwtUser()`; enforced `supabase.auth.getUser()` and `supabase.auth.refreshSession()`.
2. [`apps/web/app/api/auth/session/route.ts`](../apps/web/app/api/auth/session/route.ts) — Hardened session sync, added anti-fixation validation, added `GET` handler.
3. [`apps/web/app/api/auth/refresh/route.ts`](../apps/web/app/api/auth/refresh/route.ts) — **[NEW]** Dedicated server-side token refresh endpoint.
4. [`apps/web/app/api/auth/logout/route.ts`](../apps/web/app/api/auth/logout/route.ts) — **[NEW]** Dedicated server-side logout endpoint.
5. [`apps/web/lib/auth.ts`](../apps/web/lib/auth.ts) — Enhanced `resolveAuthenticatedUserFromRequest` to check request-level cookies and headers directly.
6. [`apps/web/lib/__tests__/b3-auth-session-hardening.test.ts`](../apps/web/lib/__tests__/b3-auth-session-hardening.test.ts) — **[NEW]** 22-test security regression suite covering all B3 attack scenarios.
7. [`apps/web/lib/__tests__/p1-middleware-optimizations.test.ts`](../apps/web/lib/__tests__/p1-middleware-optimizations.test.ts) — Aligned mock Supabase client to verify tokens with cryptographic signature simulation.
8. [`apps/web/lib/__tests__/onboarding-action.test.ts`](../apps/web/lib/__tests__/onboarding-action.test.ts) — Updated mocks to verify authenticated user metadata.

### 3. Verification & Results

- **B3 Focused Security Suite:** 22/22 tests passed (`b3-auth-session-hardening.test.ts`).
- **All Auth Test Suites:** 14 test files, 161 tests passed.
- **Full Test Suite:** 121 test files, 1,076 tests passed.
- **Typecheck:** Passed (0 errors, `tsc --noEmit`).
- **Lint:** Passed (0 errors, 34 warnings).
- **Build:** Passed (`next build` compiled 118 static and dynamic routes successfully).

---

## B6 — Queue & Scheduler Reliability — ✅ Complete in code

### 1. Findings Addressed
- **Stale `processing` Item Reclamation:**
  - Items in `processing` status could become stuck indefinitely if a serverless worker timed out or crashed.
  - Implemented atomic `reclaim_stale_processing_items(p_stale_interval_seconds, p_max_reclaim)` RPC with `FOR UPDATE SKIP LOCKED` and lease expiration (>15 minutes).
  - Items with `attempt_count >= max_attempts` transition to `dead_letter` with `failed_at = NOW()`.
  - Items with `attempt_count < max_attempts` transition to `retrying` with randomized immediate jitter (0..30s) and cleared `processing_at`.
  - Added atomic compare-and-swap query fallback in `reclaimStaleProcessingItems()` in `processor.ts`.
  - Added indexes `idx_email_queue_processing_stale` and `idx_email_queue_claim_lookup`.
- **Bounded Dispatch Concurrency:**
  - Replaced unconstrained serial dispatch with a bounded worker pool (`DEFAULT_DISPATCH_CONCURRENCY = 5`, configurable between 1 and 10 via `QUEUE_DISPATCH_CONCURRENCY`).
  - Added `MAX_BATCH_EXECUTION_MS = 90_000` (90s) overall batch execution deadline, ensuring dispatch loops complete well within the 5-minute GitHub Actions timeout window.
  - Preserved individual provider 8-second HTTP timeout; slow jobs are isolated and do not serially block sibling workers.
  - Preserved atomic daily send quota reservation (`increment_daily_email_quota`) across concurrent workers.
- **Retry Backoff + Jitter & Permanent Failure Routing:**
  - Implemented `calculateRetryDelayMinutes(attemptCount, baseMinutes, options)` in `helpers.ts`: exponential backoff with bounded +/-20% jitter and a 120-minute maximum delay ceiling.
  - Provider rejections classified as `permanent` (e.g. 400 bad request, 401 unauthorized, 403 forbidden, 422 unprocessable) route directly to `dead_letter` via `handlePermanentFailure()`, preventing wasted provider quota.
- **Scheduler Failure Detection & Heartbeat:**
  - Added durable heartbeat recording to `system_settings` under key `cron_heartbeat:process-email-queue` in `/api/cron/process-email-queue/route.ts`.
  - Records job name, timestamp, duration, result, and status (`healthy` or `failed`).
  - Updated `SystemService.getHealthOverview()` to read this heartbeat and populate the Scheduler service card (`healthy` if run < 15m ago, `degraded` if stale or failed).
- **Retry Duplication & Race Prevention:**
  - Added compare-and-swap guard (`withProcessingStatusGuard` checking `status = 'processing'`) on all completion and failure updates in `processor.ts`.
  - Updated admin retry endpoints (`[id]/retry`, `retry-all`, `retry-selected`) to permit manual retries of stale `processing` items (>15m) while strictly rejecting active (<15m) processing items.
  - Preserved idempotency key constraints and ensured retries modify existing queue rows rather than inserting duplicate records.
- **Queue State Machine Alignment:**
  - Aligned `QueueStatus` union in `types.ts` to include `'skipped'`.
  - Updated `isValidQueueStatusTransition` in `helpers.ts` to reflect actual production transitions.

### 2. Files Changed
- `supabase/migrations/20260910000002_queue_reliability_b6.sql` (New additive migration for reclaim RPC and indexes)
- `apps/web/lib/notifications/queue/types.ts` (Added `'skipped'` to QueueStatus and ProcessQueueResult interface)
- `apps/web/lib/notifications/queue/helpers.ts` (Updated state transitions and added calculateRetryDelayMinutes with jitter)
- `apps/web/lib/notifications/queue/processor.ts` (Stale reclaim, bounded concurrency, backoff jitter, status guards)
- `apps/web/app/api/cron/process-email-queue/route.ts` (Scheduler heartbeat recording)
- `apps/web/lib/admin/system-service.ts` (Scheduler heartbeat observability in System Health)
- `apps/web/app/api/admin/emails/queue/[id]/retry/route.ts` (Stale processing retry support)
- `apps/web/app/api/admin/emails/queue/retry-all/route.ts` (Stale processing retry support)
- `apps/web/app/api/admin/emails/queue/retry-selected/route.ts` (Stale processing retry support)
- `apps/web/lib/__tests__/b6-queue-scheduler-reliability.test.ts` (19 comprehensive B6 tests)
- `docs/HARDENING_LEDGER.md` (Audit and ledger records)

### 3. Verification & Results
- **Focused B6 Test Suite (`b6-queue-scheduler-reliability.test.ts`):** 19/19 passed.
- **Affected Test Suites (7 files):** 73/73 passed.
- **Full Test Suite (`npm test`):** 124 test files, 1,345/1,345 passed.
- **Typecheck (`npm run typecheck`):** Passed (0 errors).
- **ESLint (`npm run lint`):** Passed (0 errors, 35 pre-existing warnings).
- **Production Build (`npm run build`):** Passed (227/227 static pages compiled successfully).
- **Git Diff Check (`git diff --check`):** Passed (0 whitespace/conflict errors).

---

## Roadmap — current status

Statuses below were established by reading the merged code, not by reading commit
messages. "Plan ref" points at the batch specification in
[`FINAL_IMPLEMENTATION_PLAN.md`](FINAL_IMPLEMENTATION_PLAN.md).

| Batch | Plan ref | Status | Notes |
|---|---|---|---|
| **B0** — baseline | — | ✅ Complete | |
| **B1** — database / security exposure | I-02 | ✅ Complete in code | Migration unapplied |
| **B2** — portfolio XSS | I-12 | ✅ Complete in code | S2-C3 resolved; 14 JSON-LD sites hardened |
| **B3** — session/token architecture | I-06, I-07 | ✅ Complete in code | Unverified JWT trust removed; session fixation closed; refresh/logout routes added |
| **B4** — email gateway + signup ordering | I-04 | ✅ Complete in code | Direct transports unified through canonical failover registry; kill switch enforced; timeouts standardized; durable side effects verification-gated |
| **B5** — atomic rate limiting + abuse controls | I-03 | ✅ Complete in code | Login & update-password fail-closed atomic rate limits implemented; telemetry leftmost-XFF trust removed; signup account enumeration closed; Turnstile deferred |
| **B6** — queue & scheduler reliability | I-04, I-05 | ✅ Complete in code | Migration 20260910000002 added; atomic stale processing reclamation implemented; bounded concurrency (pool of 5, 90s deadline); exponential backoff with jitter and 120m ceiling; durable scheduler heartbeat in system_settings; retry-failed duplication prevented; queue state machine aligned; 124 test files / 1345 tests passing |
| **B7** — shared auth + route/error contract | I-07 | 🟡 **B7-A and B7-B complete in code** | `lib/api/actor.ts` resolves the caller canonically; `lib/api/with-route.ts` wraps actor policy, validation, rate limiting and the ADR-006 envelope. Foundation only — zero routes migrated, which is what B7-C onwards does |
| **B8** — typed data layer + DB correctness | I-08 | 🟢 **P0 correctness DEPLOYED; B8-E prepared, NOT applied** | B8-A…B8-D deployed to production at `164229a` and verified 2026-09-13: leaderboard column bug fixed (F-COR-1), authoritative XP total (F-COR-2), truncating queries bounded (F-COR-4), duplicate diagnostic run read-only (F-COR-3). `awardXp()` now treats SQLSTATE 23505 as already-awarded. **B8-E applied to production 2026-09-13 18:15:34Z** — 31 `theory_read` duplicates removed, 310 XP across 13 users, scoped partial unique index over six once-only source types. 17/17 post-migration checks passed. Executed direct-to-production by explicit approval; no staging project was used (P0-1 remains outstanding). Typed repository layer (B8-F/B8-G) untouched. See [`PHASE1_IMPLEMENTATION_TODO.md`](archive/PHASE1_IMPLEMENTATION_TODO.md) |
| **B9** — admin controls + observability | I-10 | 🟢 **B9-A deployed** | Out-of-band critical alerting deployed at `164229a` (F-REL-4) — **inert until `ALERT_WEBHOOK_URL` is configured in production**. Correlation IDs, structured logging and retention (B9-B…B9-D) outstanding |
| **B10** — frontend API/data layer | I-11 | 🟡 **B10-A complete in code** | Error-boundary structure corrected (F-COR-5) and a single canonical client logout helper introduced (F-COR-6). Dead-code removal (I-12-B5) was already closed by the 2026-09-13 cleanup pass. B10-B…B10-D (typed API client, SWR adoption) outstanding |
| **B11** — design system migration | I-13 | ⬜ Outstanding | |
| **B12** — marketing performance | I-14 | ⬜ Outstanding | |
| **B13** — mobile/API readiness | D-01, D-04 | ⬜ Outstanding | Decision still deferred |
| **B14** — CI/security/E2E hardening | I-01 | 🟡 **B14-A and B14-B complete in code** | B14-A made the migration deploy fail loudly. B14-B added the `security-audit` CI job: a blocking `npm audit` gate with a reviewed, expiring allowlist, gitleaks secret scanning pinned by checksum, and Dependabot for npm and github-actions. Policy in [`SECURITY.md`](SECURITY.md) §5. **The gate currently blocks on two unreviewed Next.js critical advisories** — see ISSUE-25. B14-C (E2E + component tests) outstanding |

### B4 / B5 / B6 reassessment against `10a21a5`

The incident fix implemented a substantial part of these three batches. **Do not
re-implement the items marked ✅.**

| Plan batch | Status | Evidence / deviation |
|---|---|---|
| **I-03-B1** atomic rate-limit RPC | ✅ Done | `consume_rate_limit` in the incident migration |
| **I-03-B2** limiter + explicit fail mode | ✅ Done (variant) | Shipped as `failClosed?: boolean` rather than the planned `failMode: 'open' \| 'closed'`. Functionally equivalent; adopt the shipped shape rather than churning the API |
| **I-03-B3** trusted client IP helper | ✅ Complete | `lib/security/client-ip.ts` exists and is used by signup, resend-verification, waitlist, contact, the auth hook, and `app/api/auth/telemetry/route.ts` (leftmost-XFF trust removed in B5) |
| **I-03-B4** fail-closed limits on unprotected endpoints | ✅ Complete | `waitlist`, `resend-verification`, `/api/auth/login` (IP + canonical email), and `/api/auth/update-password` (IP + authenticated user/token) protected with fail-closed atomic rate limiting (F-SEC-5 closed in B5) |
| **I-03-B5** global signup ceiling | ✅ Done | `signup_global` key, hourly, derived from the configured daily email limit |
| **I-03-B6** close enumeration oracles | ✅ Complete | Rate-limit refusals no longer say which bucket tripped, resend-verification is non-enumerating, and signup now returns a uniform non-enumerating generic response on existing accounts without dispatching durable side effects |
| **I-03-B7** Turnstile | ⬜ Deferred | Evaluated in B5: Cloudflare Turnstile credentials and packages are not configured in repository/environment. Deferred pending operator provisioning |
| **I-04-B1** `from_email`/`reply_to` on `email_queue` | ⚪ Not Required | Evaluated in B4: schema migration unnecessary. Custom sender metadata is carried via JSONB template variables; no queue consumers query dedicated columns. |
| **I-04-B2** kill switch in the direct transport | ✅ Complete | Enforced `EMAIL_ENABLED` kill switch inside `sendEmail()` with explicit `isCritical` bypass support, protecting direct callers bypassing the gateway. |
| **I-04-B3** global ceiling + circuit breaker above failover | 🟡 Partial — **and its stated intent now conflicts with ADR-002** | An aggregate hourly ceiling (`email_global:governed`) and per-provider exhaustion marking exist. But this batch's objective reads *"trips to a hard stop rather than shifting volume to the secondary"*, whereas ADR-002 and the incident fix deliberately **do** fail over on capacity exhaustion. L-10 asks for both bounded failover *and* a breaker above it. **Needs a human decision before implementation** — see Open Questions |
| **I-04-B4** route `sendEmail()` through `sendEmailWithFailover()` | ✅ Complete | Direct transport in `lib/email.ts` unified through canonical provider registry (`sendEmailWithFailover()`). Duplicated raw `sendViaBrevo` and `sendViaResend` transports removed. |
| **I-04-B5** route the auth hook through the queue | 🔄 **Superseded in mechanism, objective met** | The hook now goes through the synchronous governed gateway, not the queue. The objective (no ungoverned egress on the hook path, L-10) is satisfied. Queuing it would add latency to verification email, and the plan itself gated this batch on I-05-B1/B2, which are not done. **Re-open only if queueing is wanted for its own sake** |
| **I-04-B6** verification before durable side effects | ✅ Done (variant) | No `public.users` row, no welcome email and no attribution before verification under Flow A. `refCode` is validated and carried in auth metadata rather than in a new pending-referral table, so **the planned migration was not needed**. Note Flow B (`requireEmailVerification = false`) still creates the profile at signup — correct, since `admin.createUser({ email_confirm: true })` makes that the registration milestone under that configuration |
| **I-04-B7** timeouts & remaining direct callers | ✅ Complete | Standardized `EMAIL_HTTP_TIMEOUT_MS = 8000` applied to raw HTTP fetches (`automations/service.ts`, `api/email/webhooks/route.ts`). All production email dispatch paths audited, categorized, and kill-switch bounded. |
| **I-05-B1…B5** queue & scheduler reliability | ⬜ Outstanding | Untouched by the incident fix |

---

## Phase 2 — Security prerequisite: Next.js 16.3.5 — ✅ Complete

**Branch:** `b10a-b14b/error-boundaries-logout-ci-security` (not merged, not pushed)
**Date:** 2026-09-14

The B14-B audit gate was left blocking on two unreviewed Next.js critical
advisories rather than allowlisting them. This batch clears them at the source.

| Advisory | Description | Status |
|---|---|---|
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) | Unauthenticated RCE on Windows-hosted servers | Cleared |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | Unauthenticated RCE in the Image Optimization API with AVIF | Cleared |

**Change:** `next` and `eslint-config-next` 16.2.12 → **16.3.5**, both pinned
exactly, matching the existing pinning convention. Nothing else was upgraded
deliberately; the lockfile delta is confined to Next's own subtree — the `@next/*`
SWC binaries, `@next/env`, `@swc/helpers`, Next's bundled `postcss`
(8.4.31 → 8.5.23), and the `sharp` platform packages, which deduplicated to the
root `sharp` 0.35.4 already permitted by the existing `^0.35.3` range.

**Investigation before upgrading.** `image/avif` appears in exactly one place —
`next.config.ts:16`, as an optimizer output format. No application code references
AVIF, and no behaviour depends on the vulnerable path, so the upgrade could not
regress a feature. `next@16.3.5` is the latest 16.3.x and a patch-level move from
16.2.12.

**Advisory side effects.** The upgrade also cleared four high advisories that the
B14-B allowlist had accepted — two `sharp` (libvips, libheif) and two `postcss`
(sourceMappingURL). Their allowlist entries were removed, which is the allowlist
behaving as designed: the gate flagged them as stale and the list shrank. Five
high advisories remain accepted (`fast-uri` ×4, `js-yaml`), unchanged.

**No security control was weakened.** The audit gate, the allowlist mechanism,
gitleaks and the image configuration are all unchanged; the allowlist only lost
entries, never gained one.

**Validation:** `npm audit` 1 critical / 4 high → **0 critical / 2 high**, both
remaining highs allowlisted, gate exit 0. Typecheck 0 errors. 136 test files /
1561 tests passed. Lint 0 errors. Production build compiled successfully,
227/227 static pages. Playwright 8/8. gitleaks over tracked files: no leaks.

**One new lint warning**, from `eslint-config-next` 16.3.5's new
`@next/next/no-location-assign-relative-destination` rule, on
`components/settings/DangerZoneTab.tsx:97`. The destination is the hardcoded
literal `'/'` after account deletion, so there is no redirect risk; a full reload
there is arguably correct because it discards all client state. Warning only,
left unchanged — out of this batch's scope.

---

## Phase 2 — B10-A: Frontend correctness leftovers — ✅ Complete in code

**Branch:** `b10a-b14b/error-boundaries-logout-ci-security` (not merged, not pushed)
**Date:** 2026-09-14

### Error boundary structure (F-COR-5)

`app/error.tsx` emitted its own `<html>`/`<body>` from a segment boundary, which
nests a second document inside the root layout, and no `app/global-error.tsx`
existed at all — so a root-layout failure had no boundary.

- `app/error.tsx` → `app/global-error.tsx` (git-tracked rename). It keeps the
  document shell, which is correct there because it stands in for the root layout.
  It now imports `@/app/globals.css` directly: a global error replaces the root
  layout, so the layout's stylesheet is not applied and the page would otherwise
  render unstyled. It also logs the error, which the previous version discarded.
- A new plain `app/error.tsx` catches root-segment errors inside the layout and
  surfaces `error.digest` so a production report is traceable.
- `app/(app)/error.tsx` and `app/admin/(console)/error.tsx` are untouched, as the
  plan requires.

### Canonical logout (F-COR-6)

`lib/auth/logout.ts` is new and is the only client-side logout implementation.
`components/layout/Topbar.tsx` and `lib/admin/session.ts` now both delegate to it
and differ only in destination. Behaviour corrected, not just deduplicated:

- The two network steps settle independently. Previously both ran in one `try`, so
  a failing provider sign-out skipped the cookie clear and left a usable
  server-side session.
- Navigation runs in `finally` — an offline browser still leaves the
  authenticated view.
- A non-2xx response to the cookie-clearing call is reported as a failure. `fetch`
  rejects only on transport errors, so a 5xx previously read as a clean logout.
- `redirectTo` is constrained to app-relative paths, so logout cannot become an
  open redirect.

`app/api/auth/session/route.ts` and `app/api/auth/logout/route.ts` are unchanged,
as the plan requires. Documented in [`AUTHENTICATION.md`](AUTHENTICATION.md) §7a.

**Not in scope, already done:** I-12-B5 dead-code removal was closed by the
2026-09-13 cleanup pass; the master roadmap records it as RESOLVED.

**Tests:** `lib/__tests__/b10a-error-boundaries-and-logout.test.ts` — 12 tests
covering both boundary shapes and the logout failure modes.

---

## Phase 2 — B14-B: CI security gates and Dependabot — ✅ Complete in code

**Branch:** `b10a-b14b/error-boundaries-logout-ci-security` (not merged, not pushed)
**Date:** 2026-09-14

A new `security-audit` job in `.github/workflows/ci.yml`, separate from
`build-and-validate` so a finding is its own check, and not a dependency of
`deploy-supabase` so it cannot silently hold back an otherwise-correct migration
deploy. The job installs nothing — `npm audit` resolves from the committed
lockfile — so it executes no third-party install script.

| Control | Implementation |
|---|---|
| Dependency audit | `scripts/ci/audit-gate.ts` — blocks on high/critical, reports moderate/low, allows only reviewed and dated exceptions |
| Audit exceptions | `scripts/ci/npm-audit-allowlist.json` — every entry carries a reachability `reason` and a `reviewBy` date; expired entries block again |
| Secret scanning | `gitleaks` 8.30.1, pinned by SHA-256, config in `.gitleaks.toml` |
| Dependency updates | `.github/dependabot.yml` — npm (`/apps/web`, `/`) and github-actions, weekly |

Policy is documented in [`SECURITY.md`](SECURITY.md) §5. No application file
changed except one test fixture — see below.

### What the gates found on their first run

- **Two Next.js critical advisories blocked the audit gate** (GHSA-p293-qw3h-jr36,
  GHSA-2xp9-vwfh-vxw4), deliberately **not** allowlisted because the AVIF
  image-optimizer RCE is plausibly reachable. **Resolved by the Phase 2 security
  prerequisite below.** ISSUE-25.
- **A 28-character prefix of the live `RESEND_API_KEY` was committed** in
  `lib/__tests__/system-monitoring.test.ts`, introduced at `f839ef3` and still in
  git history. The fixture is now synthetic, but the key requires rotation.
  Tracked as ISSUE-26.
- Nine high advisories (`sharp`, `postcss`, `fast-uri`, `js-yaml`) were reviewed
  and allowlisted with reachability analysis and a 2026-10-15 review date. The
  `sharp` entry records a caveat: the locked plan's "not reachable, every remote
  image uses `unoptimized`" premise is weaker than stated, since `unoptimized` is
  set per call site and the optimizer endpoint remains enabled.

### Validation performed locally

- `gitleaks` 8.30.1 run over an export of tracked files only (what CI checks out):
  **no leaks found**.
- Planted-secret test: a forged Supabase service-role JWT and a Resend-shaped key
  both fail the scan with the named Prodily rules. The service-role rule was
  corrected after the first attempt matched only one of the three base64
  alignments of the `service_role` claim.
- Audit gate exercised against the real dependency tree and unit-tested for the
  unreviewed, expired, accepted, stale and moderate-severity paths.

**Tests:** `lib/__tests__/b14b-ci-security-gates.test.ts` — 13 tests.

---

## Phase 2 — B7-A: Canonical actor resolution — ✅ Complete in code

**Branch:** `b10a-b14b/error-boundaries-logout-ci-security` (not merged, not pushed)
**Date:** 2026-09-14

**Scope, exactly as specified:** `apps/web/lib/api/actor.ts` and its test. Zero
routes and zero existing helpers changed; nothing in production imports it yet.

`resolveActor(request, policy)` answers "who is making this request?" in one place.
It **delegates** rather than reimplements, which is the point of the batch:
`requireAdminUser` keeps its service-role re-read of `is_admin` and its
`access_denied` audit logging, and `getAuthenticatedUserFromRequest` keeps its
bearer/cookie/refresh-token resolution and per-request WeakMap.

**Actor is a discriminated union** — `anonymous`, `learner`, `admin`, `cron` — so a
handler narrowed to `admin` reaches `userId` without a cast and one that is not,
cannot.

**Security properties, each pinned by a test:**

- **Fail-closed.** `policy.allow` is mandatory and non-empty; an empty list throws
  rather than defaulting to public.
- **No escalation.** An unrecognised credential resolves to `anonymous` where the
  policy permits it and is refused otherwise. It is never promoted to admin.
- **A missing secret grants nothing.** An unset or empty `CRON_SECRET` refuses every
  caller, rather than being read as "no check required".
- **Constant-time cron comparison.** SHA-256 digests fed to `timingSafeEqual`;
  hashing first is what makes unequal lengths safe, since a length guard would leak
  the secret's length. This replaces the plain `===` bearer comparison the six cron
  routes each hand-roll today, when B7-C migrates them.
- **Policy-gated probing.** A route that does not accept cron never has its
  `Authorization` header compared against the cron secret.
- **Denial reasons stay internal.** The refusal carries a `reason` for logs and a
  generic `code` for clients, preserving the I-03-B6 enumeration fix.
- **Memoization preserved**, per request *and* per policy, order-insensitive.

**Deviation from the roadmap, deliberate.** The roadmap lists `webhook` and
`internal` as actor kinds. Neither is modelled:

- `webhook` — `app/api/auth/send-email-hook` and `app/api/email/webhooks`
  authenticate by HMAC over the **raw request body**. A resolver that read the body
  would consume the stream the route still needs, and lifting that route-local
  `verifyHookSecret` here would mean reimplementing it, which this batch exists to
  avoid. Those routes keep their own verification until a body-aware policy is
  designed. **Open for whichever batch migrates the webhook routes.**
- `internal` — no mechanism distinct from cron or admin exists in the code today.
  `app/api/admin/emails/production-send` uses `requireAdminUser` like any other
  admin route. Modelling a kind nothing can return would be a lie in the type.

**Tests:** `lib/__tests__/b7a-resolve-actor.test.ts` — 28 tests across actor kinds,
fail-closed behaviour, policy precedence, memoization, secret comparison and
actor shape.

---

## Phase 2 — B7-B: `withRoute()` contract wrapper — ✅ Complete in code

**Branch:** `b10a-b14b/error-boundaries-logout-ci-security` (not merged, not pushed)
**Date:** 2026-09-14

**Scope, exactly as specified:** `apps/web/lib/api/with-route.ts` and its test.
**Zero routes migrated** — pinned by a test that walks `app/api/**/route.ts` and
asserts none of them imports the wrapper.

`withRoute(config, handler)` owns four things and nothing else:

| Responsibility | Built on |
|---|---|
| Actor policy | `resolveActor` (B7-A), fail-closed |
| Body and query validation | Schemas the route declares |
| Declarative rate limiting | `evaluatePersistentRateLimit`, fail-closed where asked |
| ADR-006 error envelope | `apiError` / `apiInternalError` |

Business logic, authorization beyond actor kind, and success-path response
shaping stay with the route: a handler returns its own `Response` and the
wrapper passes it through untouched, status and headers included.

**Order of operations, and why.** Actor first, so an unauthenticated flood is
refused before it can consume limiter budget. Validation next, so a rule may key
on the parsed body — which is what the login and signup routes need. The limiter
last, immediately before the handler.

**Error contract.** A handler raises `RouteError(status, code, message, extra?)`
for an *expected* refusal: it maps straight to that status and code with no
incident row and no `errorId`. Anything else is a genuine fault and goes through
`apiInternalError`, which records a structured incident and returns generic copy
plus a correlating `errorId` — the exception text never reaches the client. Every
refusal is emitted through `apiError`, so ADR-005 redaction still applies as a
last line of defence even when a handler is careless with a `RouteError` message.

**Byte-compatibility with the existing contract is proven, not asserted.** Three
tests compare the wrapper's serialized response body against a direct `apiError`
call for a 401 denial, a 409 `RouteError` and a 429 refusal, and assert the bytes
are identical. A fourth pins the 500 envelope's exact key set
(`code`, `error`, `errorId`, `success`).

**Non-enumerating throttling.** All declared rules are evaluated rather than
short-circuiting, so every bucket is charged consistently; the refusal reports the
longest reset across them and never says which rule tripped. That preserves the
I-03-B6 fix — distinguishing an IP limit from an email limit is an
account-enumeration oracle.

**Known gap for B7-C.** The wrapper does not log denied requests. `retry-failed`
and three other cron routes currently `logSystemError` on an unauthorized attempt,
and the roadmap requires B7-C to preserve that. B7-C will need an `onDenied` hook
here; it was not added speculatively, with no consumer to shape it.

**Tests:** `lib/__tests__/b7b-with-route.test.ts` — 34 tests across actor policy,
validation, rate limiting, error handling, handler pass-through, envelope
byte-compatibility, and the no-route-migrated assertion.

---

## Open questions for a human

Recorded here rather than acted on, per the reconciliation scope.

1. **I-04-B3 intent conflict.** The plan wants a circuit breaker that hard-stops both
   providers on capacity exhaustion; ADR-002 and the shipped code fail over to the
   secondary instead. Both cannot be the top-level policy. Decide which, then update
   the loser.
2. **Signup reopening.** L-09 holds signup CLOSED until §20 of the plan is satisfied.
   The incident fix addresses several §20 preconditions but not Turnstile (I-03-B7).
   Reopening remains a human decision.

---

## Deferred Findings (B4+)

Carried forward from the locked plan, updated for the statuses above:

- **B7 (I-07):** Shared `withRoute()` route contract wrapper.
- **B8 (I-08):** Typed data layer repository layer without `as unknown as`.
- **B9 (I-10):** Admin observability, incident alerting, and uptime monitors.
- **B10 (I-11):** Frontend data layer standardization.
- **B11 (I-13):** Design system adoption.
- **B12 (I-14):** Marketing performance optimizations.
- **B13 (D-01 / D-04):** Mobile platform evaluation & client-agnostic API readiness.
- **B14 (I-01):** CI security gates (`npm audit`, secret scanning, script-free installs).
