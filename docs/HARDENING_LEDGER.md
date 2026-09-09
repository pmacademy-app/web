# Prodily Production Hardening — Implementation Ledger

**Branch of Record:** `implementation/prodily-hardening`
**Synchronized With:** `origin/main` @ `10a21a5` (merged 2026-09-10)
**Date:** 2026-09-10
**Status:** B0 complete · B1 complete · Signup-abuse incident fixed on `main` · **B2 is next**

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
| 1 | **B0** — baseline | hardening branch | ✅ Complete |
| 2 | **B1** — database / security exposure | hardening branch | ✅ Complete in code · ⚠️ migration not yet applied |
| 3 | **Signup-abuse incident (2026-09-09)** | `main` @ `10a21a5` | ✅ Complete in code · ⚠️ not verified in production |
| 4 | **B2** — public portfolio XSS | — | ⬜ **NEXT** |

---

## Baseline (B0) — ✅ Complete

- **Branch:** `implementation/prodily-hardening`
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
- **Deployment Requirement:** Migration `20260910000001_security_hardening_b1.sql` must be applied to staging and verified before applying to production. **It has not been applied anywhere yet.**
- **Migration renumbered 2026-09-10.** This migration was originally authored as `20260909000001_security_hardening_b1.sql`. The incident fix on `main` independently added `20260909000001_signup_abuse_email_governance.sql`, so after the merge two migrations shared the version `20260909000001` — the Supabase CLI keys `schema_migrations` on that version string, so the pair would not have applied correctly. The B1 file was renumbered (rather than the incident file) because the incident migration is the one already on `main` and closer to deployment, while B1's had not been applied anywhere. Only the filename and its header comment changed; the SQL body is untouched, and `rls.test.ts` locates the file by the `security_hardening_b1` substring rather than by version, so no test or code reference needed changing.

---

## Signup-Abuse Incident (2026-09-09) — ✅ Complete in code, on `main`

**Commit:** `10a21a5` — *fix: harden signup email abuse and provider failover*
**Merged into this branch:** `edfa701` (2026-09-10)
**Source investigation:** [`audits/INCIDENT_2026-09-08_SIGNUP_EMAIL_ABUSE.md`](audits/INCIDENT_2026-09-08_SIGNUP_EMAIL_ABUSE.md)

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

## B2 — Public Portfolio XSS / Untrusted JSON Serialization — ⬜ **NEXT**

**Not implemented.** No code for this batch exists on either branch.

- **Primary finding:** S2-C3 (plan reference: I-12).
- **Objective:** escape `</script>` sequences in `JSON.stringify` output embedded in
  public portfolio pages, and validate URL schemes on learner-supplied profile links.
- **Why it is still next:** the incident work touched the email and abuse-control
  surface only. It neither fixed nor blocked S2-C3, and nothing discovered during the
  2026-09-10 reconciliation changes B2's priority or scope.

---

## Roadmap — current status

Statuses below were established by reading the merged code, not by reading commit
messages. "Plan ref" points at the batch specification in
[`FINAL_IMPLEMENTATION_PLAN.md`](FINAL_IMPLEMENTATION_PLAN.md).

| Batch | Plan ref | Status | Notes |
|---|---|---|---|
| **B0** — baseline | — | ✅ Complete | |
| **B1** — database / security exposure | I-02 | ✅ Complete in code | Migration unapplied |
| **B2** — portfolio XSS | I-12 | ⬜ **Next** | S2-C3 untouched |
| **B3** — session/token architecture | I-06, I-07 | ⬜ Outstanding | Unaffected by the incident |
| **B4** — email gateway + signup ordering | I-04 | 🟡 **Largely delivered by `10a21a5`** | See below |
| **B5** — atomic rate limiting + abuse controls | I-03 | 🟡 **Largely delivered by `10a21a5`** | See below |
| **B6** — provider failover + email reliability | I-04, I-05 | 🟡 **Partially delivered by `10a21a5`** | See below |
| **B7** — shared auth + route/error contract | I-07 | ⬜ Outstanding | |
| **B8** — typed data layer + DB correctness | I-08 | ⬜ Outstanding | Includes the P0 leaderboard column bug (I-08-B1) |
| **B9** — admin controls + observability | I-10 | ⬜ Outstanding | |
| **B10** — frontend API/data layer | I-11 | ⬜ Outstanding | |
| **B11** — design system migration | I-13 | ⬜ Outstanding | |
| **B12** — marketing performance | I-14 | ⬜ Outstanding | |
| **B13** — mobile/API readiness | D-01, D-04 | ⬜ Outstanding | Decision still deferred |
| **B14** — CI/security/E2E hardening | I-01 | ⬜ Outstanding | |

### B4 / B5 / B6 reassessment against `10a21a5`

The incident fix implemented a substantial part of these three batches. **Do not
re-implement the items marked ✅.**

| Plan batch | Status | Evidence / deviation |
|---|---|---|
| **I-03-B1** atomic rate-limit RPC | ✅ Done | `consume_rate_limit` in the incident migration |
| **I-03-B2** limiter + explicit fail mode | ✅ Done (variant) | Shipped as `failClosed?: boolean` rather than the planned `failMode: 'open' \| 'closed'`. Functionally equivalent; adopt the shipped shape rather than churning the API |
| **I-03-B3** trusted client IP helper | 🟡 Partial | `lib/security/client-ip.ts` exists and is used by signup, resend-verification, waitlist, contact and the auth hook. **`app/api/auth/telemetry/route.ts:130` still reads the leftmost `X-Forwarded-For`** |
| **I-03-B4** fail-closed limits on unprotected endpoints | 🟡 Partial | `waitlist` and `resend-verification` done. **`/api/auth/login` and `/api/auth/update-password` still have no rate limiting at all** — F-SEC-5 remains open |
| **I-03-B5** global signup ceiling | ✅ Done | `signup_global` key, hourly, derived from the configured daily email limit |
| **I-03-B6** close enumeration oracles | 🟡 Partial | Rate-limit refusals no longer say which bucket tripped, and resend-verification is non-enumerating. **Signup still returns an explicit `409 USER_EXISTS`**, so the oracle is not closed |
| **I-03-B7** Turnstile | ⬜ Outstanding | No CAPTCHA provider is configured anywhere in the repo or environment |
| **I-04-B1** `from_email`/`reply_to` on `email_queue` | ⬜ Outstanding | |
| **I-04-B2** kill switch in the direct transport | 🟡 Partial | `EMAIL_ENABLED` is enforced in the **gateway**, not inside `sendEmail()`. Callers that still bypass the gateway (admin test-send, dev test-send, webhook bounce alert, campaign runner) do **not** honour it |
| **I-04-B3** global ceiling + circuit breaker above failover | 🟡 Partial — **and its stated intent now conflicts with ADR-002** | An aggregate hourly ceiling (`email_global:governed`) and per-provider exhaustion marking exist. But this batch's objective reads *"trips to a hard stop rather than shifting volume to the secondary"*, whereas ADR-002 and the incident fix deliberately **do** fail over on capacity exhaustion. L-10 asks for both bounded failover *and* a breaker above it. **Needs a human decision before implementation** — see Open Questions |
| **I-04-B4** route `sendEmail()` through `sendEmailWithFailover()` | ⬜ Outstanding | `lib/email.ts` still carries its own Brevo and Resend `fetch` transports, duplicating `lib/notifications/providers/*`. They now share classification and provider resolution, but not the transport |
| **I-04-B5** route the auth hook through the queue | 🔄 **Superseded in mechanism, objective met** | The hook now goes through the synchronous governed gateway, not the queue. The objective (no ungoverned egress on the hook path, L-10) is satisfied. Queuing it would add latency to verification email, and the plan itself gated this batch on I-05-B1/B2, which are not done. **Re-open only if queueing is wanted for its own sake** |
| **I-04-B6** verification before durable side effects | ✅ Done (variant) | No `public.users` row, no welcome email and no attribution before verification under Flow A. `refCode` is validated and carried in auth metadata rather than in a new pending-referral table, so **the planned migration was not needed**. Note Flow B (`requireEmailVerification = false`) still creates the profile at signup — correct, since `admin.createUser({ email_confirm: true })` makes that the registration milestone under that configuration |
| **I-04-B7** migrate remaining direct callers | 🟡 Partial | `/api/contact` and `/api/waitlist` now go through the gateway. **Still direct:** admin test-send, dev send-test-email, the webhook bounce alert, and `lib/campaigns/portfolio-activation-runner.ts`. The two raw Resend `fetch` calls flagged as F-REL-8 (`lib/notifications/automations/service.ts:93`, `app/api/email/webhooks/route.ts:92`) **still have no timeout** |
| **I-05-B1…B5** queue & scheduler reliability | ⬜ Outstanding | Untouched by the incident fix |

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
3. **Unprotected auth endpoints.** `/api/auth/login` has no rate limiting (F-SEC-5).
   This is a live gap, scheduled under B5 / I-03-B4, not fixed by the incident work.

---

## Deferred Findings (B3+)

Carried forward from the locked plan, updated for the statuses above:

- **B3 (I-06 / I-07):** Session token cleanup from response bodies (`session: authData.session` removal) & JWT cryptographic verification.
- **B7 (I-07):** Shared `withRoute()` route contract wrapper.
- **B8 (I-08):** Typed data layer repository layer without `as unknown as`.
- **B9 (I-10):** Admin observability, incident alerting, and uptime monitors.
- **B10 (I-11):** Frontend data layer standardization.
- **B11 (I-13):** Design system adoption.
- **B12 (I-14):** Marketing performance optimizations.
- **B13 (D-01 / D-04):** Mobile platform evaluation & client-agnostic API readiness.
- **B14 (I-01):** CI security gates (`npm audit`, secret scanning, script-free installs).
