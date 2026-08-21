# Prodily — Verified Engineering Audit

> **Audit Branch:** `audit/prodily-architecture-rebuild`
> **Evidence Collection Date:** 2026-08-21
> **Status:** VERIFIED & RE-CALIBRATED — Ready for rebuild planning

---

## 1. Executive Summary

This audit establishes the ground truth of the Prodily architecture after a rigorous verification pass against **Next.js 16.2.12** and the **official Supabase SSR specification**.

### Critical Discovery: Next.js 16 `proxy.ts` Convention
In Next.js 16, the request interception convention was officially updated from `middleware.ts` to **`proxy.ts`** with `export function proxy(request: NextRequest)`.
- **The filename `apps/web/proxy.ts` IS the correct convention for Next.js 16.**
- **The export `export async function proxy()` IS the correct signature.**
- The previous assumption that "Next.js only recognizes `middleware.ts`" was based on Next.js 13–15 conventions and was **incorrect for Next.js 16**.
- **However, the implementation inside `proxy.ts` is fundamentally flawed:**
  1. It uses raw `@supabase/supabase-js` `createClient` instead of `@supabase/ssr` `createServerClient`.
  2. It manually sets custom cookies (`sb-access-token`, `sb-refresh-token`) with `httpOnly: true`.
  3. Because of `httpOnly: true` on custom cookie names, browser-side JavaScript (`createBrowserSupabaseClient` via localStorage) cannot read or synchronize session state with the server, necessitating a fragile `/api/auth/session` bridge and an `AuthStateListener` client component.
  4. It executes direct database queries (`authorizedClient.from('users').select('is_admin')`) inside edge request interception, creating potential latency spikes and edge failure modes.

### Summary of Confirmed Problems
1. **`proxy.ts` Implementation Architecture**: Uses custom manual cookie bridge rather than `@supabase/ssr` pattern.
2. **Session Desynchronization**: Split-brain auth state between browser `localStorage` and custom HTTP-only cookies (`sb-access-token`).
3. **Database Type Coverage**: Database type definitions cover 18 of 38 tables — 20 tables require `as any` casts.
4. **Welcome Email Duplication**: Dispatched independently in two separate code paths per signup (`auth.ts` and `send-email-hook/route.ts`).
5. **Test Suite Isolation**: Tests run against `mock.supabase.co` with no real database behavior or E2E validation.
6. **CI/CD Migration Pipeline**: `supabase db push` pushes directly to production with no staging environment gate.

---

## 2. Classification of Findings

| ID | Category | Finding | Classification | Severity |
|----|----------|---------|----------------|----------|
| AUTH-001 | Auth | `proxy.ts` uses raw supabase-js & custom cookie bridge instead of @supabase/ssr | CONFIRMED ARCHITECTURAL PROBLEM | HIGH |
| AUTH-002 | Auth | Desynchronization between browser localStorage and HTTP-only cookies | CONFIRMED ARCHITECTURAL PROBLEM | HIGH |
| AUTH-003 | Auth | Login race condition & dependency on `/api/auth/session` sync endpoint | CONFIRMED ARCHITECTURAL PROBLEM | MEDIUM |
| AUTH-004 | Auth | `AuthStateListener` fires on all auth events, causing redundant network calls | CONFIRMED ARCHITECTURAL PROBLEM | LOW |
| AUTH-005 | Auth | Service role client used unnecessarily for `verifyOtp` in auth callback | CONFIRMED TECHNICAL DEBT | LOW |
| DB-001 | Database | Incomplete Database types (18/38 tables typed, widespread `as any`) | CONFIRMED ARCHITECTURAL PROBLEM | HIGH |
| DB-002 | Database | Direct production migration deployment without staging gate | CONFIRMED ARCHITECTURAL PROBLEM | HIGH |
| EMAIL-001 | Email | Duplicate welcome email triggered on signup from two execution paths | CONFIRMED BUG | HIGH |
| TEST-001 | Testing | `rls-service-role.test.ts` skips assertions on failure, giving false passes | CONFIRMED BUG | HIGH |
| TEST-002 | Testing | Integration tests run against `mock.supabase.co` | CONFIRMED ARCHITECTURAL PROBLEM | HIGH |
| TEST-003 | Testing | Absence of browser-level E2E tests (Playwright) | CONFIRMED ARCHITECTURAL PROBLEM | HIGH |
| DEPLOY-001 | Vercel | Duplicate root `vercel.json` and undefined monorepo `rootDirectory` | CONFIRMED ARCHITECTURAL PROBLEM | HIGH |
| SEC-001 | Security | `SEND_EMAIL_HOOK_SECRET` optional in send-email-hook route | CONFIRMED SECURITY PROBLEM | MEDIUM |

---

## 3. Deep Verification: Next.js 16 + proxy.ts Architecture

### 3.1 Next.js 16 Request Interception Specification
- **Convention**: `proxy.ts` (or `proxy.js`) located at the application root (`apps/web/proxy.ts`).
- **Export**: `export function proxy(request: NextRequest)` (supports `async`).
- **Configuration**: `export const config = { matcher: [...] }`.
- **Execution**: Intercepts requests at the server/edge boundary before reaching route handlers and server components.

### 3.2 Why the Current `proxy.ts` Is Defective
1. **Missing `@supabase/ssr`**:
   The current `proxy.ts` imports `createClient` from `@supabase/supabase-js`. It creates an isolated client with `{ auth: { persistSession: false } }`. It manually parses `request.cookies.get('sb-access-token')` and `request.cookies.get('sb-refresh-token')`.
2. **Manual Cookie Manipulation**:
   When refreshing a session, `proxy.ts` manually sets `response.cookies.set('sb-access-token', ...)` and `response.cookies.set('sb-refresh-token', ...)`. This does not conform to the standard Supabase cookie schema (`sb-<project-id>-auth-token` chunks).
3. **Hardened `httpOnly: true` Flaw**:
   The cookies are marked `httpOnly: true`. This prevents client-side Supabase SDK (`createBrowserClient`) from accessing the tokens, breaking client-side reactivity and requiring a secondary client-to-server sync endpoint (`/api/auth/session`).
4. **Database Lookups in Proxy**:
   `proxy.ts` queries the `users` table directly for `is_admin` and `curriculum_access_override`. Database queries in request-level interception add latency to every request. Role information should be stored in user app metadata or checked in layout/route handlers.

---

## 4. Deep Verification: Official @supabase/ssr Pattern

### 4.1 Browser Client (`lib/supabase/client.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### 4.2 Server Client (`lib/supabase/server.ts`)
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Invoked from Server Component where cookies are read-only.
            // proxy.ts manages the persistent response cookies.
          }
        },
      },
    }
  )
}
```

### 4.3 Proxy (`proxy.ts`)
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Validates user and refreshes token if necessary
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isAuthPage = path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/reset-password')
  const isAppPage = path.startsWith('/dashboard') || path.startsWith('/academy') || path.startsWith('/settings') || path.startsWith('/progress')
  const isAdminPage = path.startsWith('/admin') && path !== '/admin/login' && path !== '/admin/access-denied'

  // Guest redirection from protected routes
  if (!user && (isAppPage || isAdminPage)) {
    const redirectUrl = new URL(isAdminPage ? '/admin/login' : '/login', request.url)
    return NextResponse.redirect(redirectUrl)
  }

  // Authenticated redirection from auth pages
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand|content|robots.txt|sitemap.xml|api/auth/callback|api/waitlist|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

## 5. Cookie Security Verification

| Property | Value | Reason |
|----------|-------|--------|
| `name` | `sb-<project-ref>-auth-token` | Scoped to project ref to prevent cross-project collisions |
| `httpOnly` | `false` (default) | **Must remain false** so `createBrowserClient` can read tokens via `document.cookie` without network round-trips |
| `secure` | `true` (in production) | Enforces TLS transmission |
| `sameSite` | `lax` | Protects against CSRF while allowing standard top-level navigations |
| `path` | `/` | Accessible across entire domain |
| `maxAge` | Managed by Supabase (30 days for refresh, 1 hour for access) | Aligns with JWT lifecycle |

---

## 6. Email Infrastructure Findings

### Welcome Email Duplication — Confirmed
1. **Path A (`auth.ts`)**: `ensureUserProfile()` is called on callback / login, invoking `dispatchWelcomeEmailIfNeeded()` which dispatches `user.registered` event to the notification queue.
2. **Path B (`send-email-hook/route.ts`)**: When Supabase fires the auth webhook for `actionType === 'signup'`, lines 320–341 directly invoke `enqueueNotificationItem()` for `auth.welcome`.

**Remediation**:
- Retain Path A (`auth.ts` / notification dispatcher) as the single authoritative event source.
- Remove lines 320–341 from `send-email-hook/route.ts`.

---

## 7. Database Type Drift

### Type Coverage Analysis
- **Total Tables in Migrations**: 38 tables
- **Tables Typed in `lib/supabase.ts`**: 18 tables
- **Untyped Tables (20)**:
  - `notification_events`, `user_notification_preferences`, `email_queue`, `email_dead_letter`
  - `in_app_notifications`, `email_delivery_events`, `email_suppressions`, `notification_feature_flags`
  - `notification_templates`, `notification_template_versions`, `user_notification_timeline`
  - `system_settings`, `system_errors`, `rate_limits`, `user_feedback`, `contact_messages`, `admin_audit_logs`, etc.

**Remediation**:
Run `supabase gen types typescript` into `types/database.ts` and eliminate all `as any` casts.

---

## 8. Summary of Rebuild Scope

1. **Retain `apps/web/proxy.ts`** — Rewrite its implementation using `@supabase/ssr`.
2. **Install `@supabase/ssr`** and implement `lib/supabase/client.ts` and `lib/supabase/server.ts`.
3. **Delete redundant sync layer**: Remove `/api/auth/session/route.ts` and `AuthStateListener.tsx`.
4. **Generate complete Database types**: Automate with `supabase gen types typescript`.
5. **Deduplicate welcome email**: Remove duplicate enqueue in `send-email-hook/route.ts`.
6. **Migrate tests to Vitest + Playwright**: Replace misleading assert scripts with real test suites.
