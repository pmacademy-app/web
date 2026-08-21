# Prodily — Authentication Architecture

> **Status:** CURRENT STATE + TARGET STATE
> **Updated:** 2026-08-21 (Architecture Audit)

---

## CURRENT STATE (as-built — problems documented)

### Components

| Component | File | Role |
|-----------|------|------|
| Browser Supabase Client | lib/supabase.ts createBrowserSupabaseClient() | Signs in, signs out in browser |
| Session Sync Bridge | app/api/auth/session/route.ts | Receives session from browser, sets HTTP-only cookies |
| Auth State Listener | components/layout/AuthStateListener.tsx | Monitors auth state changes, calls session sync |
| Server Auth Utility | lib/auth.ts getServerUser() | Reads sb-access-token cookie for server use |
| Server Request Auth | lib/auth.ts getAuthenticatedUserFromRequest() | Reads token from header or cookie for API routes |
| Authenticated Server Client | lib/supabase.ts createAuthenticatedServerClient(token) | Passes token via Authorization header |
| Service Role Client | lib/supabase.ts createServiceRoleClient() | Bypasses RLS — admin operations |
| Auth Callback | app/api/auth/callback/route.ts | PKCE code exchange + OTP verification |
| Email Hook | app/api/auth/send-email-hook/route.ts | Custom email delivery for Supabase auth events |

### Authentication Lifecycle (Current)

#### Signup
1. User submits signup form (`app/(auth)/signup/page.tsx`)
2. `supabase.auth.signUp()` called with browser client
3. If email confirmation is enabled: shows verification pending UI
4. Supabase calls `/api/auth/send-email-hook` to send verification email
5. User clicks link → hits `/api/auth/callback?token_hash=...&type=signup`
6. Callback calls `supabase.auth.verifyOtp()` with service role client
7. `ensureUserProfile()` creates the `public.users` record
8. Callback sets `sb-access-token` and `sb-refresh-token` HTTP-only cookies
9. Callback redirects to `/verified` page
10. `AuthStateListener` fires `SIGNED_IN` → calls `/api/auth/session` again (redundant)

**PROBLEM:** Welcome email dispatched in ensureUserProfile() AND again in send-email-hook (duplicate)

#### Login
1. User submits login form (`app/(auth)/login/page.tsx`)
2. `supabase.auth.signInWithPassword()` called
3. On success: explicitly calls `POST /api/auth/session` with session data
4. `/api/auth/session` sets `sb-access-token` and `sb-refresh-token` HTTP-only cookies
5. `router.push('/dashboard')` navigates to protected route
6. `app/(app)/layout.tsx` reads `sb-access-token` from cookies
7. `createAuthenticatedServerClient(token)` creates user-scoped client
8. `supabase.auth.getUser()` validates the token
9. Fetches user profile from `public.users`
10. Renders dashboard

**PROBLEM:** Step 3-4 is a manual race condition mitigation — if the POST fails, the user gets a broken state.

#### Token Expiry
- Access tokens expire after 3600 seconds (1 hour)
- The `sb-access-token` cookie has `maxAge: session.expires_in` (~3600 seconds)
- When the cookie expires, `layout.tsx` finds no cookie → redirects to login
- The `sb-refresh-token` cookie (30-day maxAge) is never used server-side
- **There is no automatic token refresh**

#### Logout
1. Client calls `supabase.auth.signOut()`
2. `AuthStateListener` fires `SIGNED_OUT`
3. `AuthStateListener` calls `POST /api/auth/session` with `{ session: null }`
4. `/api/auth/session` clears both cookies (maxAge: -1)
5. `router.refresh()` causes server re-render
6. Stale Supabase cookies (from browser's own supabase-js session) may persist briefly

### Known Problems
- AUTH-001: No middleware
- AUTH-002: Race condition on login  
- AUTH-003: No token refresh
- AUTH-004: AuthStateListener fires on every navigation
- AUTH-005: Service role client used for non-privileged callback operations
- AUTH-006: Duplicate auth utilities

---

## TARGET STATE (@supabase/ssr)

### Why @supabase/ssr
The `@supabase/ssr` package was specifically designed to solve the problems in the current custom architecture:
1. Automatic token refresh in middleware
2. Proper cookie management for Next.js App Router
3. No manual session sync required
4. Edge-compatible

### Components (Target)

| Component | File | Role |
|-----------|------|------|
| Middleware | middleware.ts | Edge-level protection, token refresh, redirect logic |
| Server Client Factory | lib/supabase/server.ts | createServerClient() using @supabase/ssr |
| Browser Client Factory | lib/supabase/client.ts | createBrowserClient() using @supabase/ssr |
| Service Role Client | lib/supabase.ts | Unchanged — admin operations only |
| Auth Callback | app/api/auth/callback/route.ts | Simplified — uses standard client, no service role |
| Email Hook | app/api/auth/send-email-hook/route.ts | Unchanged (fix duplicate welcome email) |

### Authentication Lifecycle (Target)

#### Signup
1. User submits signup form
2. `supabase.auth.signUp()` with browser client
3. Supabase sends email via send-email-hook
4. User clicks link → hits `/api/auth/callback?token_hash=...&type=signup`
5. Callback uses standard `createServerClient()` to call `verifyOtp()`
6. `ensureUserProfile()` creates `public.users` record + dispatches welcome email (once)
7. Callback sets session cookies via @supabase/ssr (automatic)
8. Redirect to `/verified`

#### Login
1. User submits login form
2. `supabase.auth.signInWithPassword()` with browser client — @supabase/ssr sets cookies automatically
3. **No manual session POST required**
4. `router.push('/dashboard')`
5. Middleware reads session → user is authenticated → passes through
6. Layout server component calls `createServerClient()` → gets user

#### Token Expiry
1. Middleware intercepts request
2. `supabase.auth.getUser()` in middleware detects expired access token
3. @supabase/ssr automatically refreshes using refresh token
4. Updates cookies on the response
5. User never sees login redirect

#### Logout
1. Client calls `supabase.auth.signOut()` — @supabase/ssr clears cookies
2. **No manual session POST required**
3. Middleware blocks subsequent requests to protected routes
4. Redirect to login

---

## Admin Authorization (Unchanged)

Admin authorization uses a dual-gate approach (keep this):
1. `ADMIN_EMAILS` environment variable — OR
2. `users.is_admin` database flag

This correctly prevents a compromised admin email from being the only gate.

---

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL        ← Supabase project URL (public)
NEXT_PUBLIC_SUPABASE_ANON_KEY   ← Supabase anon key (public)
SUPABASE_SERVICE_ROLE_KEY       ← Service role key (server-only, NEVER public)
SEND_EMAIL_HOOK_SECRET          ← Hook signature verification (REQUIRED in production)
ADMIN_EMAILS                    ← Comma-separated admin email list
NEXT_PUBLIC_SITE_URL            ← Canonical app URL for email links
```
