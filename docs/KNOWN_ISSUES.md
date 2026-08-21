# Prodily — Known Issues Register

> **Last Updated:** 2026-08-21
> **Branch:** audit/prodily-architecture-rebuild

---

## AUTH — Authentication Issues

### AUTH-001
- **Severity:** CRITICAL
- **Area:** Authentication / Session Management
- **Problem:** No Next.js middleware exists. Route protection is implemented entirely via server-side layout components. A request to a protected page makes a full round-trip to the server before auth is evaluated.
- **Evidence:** `find . -name "middleware.ts"` returns nothing. `apps/web/app/(app)/layout.tsx` reads cookies and redirects. `apps/web/app/admin/(console)/layout.tsx` does the same.
- **Impact:** No edge-level interception. Token expiry is not caught until a server component renders. An expired token causes a flash of the protected page before redirect in some rendering scenarios.
- **Root Cause:** @supabase/ssr was never adopted. The codebase was built with a custom cookie bridge instead.
- **Recommendation:** CREATE middleware.ts using @supabase/ssr that intercepts all /app/* and /admin/* routes, refreshes tokens, and redirects unauthenticated users.
- **Status:** REWRITE

---

### AUTH-002
- **Severity:** HIGH
- **Area:** Authentication / Session Synchronization
- **Problem:** The login flow has a race condition. After signInWithPassword(), the code explicitly POSTs to /api/auth/session to set the HTTP-only cookie BEFORE navigating. If this POST fails silently or is slow, the server renders the dashboard with no valid cookie.
- **Evidence:** `apps/web/app/(auth)/login/page.tsx` lines 71–87: manual fetch to /api/auth/session with error handling. The comment literally says "eliminates the race condition".
- **Impact:** Users can see a login redirect loop if the session sync POST fails or times out.
- **Root Cause:** Custom session bridge architecture. Standard @supabase/ssr handles this natively.
- **Recommendation:** Replace with @supabase/ssr middleware pattern. Eliminate /api/auth/session entirely.
- **Status:** REWRITE

---

### AUTH-003
- **Severity:** HIGH
- **Area:** Authentication / Token Refresh
- **Problem:** There is no server-side token refresh mechanism. Access tokens expire after 1 hour. When they expire, the server-side auth check in layout.tsx will fail (getUser() returns null), redirecting the user to login unexpectedly.
- **Evidence:** `lib/auth.ts` getServerUser() reads sb-access-token from cookies. There is no logic to use the refresh token when the access token is expired. The callback route sets sb-access-token with maxAge=session.expires_in (typically 3600 seconds).
- **Impact:** Users are logged out after 1 hour of inactivity even if their browser still has a valid refresh token.
- **Root Cause:** Custom cookie architecture with no refresh mechanism. @supabase/ssr middleware handles refresh automatically.
- **Recommendation:** Implement @supabase/ssr middleware with automatic token refresh.
- **Status:** REWRITE

---

### AUTH-004
- **Severity:** HIGH  
- **Area:** Authentication / AuthStateListener
- **Problem:** AuthStateListener fires on EVERY page navigation (TOKEN_REFRESHED events), causing an unnecessary POST to /api/auth/session on every route change. This adds latency to every navigation and creates unnecessary server load.
- **Evidence:** `components/layout/AuthStateListener.tsx` — onAuthStateChange fires for TOKEN_REFRESHED events (which Supabase emits automatically). The handler always calls /api/auth/session regardless of event type.
- **Impact:** Every page navigation triggers a hidden network request. Performance degradation. Unnecessary server logs.
- **Root Cause:** AuthStateListener was a workaround for the missing middleware.
- **Recommendation:** DELETE AuthStateListener once @supabase/ssr middleware is implemented.
- **Status:** DELETE

---

### AUTH-005
- **Severity:** MEDIUM
- **Area:** Authentication / Callback Route
- **Problem:** The auth callback route (api/auth/callback/route.ts) uses createServiceRoleClient() to call supabase.auth.exchangeCodeForSession(). The service role client bypasses RLS. Exchanging an auth code does not require RLS bypass — it should use a standard client.
- **Evidence:** `apps/web/app/api/auth/callback/route.ts` line 43.
- **Impact:** Unnecessarily privileged client used for a non-privileged operation.
- **Root Cause:** Convenience — the service role client was used because it was simpler.
- **Recommendation:** Use a standard anonymous client for code exchange. Reserve service role for ensureUserProfile().
- **Status:** REFACTOR

---

### AUTH-006
- **Severity:** MEDIUM
- **Area:** Authentication / Code Duplication
- **Problem:** Two nearly identical auth utilities exist: getServerUser() in lib/auth.ts reads cookies() directly. getAuthenticatedUserFromRequest(request) in lib/auth.ts reads from headers OR cookies. The logic overlaps significantly.
- **Evidence:** `lib/auth.ts` lines 116–132 (getServerUser) and 142–185 (getAuthenticatedUserFromRequest).
- **Impact:** Maintenance burden. Inconsistent auth extraction strategy across different call sites.
- **Root Cause:** Organic growth without refactoring.
- **Recommendation:** Consolidate into a single auth utility using @supabase/ssr.
- **Status:** REWRITE

---

## DATABASE — Database Issues

### DB-001
- **Severity:** HIGH
- **Area:** Database / Type Safety
- **Problem:** The Database type in supabase.ts is manually maintained and severely out of sync with the actual Supabase schema. 15+ tables added via migrations are not in the Database type, requiring widespread `as any` casts.
- **Evidence:** `lib/monitoring/logger.ts` line 55: `(supabase.from('system_errors' as any) as any)`. Multiple admin aggregation files use similar patterns.
- **Impact:** Type safety is bypassed for a large portion of the application. TypeScript provides false confidence.
- **Root Cause:** @supabase/ssr type generation was never set up. Types were manually authored and never updated.
- **Recommendation:** Run `supabase gen types typescript --project-id <id> > supabase/types.ts`. Import from that file. Delete the inline Database type from supabase.ts.
- **Status:** REWRITE

---

### DB-002
- **Severity:** MEDIUM
- **Area:** Database / Migration Safety
- **Problem:** Migrations are deployed directly to production via supabase db push on every push to main. There is no staging environment and no rollback procedure.
- **Evidence:** `.github/workflows/ci.yml` lines 110–113.
- **Impact:** A bad migration can corrupt production data with no rollback path.
- **Root Cause:** No staging environment was established.
- **Recommendation:** Create a Supabase staging project. Deploy to staging first, verify, then promote to production.
- **Status:** CREATE (staging environment)

---

## EMAIL — Email Issues

### EMAIL-001
- **Severity:** HIGH
- **Area:** Email / Duplicate Dispatch
- **Problem:** Welcome emails are enqueued twice for every new user registration.
- **Evidence:** 
  1. `lib/auth.ts` ensureUserProfile() calls dispatchWelcomeEmailIfNeeded() which dispatches user.registered event
  2. `app/api/auth/send-email-hook/route.ts` lines 321–340 also enqueues auth.welcome on actionType === 'signup'
- **Impact:** New users receive two welcome emails.
- **Root Cause:** Two different code paths handle the same signup event without coordination.
- **Recommendation:** Remove one. The send-email-hook is the better place since it fires for every signup regardless of path. Remove welcome dispatch from ensureUserProfile().
- **Status:** REWRITE

---

### EMAIL-002
- **Severity:** MEDIUM
- **Area:** Email / Delivery Reliability
- **Problem:** Production email delivery depends on GitHub Actions cron jobs (email-cron.yml) running every 5 minutes. GitHub does not guarantee cron job execution timing on free plans, and jobs can be silently skipped under high GitHub load.
- **Evidence:** `.github/workflows/email-cron.yml` schedule: `*/5 * * * *`
- **Impact:** Queued emails can be delayed arbitrarily. Critical security emails (verification, password reset) should NOT go through a queue — they use the send-email-hook which is synchronous. But transactional notifications can be delayed.
- **Root Cause:** No dedicated cron infrastructure.
- **Recommendation:** Use Vercel Cron (available on Pro plan) or an external service (Railway cron, Inngest, etc.) for reliable job scheduling. Remove email cron from GitHub Actions.
- **Status:** REPLACE

---

### EMAIL-003
- **Severity:** LOW
- **Area:** Email / Code Quality
- **Problem:** sendWaitlistConfirmationEmail() in lib/email.ts uses raw HTML string templates instead of the ReactEmail template system used everywhere else.
- **Evidence:** `lib/email.ts` lines 114–161.
- **Impact:** Inconsistent email rendering. Waitlist emails bypass the design system.
- **Root Cause:** Originally written before the template system existed.
- **Recommendation:** Replace with renderEmailTemplate() call using a Waitlist template.
- **Status:** REWRITE

---

## DEPLOYMENT — Deployment Issues

### DEPLOY-001
- **Severity:** HIGH
- **Area:** Vercel Deployment
- **Problem:** Both root vercel.json and apps/web/vercel.json exist with identical content. The last 4 commits to main were all Vercel deployment fixes, indicating the configuration is fundamentally unstable.
- **Evidence:** `vercel.json` and `apps/web/vercel.json` have identical contents. Git log shows cb5e814, 9a8ae2a, a1ed1bd, df92877 all as Vercel/deployment fixes.
- **Impact:** Deployment is unreliable. An incorrectly configured rootDirectory means builds may run from the wrong directory.
- **Root Cause:** Monorepo structure was not properly configured for Vercel from the start.
- **Recommendation:** Configure rootDirectory in Vercel dashboard to apps/web. Delete apps/web/vercel.json. Simplify root vercel.json.
- **Status:** REWRITE

---

### DEPLOY-002
- **Severity:** MEDIUM
- **Area:** Vercel / Build Chain
- **Problem:** Root package.json build script runs `npm --prefix apps/web run build`. The apps/web build script runs `content:build && next build`. The content:build runs the compiler. This 3-layer delegation makes debugging builds unnecessarily difficult.
- **Evidence:** Root package.json line 8. apps/web package.json line 53.
- **Impact:** Build failures are difficult to diagnose because error messages surface through multiple layers.
- **Root Cause:** Monorepo structure without a proper build tool (Turborepo, Nx).
- **Recommendation:** If rootDirectory is set to apps/web in Vercel, the build command can be directly `npm run build` from apps/web without root-level delegation.
- **Status:** REFACTOR

---

## TESTING — Testing Issues

### TEST-001
- **Severity:** HIGH
- **Area:** Testing / RLS Tests
- **Problem:** The RLS test (rls-service-role.test.ts) uses a dummy token against mock.supabase.co. It explicitly handles fetch failures by continuing — meaning if mock.supabase.co is unreachable, all assertions are skipped and the test still passes.
- **Evidence:** `lib/__tests__/rls-service-role.test.ts` lines 70–84. The test catches fetch failures and calls continue.
- **Impact:** The test always passes. It proves nothing about real RLS behavior.
- **Root Cause:** No real Supabase test instance available in CI.
- **Recommendation:** Either set up a real Supabase test project for CI or delete this test. A test that never fails regardless of RLS configuration is worse than no test.
- **Status:** DELETE and RECREATE with real test instance

---

### TEST-002
- **Severity:** HIGH
- **Area:** Testing / Framework
- **Problem:** No standard test framework. All tests are custom assert-based scripts run sequentially with tsx. No test isolation, no coverage, no parallel execution, no snapshot testing.
- **Evidence:** apps/web/package.json test script is a 500-character chain of && operators running 36 test commands sequentially.
- **Impact:** Slow test suite. Single test failure halts everything. No isolation between tests. No coverage visibility.
- **Root Cause:** Started with simple tsx scripts, never migrated to a real framework.
- **Recommendation:** Adopt Vitest. Migrate existing tests. Configure coverage thresholds.
- **Status:** REPLACE

---

### TEST-003
- **Severity:** MEDIUM
- **Area:** Testing / Auth Tests
- **Problem:** There are zero tests for the actual authentication lifecycle. No test covers: signup -> email verify -> login -> session -> protected route -> logout.
- **Evidence:** No test file references signUp, signInWithPassword, verifyOtp, or onAuthStateChange with real credentials.
- **Impact:** The most critical user path is untested.
- **Recommendation:** Create E2E tests using Playwright for the complete auth lifecycle.
- **Status:** CREATE

---

## SECURITY — Security Issues

### SEC-001
- **Severity:** MEDIUM
- **Area:** Security / Email Hook Secret
- **Problem:** SEND_EMAIL_HOOK_SECRET is optional. If it is not configured, the hook endpoint proceeds without verification and logs only a warning.
- **Evidence:** `apps/web/app/api/auth/send-email-hook/route.ts` lines 183–201. The if (secret) block skips verification entirely if the env var is missing.
- **Impact:** An attacker who discovers the hook URL can trigger email sends without Supabase authorization.
- **Root Cause:** Made optional for development convenience.
- **Recommendation:** Make SEND_EMAIL_HOOK_SECRET required in production. Fail fast if missing.
- **Status:** REWRITE

---

### SEC-002
- **Severity:** LOW
- **Area:** Security / Hardcoded URLs
- **Problem:** Login and signup pages have a hardcoded href to `https://prodily.adityagangwani.me` instead of using BRAND.siteUrl.
- **Evidence:** `apps/web/app/(auth)/login/page.tsx` line 196. `apps/web/app/(auth)/signup/page.tsx` line 118.
- **Impact:** Minor. Brand hardening CI check does not catch this because it only checks .ts/.tsx files in lib/, not auth pages.
- **Recommendation:** Replace with {BRAND.siteUrl} or a Next.js Link component to the home page.
- **Status:** REFACTOR

---

## ARCHITECTURE — Structural Issues

### ARCH-001
- **Severity:** HIGH
- **Area:** Architecture / Supabase Client
- **Problem:** No @supabase/ssr package. The standard way to use Supabase with Next.js App Router (since Supabase v2.x) is @supabase/ssr. The custom cookie bridge architecture duplicates what this library provides, but less reliably.
- **Evidence:** apps/web/package.json has no @supabase/ssr dependency. lib/supabase.ts manually creates clients and manages cookies.
- **Impact:** All auth session problems (AUTH-001 through AUTH-006) stem from this root issue.
- **Root Cause:** Original implementation predates widespread @supabase/ssr adoption or was done without following Supabase's Next.js guidance.
- **Recommendation:** Install @supabase/ssr. Create middleware.ts. Replace all custom auth utilities. This is the foundational fix for the entire auth layer.
- **Status:** REPLACE (foundational)

---

### ARCH-002
- **Severity:** MEDIUM
- **Area:** Architecture / Empty Stub Files
- **Problem:** Multiple library files are 24-37 byte re-export stubs with no logic. They exist purely as indirection layers.
- **Evidence:** lib/badges.ts (32B), lib/streaks.ts (34B), lib/xp.ts (24B), lib/lessons-db.ts (37B), lib/xp-service.ts (32B), lib/streaks-db.ts (37B)
- **Impact:** Navigation confusion. Importers of these files import through a meaningless layer.
- **Root Cause:** Files were planned for expansion but never filled in.
- **Recommendation:** Delete stub files. Update importers to import directly from the real implementation files.
- **Status:** DELETE

---

### ARCH-003
- **Severity:** MEDIUM
- **Area:** Architecture / next version
- **Problem:** package.json specifies `"next": "16.2.12"`. The official Next.js latest version as of the audit date is 15.x. Version 16 does not appear to be a published stable version on npm.
- **Evidence:** apps/web/package.json line 75.
- **Impact:** Unknown. May be using an unpublished or prerelease version that lacks security patches or official support.
- **Recommendation:** Verify next@16.2.12 exists on npm. If not, this is a local workaround that will break clean installs and CI.
- **Status:** INVESTIGATE
