# Prodily Production Hardening — Implementation Ledger

**Branch of Record:** `implementation/prodily-hardening`  
**Base Commit:** `edc7436f634665fd7cf79ef82d4d89352bd56e43` (`origin/main`)  
**Date:** 2026-09-08  
**Status:** B0 (Baseline) & B1 (Database / Security Exposure Hardening) Complete

---

## Baseline (B0)

- **Branch:** `implementation/prodily-hardening`
- **Starting SHA:** `edc7436f634665fd7cf79ef82d4d89352bd56e43`
- **Working-Tree State:** Clean
- **Baseline Verification Results:**
  - **Typecheck (`npm run typecheck`):** Passed (0 errors)
  - **ESLint (`npm run lint`):** Passed (0 errors, 29 pre-existing warnings in test/admin files)
  - **Unit & Integration Suite (`npm run test`):** Passed (113 test files, 1,192 tests passing)
  - **Production Build (`npm run build`):** Passed (Next.js 16.2.12 Turbopack, 225/225 static pages compiled and emitted)

---

## B0 — Completed Work

- Established clean operational baseline across all build and test surfaces.
- Inspected full migration history (`supabase/migrations/`), current Next.js route handlers (`app/api/`), server components (`app/(portfolio)/`, `app/verify/`), and services (`lib/`).
- Verified audit findings against current codebase state.
- Known pre-existing non-fatal warnings recorded: 29 ESLint warnings (unused variables in test mock helpers and admin components).

---

## B1 — Security & Database Hardening

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

1. **New Migration Added:** [`supabase/migrations/20260909000001_security_hardening_b1.sql`](../supabase/migrations/20260909000001_security_hardening_b1.sql)
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
- **Deployment Requirement:** Migration `20260909000001_security_hardening_b1.sql` must be applied to staging and verified before applying to production.

---

## Deferred Findings (B2+)

The following findings from the audit roadmap are intentionally deferred to subsequent batches per the locked plan:

- **B2 (I-12):** Portfolio XSS fix (`JSON.stringify` `<script>` escaping and URL schema validation).
- **B3 (I-06 / I-07):** Session token cleanup from response bodies (`session: authData.session` removal) & JWT cryptographic verification.
- **B4 (I-04):** Governed email egress boundary & signup ordering / auth hook hardening.
- **B5 (I-03):** Unified atomic rate limiting RPC, fail-closed modes, and trusted client IP derivation.
- **B6 (I-04):** Bounded email provider failover & circuit breaker.
- **B7 (I-07):** Shared `withRoute()` route contract wrapper.
- **B8 (I-08):** Typed data layer repository layer without `as unknown as`.
- **B9 (I-10):** Admin observability, incident alerting, and uptime monitors.
- **B10 (I-11):** Frontend data layer standardization.
- **B11 (I-13):** Design system adoption.
- **B12 (I-14):** Marketing performance optimizations.
- **B13 (D-01 / D-04):** Mobile platform evaluation & client-agnostic API readiness.
- **B14 (I-01):** CI security gates (`npm audit`, secret scanning, script-free installs).
