# Prodily — Target Architecture

> **Status:** VERIFIED DESIGN — Ready for implementation
> **Updated:** 2026-08-21 (Second-pass audit)
> **Based on:** VERIFIED_AUDIT.md

---

## 1. Frontend

### CURRENT
- Next.js 16.2.12 with App Router
- Route groups: (marketing), (auth), (app), (portfolio), admin/
- Auth state managed by `AuthStateListener` client component in root layout
- Protected routes: server layout components read cookies and redirect

### TARGET
- Next.js 16.2.12 with App Router — **NO CHANGE NEEDED**
- Route groups: unchanged
- Auth state managed by `@supabase/ssr` — no client-side listener needed
- Protected routes: `middleware.ts` handles interception + token refresh at edge; server layouts validate session via `createServerClient()`
- Delete `<AuthStateListener />` from root layout after middleware is wired

### WHY
The AuthStateListener is a workaround for the absence of middleware. Middleware handles session refresh before the request reaches the server component, making the client-side listener redundant.

### MIGRATION STRATEGY
1. Rename `proxy.ts` → `middleware.ts`; rename export `proxy` → `middleware`
2. Install `@supabase/ssr`
3. Rewrite middleware to use `@supabase/ssr` createServerClient
4. Verify protected routes work without AuthStateListener
5. Remove AuthStateListener
6. Remove `/api/auth/session` endpoint

---

## 2. Backend

### CURRENT
- 25 top-level API route groups, ~57 route files
- Auth extraction: `getAuthenticatedUserFromRequest()` — reads Authorization header or sb-access-token cookie
- Admin auth: `isAdminUser()` — dual-gate (ADMIN_EMAILS env var OR users.is_admin DB flag)
- Cron routes: protected by CRON_SECRET header

### TARGET
- Same API surface — NO structural change
- Auth extraction: simplify to `createServerClient(request).auth.getUser()` using `@supabase/ssr` per-request client
- Admin auth: unchanged — dual-gate is correct
- Cron routes: unchanged

### WHY
The backend API surface is correct. The auth extraction can be simplified once `@supabase/ssr` is adopted, but this is an improvement, not a requirement.

### MIGRATION STRATEGY
- No breaking changes required
- Gradually update API routes to use `createServerClient()` from `@supabase/ssr` as they are touched
- `getAuthenticatedUserFromRequest()` can coexist during migration

---

## 3. Auth

### CURRENT
```
Login:
  signInWithPassword()
  → POST /api/auth/session (manual session sync)
  → router.push('/dashboard')
  → layout reads sb-access-token cookie

Refresh:
  supabase-js fires TOKEN_REFRESHED in browser
  → AuthStateListener → POST /api/auth/session
  → cookie updated
  [PROBLEM: proxy.ts is dead code — server side never refreshes]

Signup Verification:
  signUp() → verification email (via send-email-hook)
  → user clicks link → /api/auth/callback
  → verifyOtp() → redirectWithSession() sets cookies

Logout:
  signOut() → SIGNED_OUT event → POST /api/auth/session (clears cookies)
```

### TARGET
```
Login:
  signInWithPassword()
  → @supabase/ssr automatically manages cookies
  → router.push('/dashboard')
  → middleware validates session, refreshes if needed
  → layout creates serverClient() — reads valid session

Refresh:
  middleware.ts intercepts every request
  → createServerClient().auth.getUser()
  → @supabase/ssr refreshes expired access token via refresh token
  → writes updated cookies to response headers
  [NO client-side listener needed]

Signup Verification:
  Unchanged — /api/auth/callback still handles token_hash
  [Minor: use standard client instead of service role for verifyOtp]

Logout:
  signOut() → @supabase/ssr clears cookies
  → middleware blocks subsequent requests to protected routes
```

### WHY
`proxy.ts` already implements the correct logic. The rename + `@supabase/ssr` adoption eliminates the manual session bridge and makes token refresh reliable.

### DOES @supabase/ssr SOLVE THE PROBLEMS?
| Problem | Solved by @supabase/ssr? | Notes |
|---------|--------------------------|-------|
| No active token refresh | YES — middleware calls getUser() which refreshes | Requires middleware to be wired |
| Race condition on login | YES — no manual POST needed | supabase-js manages cookies automatically |
| AuthStateListener on every nav | YES — listener not needed | Can be deleted |
| /api/auth/session endpoint | YES — can be deleted | No longer needed |
| Service role for verifyOtp | NO — separate fix needed | Use anon client in callback |

### WHAT @supabase/ssr DOES NOT SOLVE
- Welcome email duplication — code issue, not auth
- Database type drift — separate fix
- Missing E2E tests — separate concern
- Production migration safety — separate concern

### IMPORTANT: httpOnly Cookie Warning
`@supabase/ssr` requires that session cookies are NOT `httpOnly`. The library's `createBrowserClient` reads cookies directly from the browser to restore session state. If cookies are `httpOnly`, the browser client cannot read them, causing an auth state mismatch and potential redirect loops. The current `proxy.ts` sets `httpOnly: true` — this MUST change in the new implementation.

### MIGRATION RISKS
- `proxy.ts` has `httpOnly: true` — correct behavior for the current custom bridge (browser reads from supabase-js's own internal storage). With `@supabase/ssr`, remove `httpOnly: true` from session cookies.
- Any code reading `sb-access-token` cookie directly must be updated once the cookie name changes (supabase/ssr uses different cookie names by default)

### MIGRATION STRATEGY
1. `npm install @supabase/ssr`
2. Create `lib/supabase/server.ts` — `createServerClient()` factory using @supabase/ssr
3. Create `lib/supabase/client.ts` — `createBrowserClient()` factory using @supabase/ssr
4. Rename `proxy.ts` → `middleware.ts`, rename export `proxy` → `middleware`
5. Rewrite middleware body to use `createServerClient` from step 2
6. Test: login → protected route → token expiry simulation → verify auto-refresh
7. Update `app/(app)/layout.tsx` and `app/admin/(console)/layout.tsx` to use `createServerClient()`
8. Update login page — remove manual POST to /api/auth/session
9. Remove `AuthStateListener`
10. Remove `/api/auth/session/route.ts`
11. Keep `/api/auth/callback/route.ts` — update to use anon client instead of service role

---

## 4. Session

### CURRENT
- Custom HTTP-only cookies: `sb-access-token` (1hr maxAge), `sb-refresh-token` (30d maxAge)
- Set manually by `/api/auth/session` and `/api/auth/callback`
- Read by server layout components via `cookies().get('sb-access-token')`

### TARGET
- `@supabase/ssr` cookie management — library handles cookie names and maxAge
- Middleware refreshes tokens before server components render
- Cookie name changes from `sb-access-token` to Supabase SSR default names (project-ref based)

### WHY
The custom cookie names and management are replaced by @supabase/ssr's standard approach. The library names cookies using the Supabase project reference for isolation.

### MIGRATION STRATEGY
- The cookie name change means existing sessions will be lost during migration (users will need to log in again after deployment). This is acceptable for a learning platform — no financial or safety impact.
- Communicate the session migration to users if needed (unlikely — most users have short sessions anyway)

---

## 5. Supabase

### CURRENT
- `@supabase/supabase-js` v2.110.8 — browser SDK only
- No `@supabase/ssr`
- Three client factories: `createServiceRoleClient()`, `createBrowserSupabaseClient()`, `createAuthenticatedServerClient(token)`
- Migrations: 28 files, applied via `supabase db push` in CI to production

### TARGET
- `@supabase/supabase-js` — unchanged (still needed for service role)
- `@supabase/ssr` — added for server-side session management
- Client factories:
  - `createServiceRoleClient()` — unchanged, server-only, RLS bypass
  - `createBrowserClient()` — replaces `createBrowserSupabaseClient()`, uses @supabase/ssr
  - `createServerClient()` — replaces `createAuthenticatedServerClient()`, uses @supabase/ssr
  - `createAdminServerClient()` — for API routes requiring service role (unchanged behavior)
- Migrations: add staging project before applying to production

### MIGRATION STRATEGY
- Keep `lib/supabase.ts` for service role client + Database type
- Add `lib/supabase/server.ts` for `@supabase/ssr` createServerClient
- Add `lib/supabase/client.ts` for `@supabase/ssr` createBrowserClient
- Gradually update import sites

---

## 6. Database

### CURRENT
- Database type: manually maintained, 18 tables defined, 20 tables missing type definitions
- Widespread `as any` casts for untypes tables
- `supabase gen types` not used

### TARGET
- Database type: auto-generated via `supabase gen types typescript --project-id <id>`
- Output to `supabase/types.ts`
- Import in `lib/supabase.ts`: `export type { Database } from '../../supabase/types'`
- Remove manually maintained type definitions from `lib/supabase.ts`
- Run type generation as part of post-migration step in CI

### WHY
Manual maintenance guarantees drift. Auto-generation guarantees accuracy.

### MIGRATION STRATEGY
1. Run `supabase gen types typescript --project-id <SUPABASE_PROJECT_ID> > supabase/types.ts`
2. Export from `lib/supabase.ts`
3. Fix TypeScript errors from newly typed tables (remove `as any` casts)
4. Add to CI: after `deploy-supabase` step, regenerate types and fail if diff is non-empty

---

## 7. RLS

### CURRENT
- Core user tables: correctly configured with `auth.uid() = user_id` policies
- System tables: RLS enabled with no public policies (service-role-only access) — CORRECT
- Unknown: certificates, user_leaderboard_settings, weekly_leaderboard_snapshots, user_friends, user_feedback, contact_messages, admin_audit_logs

### TARGET
- Document every table's policy explicitly in `docs/RLS_POLICIES.md`
- Verify the 7 unknown tables in Supabase dashboard
- No functional change needed for correctly configured tables

### MIGRATION STRATEGY
1. Log into Supabase dashboard
2. For each unknown table, verify RLS policies
3. Document all policies in `docs/RLS_POLICIES.md`
4. If gaps found, add migrations to fix

---

## 8. API Routes

### CURRENT
- Auth extraction inconsistent (some routes use header, some use cookies)
- Service role used where anon client sufficient (callback route)

### TARGET
- Standardize to `@supabase/ssr` createServerClient per-request
- Callback route: use anon client for exchangeCodeForSession and verifyOtp
- Admin API routes: dual-gate authorization unchanged
- Cron routes: CRON_SECRET validation unchanged

### MIGRATION STRATEGY
- Gradual migration as routes are touched
- `getAuthenticatedUserFromRequest()` can coexist during transition

---

## 9. Email

### CURRENT
- Auth emails: send-email-hook → Resend (synchronous, correct)
- Queue: email_queue table → processed by GitHub Actions cron
- Welcome email: dispatched TWICE (auth.ts + send-email-hook)
- Waitlist confirmation: raw HTML, not using template system

### TARGET
- Auth emails: unchanged — send-email-hook pattern is correct
- Queue: unchanged for non-critical notifications (recaps, achievements)
- Welcome email: dispatched ONCE from auth.ts only — remove from send-email-hook
- Waitlist confirmation: use `renderEmailTemplate('auth.waitlist_confirm', ...)` when template is created
- `SEND_EMAIL_HOOK_SECRET`: required, fail fast if missing in production

### WHY
The email architecture is sound. Only the duplication and the optional secret need fixing.

### MIGRATION STRATEGY
1. Remove lines 320-341 from `send-email-hook/route.ts` (welcome email enqueue on signup)
2. Verify auth.ts `dispatchWelcomeEmailIfNeeded()` idempotency is correct
3. Add startup check: if production and SEND_EMAIL_HOOK_SECRET missing, throw
4. Create waitlist email template (if needed)

---

## 10. Notifications

### CURRENT
- Full pipeline: dispatcher → queue → processor → Resend
- In-app notification inbox in database
- Feature flags table
- Template system with versioning

### TARGET
- Unchanged — notification system is well-designed

### MIGRATION STRATEGY
- None required for the notification system itself
- Type safety will improve automatically once DB types are generated

---

## 11. Error Handling

### CURRENT
- `logSystemError()` → `system_errors` table with `as any` cast
- Deduplication by fingerprint (15-min window)
- Admin in-app notifications for critical errors
- No external observability (no Sentry)

### TARGET
- Same architecture, but `system_errors` will be type-safe after DB type generation
- Add external observability as a future phase (out of scope for current rebuild)

### MIGRATION STRATEGY
- Remove `as any` cast after DB type generation

---

## 12. Testing

### CURRENT
- 36 custom tsx scripts using Node assert
- No framework, no parallelism, no coverage
- Tests run against mock.supabase.co
- No E2E tests

### TARGET
- **Unit tests:** Vitest — pure logic tests (XP, SRS, streaks, badges, etc.)
- **Integration tests:** Vitest + real Supabase test project — RLS, API routes, email
- **E2E tests:** Playwright — auth lifecycle, protected routes, admin access
- **Coverage:** Vitest coverage (v8), minimum 80% for core business logic

### WHY VITEST
- Native ESM — compatible with Next.js 16 module system
- No transpilation step (unlike Jest)
- First-class TypeScript support
- Compatible with React Testing Library for component tests if needed

### WHY PLAYWRIGHT
- Supports Next.js App Router natively
- Handles SSR rendering correctly
- Can test real browser auth flows including cookie handling

### MIGRATION STRATEGY
1. Install Vitest, configure `vitest.config.ts`
2. Migrate pure logic tests (xp, srs, streaks, badges, etc.) — no Supabase dependency
3. Create Supabase test project (separate from production)
4. Write RLS tests against test project
5. Install Playwright
6. Write E2E auth tests
7. Delete `rls-service-role.test.ts`

---

## 13. CI

### CURRENT
- Single CI job: lint + typecheck + content:build + tests (mock) + brand check + build + supabase db push (main only)
- Tests run against mock — no real integration testing

### TARGET
```
PR / branch push:
  job: validate
    - checkout + Node 22
    - npm ci
    - npm run content:build
    - npm run lint
    - npm run typecheck
    - npm run test:unit          ← Vitest unit tests (no network)
    - npm run build              ← Next.js build
    - brand hardening checks

On merge to main:
  job: validate (same as above)
  job: test-integration          ← Vitest against Supabase test project
    - requires SUPABASE_TEST_PROJECT_ID secret
  job: deploy-staging            ← supabase db push to STAGING project
  job: deploy-production         ← supabase db push to PRODUCTION (after staging succeeds)
  job: smoke-tests               ← verify deployed app responds
```

### MIGRATION STRATEGY
1. Set up Supabase test project and add secrets to GitHub
2. Split npm test into `test:unit` (pure Vitest) and `test:integration` (Vitest + Supabase)
3. Add staging Supabase project
4. Update ci.yml with two-stage deployment

---

## 14. Vercel

### CURRENT
- Root `vercel.json` + `apps/web/vercel.json` (identical, duplicate)
- Vercel Dashboard root directory: UNKNOWN (needs verification)

### TARGET
- **Vercel Dashboard:** `Root Directory = apps/web`
- **`apps/web/vercel.json`:** minimal config (framework only)
- **Delete:** root `vercel.json`

```json
// apps/web/vercel.json (final)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

- Build command, install command, output directory: all inferred by Vercel from `nextjs` framework

### MIGRATION STRATEGY
1. Verify current Vercel Dashboard root directory setting
2. Ensure `Root Directory = apps/web` in dashboard
3. Delete root `vercel.json`
4. Test preview deployment on the audit branch

---

## 15. Environment Management

### Required Variables (Server-Only)
```
SUPABASE_SERVICE_ROLE_KEY     ← RLS bypass client (NEVER expose to browser)
SEND_EMAIL_HOOK_SECRET        ← Hook authentication (REQUIRED in production)
RESEND_API_KEY                ← Email delivery
ADMIN_EMAILS                  ← Comma-separated admin emails
CRON_SECRET                   ← Protects cron API endpoints
BREVO_API_KEY                 ← Optional email fallback (document or remove)
```

### Required Variables (Public, browser-safe)
```
NEXT_PUBLIC_SUPABASE_URL      ← Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY ← Supabase anon key
NEXT_PUBLIC_SITE_URL          ← Canonical URL for email links and SEO
```

### Missing
```
NODE_ENV                      ← Set by Vercel/Next.js automatically
```

### TARGET Changes
- `SEND_EMAIL_HOOK_SECRET`: add startup validation — fail fast if not set in production
- `BREVO_API_KEY`: document as optional fallback in `.env.example` with usage notes

---

## Summary: Minimal Changes to Fix Critical Problems

The following targeted changes address all CRITICAL and HIGH severity confirmed findings without unnecessary rewriting:

| Change | Files Affected | Fixes |
|--------|---------------|-------|
| Rename proxy.ts → middleware.ts, rename export | proxy.ts → middleware.ts | AUTH-001, AUTH-002 |
| Install @supabase/ssr, rewrite middleware body | middleware.ts, lib/supabase/server.ts | AUTH-001, AUTH-002, AUTH-003 |
| Remove AuthStateListener | app/layout.tsx, AuthStateListener.tsx | AUTH-004 |
| Remove /api/auth/session | app/api/auth/session/route.ts | AUTH-003 |
| Remove manual POST in login | app/(auth)/login/page.tsx | AUTH-003 |
| Generate Database types | supabase/types.ts, lib/supabase.ts | DB-001 |
| Remove welcome email from send-email-hook | app/api/auth/send-email-hook/route.ts | EMAIL-001 |
| Delete rls-service-role.test.ts | lib/__tests__/rls-service-role.test.ts | TEST-001 |
| Add Supabase test project to CI | .github/workflows/ci.yml | TEST-002 |
| Add staging deployment to CI | .github/workflows/ci.yml | DB-002 |
| Set Vercel Root Directory, delete root vercel.json | vercel.json | DEPLOY-001 |
| Make SEND_EMAIL_HOOK_SECRET required | app/api/auth/send-email-hook/route.ts | SEC-001 |
