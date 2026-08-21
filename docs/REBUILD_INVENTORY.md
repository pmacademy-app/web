# Prodily — Rebuild Inventory

> **Status:** VERIFIED — Based on VERIFIED_AUDIT.md
> **Updated:** 2026-08-21

---

## How to Read This Document

Actions:
- `KEEP` — No change needed
- `REFACTOR` — Improve without full rewrite (extract, simplify, fix specific issues)
- `REWRITE` — Replace implementation while preserving interface
- `DELETE` — Remove entirely
- `REPLACE` — Delete and substitute with different mechanism
- `CREATE` — New file that does not exist

Risk:
- `LOW` — Low risk of breaking other things
- `MEDIUM` — Requires care, has dependents
- `HIGH` — Core system, many dependents, must be careful

---

## PHASE 0 — Deployment Fix

| Area | Current | Action | Files | Risk | Dependencies |
|------|---------|--------|-------|------|--------------|
| Vercel config | Two identical vercel.json files | DELETE | root `vercel.json` | LOW | Vercel Dashboard Root Directory must be set to apps/web first |
| Vercel config | apps/web/vercel.json | KEEP | apps/web/vercel.json | LOW | — |

**Prerequisite:** Confirm Vercel Dashboard `Root Directory = apps/web` BEFORE deleting root vercel.json.

---

## PHASE 1 — Database Types

| Area | Current | Action | Files | Risk | Dependencies |
|------|---------|--------|-------|------|--------------|
| Database type definition | Manually maintained, 18/38 tables typed | REPLACE | `lib/supabase.ts` (inline type) → `supabase/types.ts` (generated) | HIGH | Must run `supabase gen types` against live project |
| Database type export | Inline in lib/supabase.ts | REFACTOR | `lib/supabase.ts` | MEDIUM | Depends on supabase/types.ts generation |
| Type casts | `as any` throughout admin/monitoring code | REFACTOR | `lib/monitoring/logger.ts`, admin service files | MEDIUM | Depends on DB type generation |

**Command:**
```bash
supabase gen types typescript --project-id <SUPABASE_PROJECT_ID> > supabase/types.ts
```

---

## PHASE 2 — Authentication Rebuild

| Area | Current | Action | Files | Risk | Dependencies |
|------|---------|--------|-------|------|--------------|
| Middleware | proxy.ts (dead code — wrong name, wrong export) | REWRITE | `apps/web/proxy.ts` → `apps/web/middleware.ts` | HIGH | Must install @supabase/ssr first |
| Session bridge endpoint | Custom POST handler | DELETE | `apps/web/app/api/auth/session/route.ts` | HIGH | Login page must not call it |
| AuthStateListener | Client component, fires on every auth event | DELETE | `apps/web/components/layout/AuthStateListener.tsx` | MEDIUM | Root layout import must be removed |
| Root layout | Renders AuthStateListener | REFACTOR | `apps/web/app/layout.tsx` | LOW | Remove <AuthStateListener /> import and usage |
| Browser Supabase client | Custom createBrowserSupabaseClient() | REPLACE | `apps/web/lib/supabase/client.ts` (new) | MEDIUM | @supabase/ssr required; update all import sites |
| Server Supabase client | Custom createAuthenticatedServerClient(token) | REPLACE | `apps/web/lib/supabase/server.ts` (new) | HIGH | @supabase/ssr required; update all import sites |
| Service role client | createServiceRoleClient() — correct, keep | KEEP | `apps/web/lib/supabase.ts` | — | — |
| Auth layout guard (app) | Reads sb-access-token cookie manually | REWRITE | `apps/web/app/(app)/layout.tsx` | MEDIUM | Depends on middleware + createServerClient |
| Auth layout guard (admin) | Reads sb-access-token cookie manually | REWRITE | `apps/web/app/admin/(console)/layout.tsx` | MEDIUM | Same |
| Login page | Manually POSTs to /api/auth/session | REFACTOR | `apps/web/app/(auth)/login/page.tsx` | MEDIUM | Remove session sync POST block |
| Signup page | Uses createBrowserSupabaseClient | REFACTOR | `apps/web/app/(auth)/signup/page.tsx` | LOW | Update to createBrowserClient |
| Reset password page | Uses createBrowserSupabaseClient | REFACTOR | `apps/web/app/(auth)/reset-password/page.tsx` | LOW | Update to createBrowserClient |
| Auth callback | Uses service role for verifyOtp | REFACTOR | `apps/web/app/api/auth/callback/route.ts` | LOW | Use anon client for OTP verification only |
| Auth utilities | getServerUser(), getAuthenticatedUserFromRequest() | REFACTOR | `apps/web/lib/auth.ts` | MEDIUM | Simplify after @supabase/ssr adoption |
| ensureUserProfile as any | Unnecessary cast on users insert | REFACTOR | `apps/web/lib/auth.ts` line 36 | LOW | Trivial fix once types are updated |
| @supabase/ssr package | Not installed | CREATE | apps/web/package.json | LOW | npm install @supabase/ssr |

---

## PHASE 3 — Email Fixes

| Area | Current | Action | Files | Risk | Dependencies |
|------|---------|--------|-------|------|--------------|
| Welcome email duplicate | Dispatched in both auth.ts and send-email-hook | DELETE (one path) | `apps/web/app/api/auth/send-email-hook/route.ts` lines 320-341 | LOW | Verify auth.ts path works correctly |
| SEND_EMAIL_HOOK_SECRET | Optional — skips verification if missing | REFACTOR | `apps/web/app/api/auth/send-email-hook/route.ts` | LOW | Requires env var to be set before deploy |
| Waitlist email template | Raw HTML in lib/email.ts | REFACTOR | `apps/web/lib/email.ts` sendWaitlistConfirmationEmail() | LOW | Create email template if one doesn't exist |
| Brevo fallback | Silent, untested | KEEP or REMOVE | `apps/web/lib/email.ts` | LOW | Decision: document it properly or remove |

---

## PHASE 4 — Testing Rebuild

| Area | Current | Action | Files | Risk | Dependencies |
|------|---------|--------|-------|------|--------------|
| Test framework | 36 custom tsx scripts | REPLACE | `apps/web/vitest.config.ts` (new) | MEDIUM | Install vitest |
| Pure logic tests (~16 files) | Custom assert scripts | REWRITE | `lib/__tests__/*.test.ts` (all logic tests) | LOW | Migrate to Vitest format |
| False-passing RLS test | rls-service-role.test.ts | DELETE | `apps/web/lib/__tests__/rls-service-role.test.ts` | LOW | Replace with real RLS tests |
| Real RLS tests | Non-existent | CREATE | `apps/web/lib/__tests__/rls.test.ts` | MEDIUM | Requires Supabase test project |
| E2E auth tests | Non-existent | CREATE | `apps/web/e2e/auth/*.spec.ts` | MEDIUM | Install Playwright |
| npm test script | 500-char && chain | REPLACE | `apps/web/package.json` test scripts | LOW | Update after Vitest migration |
| Admin aggregation tests | May hit production Supabase | REFACTOR | `lib/__tests__/admin-*.test.ts` | MEDIUM | Needs test Supabase project |

---

## PHASE 5 — CI/CD Cleanup

| Area | Current | Action | Files | Risk | Dependencies |
|------|---------|--------|-------|------|--------------|
| CI test step | Runs mock-URL tsx scripts | REPLACE | `.github/workflows/ci.yml` | MEDIUM | Vitest must be set up first |
| Staging deployment | None | CREATE | `.github/workflows/ci.yml` (new deploy-staging job) | HIGH | Requires Supabase staging project |
| Production migration gate | Direct to production | REFACTOR | `.github/workflows/ci.yml` | MEDIUM | Staging must succeed first |
| Smoke tests | None | CREATE | `.github/workflows/ci.yml` (new smoke-tests job) | LOW | Simple HTTP check post-deploy |
| DB type regeneration in CI | Not in CI | CREATE | `.github/workflows/ci.yml` | LOW | After supabase gen types setup |

---

## PHASE 6 — Security Hardening

| Area | Current | Action | Files | Risk | Dependencies |
|------|---------|--------|-------|------|--------------|
| SEND_EMAIL_HOOK_SECRET required | Optional, warns if missing | REFACTOR | `apps/web/app/api/auth/send-email-hook/route.ts` | LOW | Env var must be set first |
| Node version constraint | Not declared | CREATE | `apps/web/package.json` engines field | LOW | — |
| recharts in root package.json | Duplicate, unused at root | DELETE | root `package.json` recharts entry | LOW | — |

---

## KEEP — No Change Needed

| Area | Files | Reason |
|------|-------|--------|
| Service role client | `lib/supabase.ts` createServiceRoleClient() | Correct and well-implemented |
| Admin authorization | `lib/admin/authorization.ts` isAdminUser() | Dual-gate is correct pattern |
| Email hook | `app/api/auth/send-email-hook/route.ts` (structure) | Correct pattern; only fix welcome duplicate |
| Email template system | `emails/` directory | Well-designed, no changes needed |
| Notification system | `lib/notifications/` | Production-grade; fix types via DB type gen |
| Content pipeline | `scripts/` + content compiler | Works correctly |
| Brand system | `lib/brand.ts` + `theme/` | Correct |
| Error handling | `lib/monitoring/logger.ts` | Fix types; keep pattern |
| XP/Streak/SRS logic | `lib/xp/`, `lib/streaks/`, `lib/srs/` | Correct business logic |
| Badge system | `lib/badges/` | Correct |
| Certificate system | `lib/certificates/` | Correct |
| Admin panel | `app/admin/` (components) | Correct |
| Stub barrel files | `lib/badges.ts`, `lib/xp.ts`, etc. | Serve a purpose — legitimate pattern |
| Password reset flow | `app/(auth)/reset-password/page.tsx` | Correct; no changes needed |
| Update password API | `app/api/auth/update-password/route.ts` | Correct CSRF protection |
| Rate limiting | `lib/rate-limit.ts` | Correct |
| Leaderboard/cohort logic | `lib/leaderboard/`, `lib/cohorts/` | Correct |

---

## New Files to CREATE

| File | Purpose | Phase |
|------|---------|-------|
| `apps/web/middleware.ts` | Edge-level route protection + token refresh | Phase 2 |
| `apps/web/lib/supabase/server.ts` | @supabase/ssr createServerClient factory | Phase 2 |
| `apps/web/lib/supabase/client.ts` | @supabase/ssr createBrowserClient factory | Phase 2 |
| `supabase/types.ts` | Auto-generated Database types | Phase 1 |
| `apps/web/vitest.config.ts` | Vitest configuration | Phase 4 |
| `apps/web/playwright.config.ts` | Playwright configuration | Phase 4 |
| `apps/web/e2e/auth/signup.spec.ts` | E2E: signup → verify → login | Phase 4 |
| `apps/web/e2e/auth/login.spec.ts` | E2E: login, session, logout | Phase 4 |
| `apps/web/e2e/auth/protected-route.spec.ts` | E2E: unauthenticated access redirects | Phase 4 |
| `apps/web/e2e/auth/password-reset.spec.ts` | E2E: password reset flow | Phase 4 |
| `apps/web/lib/__tests__/rls.test.ts` | Real RLS integration tests | Phase 4 |
| `docs/RLS_POLICIES.md` | Full RLS policy documentation per table | Phase 6 |

---

## Files to DELETE

| File | Reason |
|------|--------|
| `apps/web/app/api/auth/session/route.ts` | Replaced by @supabase/ssr middleware |
| `apps/web/components/layout/AuthStateListener.tsx` | Replaced by @supabase/ssr |
| `apps/web/proxy.ts` | Contents move to middleware.ts (rename, not copy) |
| `vercel.json` (root) | Duplicate; Vercel Dashboard sets root to apps/web |
| `apps/web/lib/__tests__/rls-service-role.test.ts` | Always passes; tests nothing real |
