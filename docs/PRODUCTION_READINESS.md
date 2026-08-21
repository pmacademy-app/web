# Prodily — Production Readiness Criteria

> **Status:** VERIFIED — Each criterion has an objective verification method
> **Updated:** 2026-08-21

---

## Philosophy

Production readiness is NOT:
- `npm run build` exits 0
- `npm test` prints "All tests passed"

Production readiness is the ability to confidently answer:

> Can a real user sign up, verify their email, log in, use the app for weeks without being unexpectedly logged out, reset their password, and not receive duplicate emails — while an admin can see system errors, and a bad migration cannot silently corrupt production data?

Each criterion below has a specific, objective test that proves it.

---

## 1. Authentication

### 1.1 Signup Flow
**Criterion:** A new user can sign up with email/password and receive exactly one verification email.

**Verification:**
```bash
# E2E test: e2e/auth/signup.spec.ts
playwright test auth/signup

# Manual: sign up with a test email address, check inbox for exactly one email
```
**Pass condition:** E2E test green. Exactly one verification email received (not two).

---

### 1.2 Email Verification
**Criterion:** Clicking the verification email link creates an authenticated session.

**Verification:**
```bash
playwright test auth/signup  # includes verification simulation
```
**Pass condition:** After clicking link, user is redirected to /verified and has a valid session cookie.

---

### 1.3 Login
**Criterion:** A verified user can log in and immediately access protected routes.

**Verification:**
```bash
playwright test auth/login
```
**Pass condition:** Login → /dashboard renders without a redirect loop. No error about session initialization.

---

### 1.4 Token Refresh
**Criterion:** A user with an expired access token but valid refresh token is not redirected to login.

**Verification:**
```bash
playwright test auth/token-refresh
```
**Manual test:** Log in, wait for token expiry (or manually set cookie maxAge to past), navigate to a protected page. Verify the page loads.

**Pass condition:** Page loads without redirect to /login. New access token cookie is set by middleware.

---

### 1.5 Session Persistence
**Criterion:** Closing and reopening the browser does not log the user out (within refresh token lifetime).

**Verification:**
```
Manual: Log in → close browser completely → reopen → navigate to /dashboard
```
**Pass condition:** User is still authenticated, no redirect to /login.

---

### 1.6 Logout
**Criterion:** After logout, protected routes redirect to /login.

**Verification:**
```bash
playwright test auth/login  # includes logout assertion
```
**Pass condition:** After signOut, /dashboard → redirects to /login.

---

### 1.7 Password Reset
**Criterion:** A user can reset their password via email and log in with the new password.

**Verification:**
```bash
playwright test auth/password-reset
```
**Pass condition:** Reset email received, new password set, login with new password succeeds.

---

## 2. Authorization

### 2.1 Protected Route Guard (Unauthenticated)
**Criterion:** An unauthenticated user visiting any /app route is redirected to /login.

**Verification:**
```bash
playwright test auth/protected-route
```
**Pass condition:** /dashboard, /academy/*, /settings, /progress all redirect to /login without rendering any protected content.

---

### 2.2 Admin Route Guard (Non-Admin)
**Criterion:** An authenticated but non-admin user visiting /admin is redirected to /admin/access-denied.

**Verification:**
```bash
playwright test auth/protected-route  # includes admin access test
```
**Pass condition:** Regular user cannot access admin console.

---

### 2.3 Admin Route Guard (Admin)
**Criterion:** An admin user can access /admin.

**Verification:**
```
Manual: Log in as admin → navigate to /admin
```
**Pass condition:** Admin console renders.

---

## 3. Database

### 3.1 RLS — User Data Isolation
**Criterion:** A user cannot read another user's lesson progress, reflections, bookmarks, or XP events.

**Verification:**
```bash
# Integration test: lib/__tests__/rls.test.ts
vitest run --config vitest.integration.config.ts rls
```
**Pass condition:** Querying another user's rows returns empty array (RLS filters silently).

---

### 3.2 RLS — System Tables
**Criterion:** Unauthenticated and authenticated non-admin users cannot read system_errors, rate_limits, email_queue admin data, or notification_feature_flags.

**Verification:**
```bash
vitest run --config vitest.integration.config.ts rls
```
**Pass condition:** Queries to service-role-only tables return 0 rows or permission error for non-service-role clients.

---

### 3.3 Database Type Safety
**Criterion:** All table accesses in the codebase are type-safe (no `as any` casts for table names or column access).

**Verification:**
```bash
npm run typecheck  # zero TypeScript errors
grep -rn "as any" apps/web/lib apps/web/app/api | grep "\.from(" | wc -l  # must be 0
```
**Pass condition:** typecheck passes. grep returns 0 matches.

---

### 3.4 Migration Safety
**Criterion:** Migrations run against staging BEFORE production. Production is only updated after staging succeeds.

**Verification:**
```
Review CI/CD pipeline: does deploy-staging job run before deploy-production?
Check: does deploy-production have `needs: deploy-staging`?
```
**Pass condition:** CI configuration shows explicit staging-first deployment order.

---

## 4. Email

### 4.1 Welcome Email — Exactly Once
**Criterion:** A new user receives exactly one welcome email.

**Verification:**
```
Manual: Sign up with a monitored email address. Count welcome emails received within 10 minutes.
Integration test: lib/__tests__/email-welcome.test.ts
```
**Pass condition:** Exactly one welcome email received.

---

### 4.2 Verification Email Delivery
**Criterion:** Verification emails are delivered within 60 seconds of signup.

**Verification:**
```
Manual: Sign up → measure time to inbox delivery.
```
**Pass condition:** Email delivered in under 60 seconds.

---

### 4.3 Password Reset Email Delivery
**Criterion:** Password reset emails are delivered within 60 seconds of request.

**Verification:**
```
Manual: Click "Forgot Password" → measure time to inbox delivery.
```
**Pass condition:** Email delivered in under 60 seconds.

---

### 4.4 Email Hook Authentication
**Criterion:** The send-email-hook endpoint rejects requests without a valid HMAC signature.

**Verification:**
```bash
# Integration test (already in send-email-hook.test.ts)
# Also: manual curl test with wrong secret
curl -X POST https://prodily.adityagangwani.me/api/auth/send-email-hook \
  -H "Content-Type: application/json" \
  -H "Authorization: v1,wrong_signature" \
  -d '{"user": {"id": "test", "email": "test@test.com"}, "email_data": {"token": "test", "token_hash": "test", "redirect_to": "https://test.com", "site_url": "https://test.com"}}'
```
**Pass condition:** Returns 401. Does not send any email.

---

## 5. API Security

### 5.1 Cron Endpoints Require CRON_SECRET
**Criterion:** Cron endpoints (/api/cron/*) reject requests without the correct Authorization header.

**Verification:**
```bash
curl -X POST https://prodily.adityagangwani.me/api/cron/process-email-queue
# Must return 401 or 403
```
**Pass condition:** 401/403 without Authorization header.

---

### 5.2 Admin Endpoints Require Admin Auth
**Criterion:** Admin API endpoints reject non-admin authenticated users.

**Verification:**
```
Manual: Call /api/admin/* with a non-admin user's access token.
```
**Pass condition:** 401 or 403.

---

### 5.3 Password Update CSRF Protection
**Criterion:** Password update route rejects requests from unexpected origins.

**Verification:**
```bash
# update-password.test.ts covers this
vitest run update-password
```
**Pass condition:** Test passes. Route rejects missing/wrong Origin header.

---

## 6. Request Interception & Proxy

### 6.1 proxy.ts is implemented with @supabase/ssr
**Criterion:** The file at `apps/web/proxy.ts` exports `export async function proxy(request: NextRequest)` and `config.matcher`, using `@supabase/ssr` `createServerClient` to synchronize cookies and validate sessions.

**Verification:**
```bash
cat apps/web/proxy.ts | grep "export.*function proxy" | wc -l  # must be 1
cat apps/web/proxy.ts | grep "export const config" | wc -l  # must be 1
cat apps/web/proxy.ts | grep "@supabase/ssr" | wc -l        # must be >= 1
```
**Pass condition:** All 3 exist and verify true.

---

### 6.2 Session bridge endpoint and listener deleted
**Criterion:** `/api/auth/session` route and `AuthStateListener` no longer exist.

**Verification:**
```bash
test -f apps/web/app/api/auth/session/route.ts && echo "EXISTS" || echo "DELETED"
test -f apps/web/components/layout/AuthStateListener.tsx && echo "EXISTS" || echo "DELETED"
```
**Pass condition:** Both are DELETED.

---

## 7. Error Handling

### 7.1 System Errors Logged to Database
**Criterion:** Failures in critical operations (email send, auth callback, cron) are logged to system_errors.

**Verification:**
```
Integration: Trigger a deliberate auth failure, check system_errors table.
```
**Pass condition:** Error record appears with correct severity, category, and fingerprint.

---

### 7.2 Admin Error Visibility
**Criterion:** Critical errors trigger admin in-app notifications.

**Verification:**
```
Integration: Log a critical error, check in_app_notifications for admin users.
```
**Pass condition:** In-app notification record created for all admin users.

---

## 8. CI/CD

### 8.1 Tests Run in CI
**Criterion:** CI runs Vitest unit tests on every push and PR.

**Verification:**
```
Review ci.yml: does the test step run vitest (not tsx scripts)?
```
**Pass condition:** test step uses `vitest run`, not `npm run test` that chains tsx scripts.

---

### 8.2 Tests Do Not Hit Production
**Criterion:** Unit and integration tests do not modify or read from the production Supabase instance.

**Verification:**
```
Review test config: SUPABASE_TEST_PROJECT_ID is separate from SUPABASE_PROJECT_ID.
Integration tests use SUPABASE_TEST_* secrets, not SUPABASE_SERVICE_ROLE_KEY.
```
**Pass condition:** Separate test project credentials in use.

---

### 8.3 Build Passes on Clean Branch
**Criterion:** A clean checkout of main builds successfully without manual intervention.

**Verification:**
```bash
git clone <repo> /tmp/prodily-test
cd /tmp/prodily-test/apps/web
npm ci
npm run build
```
**Pass condition:** Build exits 0.

---

## 9. Deployment

### 9.1 Vercel Deploys from apps/web
**Criterion:** Vercel builds from `apps/web/` as root directory.

**Verification:**
```
Vercel Dashboard → Project Settings → Root Directory = apps/web
```
**Pass condition:** Root Directory is set correctly in dashboard.

---

### 9.2 No Duplicate vercel.json
**Criterion:** Only one `vercel.json` exists (in apps/web/).

**Verification:**
```bash
find . -name "vercel.json" | wc -l  # must be 1
```
**Pass condition:** Exactly 1 vercel.json at apps/web/vercel.json.

---

### 9.3 Preview Deployments Work
**Criterion:** Opening a PR creates a working Vercel preview.

**Verification:**
```
Open a test PR, check Vercel preview URL deploys and home page loads.
```
**Pass condition:** Preview URL loads without error.

---

## 10. Documentation

### 10.1 New Engineer Setup
**Criterion:** A developer with no prior Prodily knowledge can run the app locally in under 30 minutes using only the README.

**Verification:**
```
Ask someone unfamiliar with the project to set it up using only README.
```
**Pass condition:** Successful local setup in under 30 minutes.

---

## Production Readiness Checklist

Copy this checklist and mark items when each criterion is verifiably satisfied:

```
AUTHENTICATION
[ ] 1.1 Signup: E2E test passes, exactly one welcome email
[ ] 1.2 Email verification: session created on link click
[ ] 1.3 Login: E2E test passes
[ ] 1.4 Token refresh: expired token auto-refreshed via proxy.ts
[ ] 1.5 Session persistence: works across browser restart
[ ] 1.6 Logout: E2E test passes, protected routes redirect
[ ] 1.7 Password reset: E2E test passes, new password works

AUTHORIZATION
[ ] 2.1 Unauthenticated users cannot access /app routes
[ ] 2.2 Non-admin users cannot access /admin
[ ] 2.3 Admin users can access /admin

DATABASE
[ ] 3.1 RLS user isolation: integration test passes
[ ] 3.2 RLS system tables: blocked for non-service-role
[ ] 3.3 Type safety: zero `as any` on table access, typecheck passes
[ ] 3.4 Migration safety: staging-first CI pipeline configured

EMAIL
[ ] 4.1 Exactly one welcome email per signup
[ ] 4.2 Verification email < 60 second delivery
[ ] 4.3 Password reset email < 60 second delivery
[ ] 4.4 Hook rejects invalid HMAC signatures

API SECURITY
[ ] 5.1 Cron endpoints: 401 without CRON_SECRET
[ ] 5.2 Admin endpoints: 401/403 for non-admin users
[ ] 5.3 Password update: CSRF protection verified

REQUEST INTERCEPTION & PROXY
[ ] 6.1 proxy.ts implemented using @supabase/ssr createServerClient
[ ] 6.2 /api/auth/session and AuthStateListener deleted

ERROR HANDLING
[ ] 7.1 Failures logged to system_errors
[ ] 7.2 Critical errors trigger admin notifications

CI/CD
[ ] 8.1 CI runs Vitest, not tsx scripts
[ ] 8.2 Tests do not touch production Supabase
[ ] 8.3 Clean checkout builds successfully

DEPLOYMENT
[ ] 9.1 Vercel Root Directory = apps/web
[ ] 9.2 Exactly one vercel.json (at apps/web)
[ ] 9.3 Preview deployments work on PRs

DOCUMENTATION
[ ] 10.1 New engineer can set up locally in 30 minutes
```

**Prodily is production-ready when ALL 28 checkboxes are checked.**
