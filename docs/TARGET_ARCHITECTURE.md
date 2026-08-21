# Prodily — Target Architecture

> **Status:** PROPOSED — Awaiting approval before implementation
> **Branch:** audit/prodily-architecture-rebuild
> **Based on:** Master Engineering Audit 2026-08-21

---

## Overview

The target architecture replaces the current custom session bridge with the standard `@supabase/ssr` pattern recommended by both Supabase and Next.js. The core change is adding `middleware.ts` and eliminating the `/api/auth/session` endpoint and `AuthStateListener` component.

---

## Session Architecture: Current vs. Target

### Current (Custom Bridge)

```
Browser                             Server / Edge
  |                                       |
  |-- signInWithPassword() ----------->   |
  |   (stores in localStorage + sb-* cookies)
  |                                       |
  |-- POST /api/auth/session ----------->  |
  |   { session }                         |
  |                               Sets sb-access-token
  |                               Sets sb-refresh-token
  |                                       |
  |-- router.push('/dashboard') ------->  |
  |                                       |
  |                               layout.tsx reads:
  |                               cookies().get('sb-access-token')
  |                               createAuthenticatedServerClient(token)
  |                               supabase.auth.getUser()
  |                                       |
  |                               [PROBLEM: no token refresh]
  |                               [PROBLEM: race condition window]
  |                               [PROBLEM: extra network call per auth event]
```

### Target (@supabase/ssr)

```
Browser                             Edge (middleware.ts)              Server
  |                                       |                              |
  |-- signInWithPassword() ----------->   |                              |
  |   (stores session in sb-* cookies     |                              |
  |    automatically by supabase-js)      |                              |
  |                                       |                              |
  |-- GET /dashboard ------------------>  |                              |
  |                               middleware reads sb-* cookies          |
  |                               creates @supabase/ssr server client   |
  |                               calls supabase.auth.getUser()         |
  |                               [if expired] refreshes token           |
  |                               [if no session] redirect /login        |
  |                               sets updated cookies on response       |
  |                                       |                              |
  |                               <-- passes to server component -----> |
  |                                                                      |
  |                                               reads user from        |
  |                                               createServerClient()  |
  |                                               (token already valid) |
```

---

## Component Changes

### DELETE
```
apps/web/app/api/auth/session/route.ts
apps/web/components/layout/AuthStateListener.tsx
```

### CREATE
```
apps/web/middleware.ts                    ← Edge route protection + token refresh
apps/web/lib/supabase/server.ts           ← @supabase/ssr server client factory
apps/web/lib/supabase/client.ts           ← @supabase/ssr browser client factory
supabase/types.ts                         ← Generated Database types
```

### REWRITE
```
apps/web/lib/supabase.ts                  ← Remove inline Database type; keep only
                                            createServiceRoleClient(); import types
                                            from supabase/types.ts
apps/web/lib/auth.ts                      ← Remove getServerUser(),
                                            getAuthenticatedUserFromRequest();
                                            use @supabase/ssr createServerClient()
apps/web/app/(app)/layout.tsx             ← Use createServerClient() from lib/supabase/server.ts
apps/web/app/admin/(console)/layout.tsx   ← Same
apps/web/app/layout.tsx                   ← Remove <AuthStateListener />
apps/web/app/(auth)/login/page.tsx        ← Remove /api/auth/session POST call
apps/web/app/(auth)/signup/page.tsx       ← Remove manual session handling
```

---

## Middleware Design

```typescript
// apps/web/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/app', '/dashboard', '/settings', '/badges', 
                          '/capstones', '/leaderboard', '/notifications', 
                          '/progress', '/review']
const ADMIN_PATHS = ['/admin']
const AUTH_PATHS = ['/login', '/signup', '/reset-password']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session if expired (handles token refresh automatically)
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Redirect unauthenticated users away from protected paths
  if (!user && PROTECTED_PATHS.some(p => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect unauthenticated users away from admin paths
  if (!user && ADMIN_PATHS.some(p => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  // Redirect authenticated users away from auth pages
  if (user && AUTH_PATHS.some(p => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
```

---

## Database Type Generation

Replace the manually maintained `Database` type in `lib/supabase.ts` with auto-generated types:

```bash
supabase gen types typescript --project-id <YOUR_PROJECT_ID> > supabase/types.ts
```

Import in `lib/supabase.ts`:
```typescript
export type { Database } from '../../supabase/types'
```

This must be re-run whenever migrations are added.

---

## Email Architecture (Target)

### Remove from send-email-hook
- Remove the welcome email enqueue on `signup` action type (lines 321–340 in current route.ts)
- The send-email-hook should ONLY send the verification/reset email Supabase requested

### Fix in auth.ts
- Keep the welcome email dispatch in `ensureUserProfile()` as the single source of truth
- Ensure idempotency via the `welcome-${user.id}` event ID (already in place)

### Cron Infrastructure
- Replace GitHub Actions cron (`email-cron.yml`) with Vercel Cron on the Pro plan
  OR use a dedicated service (Inngest, Quirrel, Railway cron)
- GitHub Actions cron is unreliable and should not be the mechanism for production email delivery

---

## Vercel Deployment (Target)

```
Vercel Dashboard:
  Root Directory: apps/web
  Build Command: npm run build          ← runs content:build && next build
  Install Command: npm install
  Output Directory: .next
  Node.js Version: 22.x

vercel.json (apps/web/vercel.json only — DELETE root vercel.json):
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

---

## CI Architecture (Target)

```yaml
# .github/workflows/ci.yml (target)
name: CI

on:
  push:
    branches: [main, 'audit/**', 'feat/**', 'fix/**']
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: apps/web/package-lock.json
      - run: npm ci
      - run: npm run content:validate        # validate only, don't compile
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit               # pure logic tests only, no Supabase
      - name: Brand hardening check
        run: [existing brand check]
      - run: npm run build                   # verify build succeeds

  test-integration:
    # Only runs when Supabase test secrets are available (not on forks)
    if: vars.SUPABASE_TEST_PROJECT_ID != ''
    runs-on: ubuntu-latest
    steps:
      - [setup]
      - run: npm run test:integration        # tests against real Supabase test instance

  deploy-supabase:
    needs: validate
    if: github.ref == 'refs/heads/main'
    steps:
      - [link to staging]
      - [push to staging]
      - [manual approval gate]
      - [push to production]
```

---

## Testing Architecture (Target)

```
                     E2E (Playwright)
                  /-------------------\
                 / signup -> verify    \
                / login -> protected   \
               / logout -> redirect    \
              /---------------------------\
             
        Integration (Vitest + real Supabase test project)
       /-----------------------------------------------\
      / RLS policies per table                         \
     / API routes with real DB operations              \
    / Email delivery (sandbox mode)                   \
   /----------------------------------------------------\

              Unit (Vitest, no network)
           /----------------------------\
          / XP calculation             \
         / Streak logic                \
        / SRS algorithm               \
       / Badge evaluation             \
      / Rate limiting logic           \
     / Schema validation              \
    / Email template rendering       \
   /-----------------------------------\
```

---

## Implementation Phases

### PHASE 0 — Foundation (Before any feature work)
**Objective:** Fix the deployment so the codebase builds reliably.
- Verify next@16.2.12 exists on npm. If not, determine the correct version.
- Fix Vercel rootDirectory configuration
- Delete root vercel.json OR apps/web/vercel.json (keep one)
- Add `engines: { node: ">=22" }` to apps/web/package.json
- Delete stub files (badges.ts, streaks.ts, xp.ts, etc.)
- **Verification:** Clean deployment from a new branch succeeds without manual fixes

### PHASE 1 — Database Types
**Objective:** Restore type safety.
- Run supabase gen types to generate correct Database type
- Export from supabase/types.ts
- Update lib/supabase.ts to import from supabase/types.ts
- Remove all `as any` casts for table access
- Add supabase gen types to CI
- **Verification:** tsc --noEmit passes with no type errors on DB access

### PHASE 2 — Authentication Rebuild
**Objective:** Replace custom session bridge with @supabase/ssr.
- Install @supabase/ssr
- Create lib/supabase/server.ts (createServerClient factory)
- Create lib/supabase/client.ts (createBrowserClient factory)
- Create middleware.ts (route protection + token refresh)
- Rewrite lib/auth.ts (remove duplicate utilities, use @supabase/ssr)
- Rewrite app/(app)/layout.tsx (use createServerClient)
- Rewrite app/admin/(console)/layout.tsx (use createServerClient)
- Rewrite app/(auth)/login/page.tsx (remove session POST)
- Rewrite app/(auth)/signup/page.tsx (remove manual session handling)
- Rewrite app/(auth)/reset-password/page.tsx (align with SSR pattern)
- Delete app/api/auth/session/route.ts
- Delete components/layout/AuthStateListener.tsx
- Remove <AuthStateListener /> from app/layout.tsx
- **Verification:** Full auth lifecycle works: signup -> verify -> login -> protected route -> token refresh (1hr) -> logout -> redirect

### PHASE 3 — Email Fixes
**Objective:** Fix duplicate welcome emails and standardize email system.
- Remove welcome email enqueue from send-email-hook/route.ts (keep it only in auth.ts)
- Rewrite sendWaitlistConfirmationEmail() to use template system
- Decide on Brevo fallback: document it properly or remove it
- Make SEND_EMAIL_HOOK_SECRET required in production
- **Verification:** New user receives exactly one welcome email

### PHASE 4 — Testing Rebuild
**Objective:** Replace hand-rolled test scripts with a real framework.
- Install Vitest
- Migrate pure logic tests (xp, streaks, srs, badges, certificates, etc.) to Vitest
- Delete misleading RLS test (rls-service-role.test.ts)
- Set up Supabase test project for integration tests
- Write real RLS tests against test project
- Install Playwright
- Write E2E tests for auth lifecycle
- Add coverage thresholds
- **Verification:** `vitest run` passes. `playwright test` passes.

### PHASE 5 — CI/CD Cleanup
**Objective:** Reliable CI that actually validates what matters.
- Update ci.yml to use new test commands (vitest not tsx scripts)
- Remove email-cron.yml from GitHub Actions (replace with Vercel Cron or dedicated service)
- Add staging Supabase deployment gate before production
- Add post-deployment smoke tests
- **Verification:** CI green on a clean branch. Failed migration does not reach production.

### PHASE 6 — Security Hardening
**Objective:** Close remaining security gaps.
- Make SEND_EMAIL_HOOK_SECRET required
- Replace hardcoded production URLs with BRAND.siteUrl in auth pages
- Verify rate limiting on all public mutation endpoints
- Document all RLS policies
- **Verification:** Security audit checklist passes

### PHASE 7 — Documentation Reset
**Objective:** Documentation reflects reality, not aspirations.
- Update AUTHENTICATION.md to describe @supabase/ssr architecture
- Update TESTING.md to describe Vitest + Playwright
- Update CI_CD.md to describe new CI
- Update DEPLOYMENT.md to describe Vercel rootDirectory config
- Archive outdated docs
- **Verification:** A new engineer can set up the project in under 30 minutes using the docs
