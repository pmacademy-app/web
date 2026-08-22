# Authentication Infrastructure & User State Sync — Prodily PM Academy

**Repository:** `pmacademy-app/web`
**Last Updated:** August 23, 2026

---

## 1. Overview & Current Auth Architecture

Authentication is powered by Supabase Auth with PKCE flow and custom email rendering via the Send Email Hook.

The current implementation uses `@supabase/supabase-js` (browser SDK) with a **custom session bridge** for server-side token synchronization:

- **Client Session Management**: `createBrowserSupabaseClient()` (`lib/supabase.ts`) handles browser session persistence and token refresh.
- **Server Session Bridge**: After sign-in, the browser POSTs the session to `/api/auth/session`, which sets HTTP-only `sb-access-token` and `sb-refresh-token` cookies.
- **Server Session Validation**: `createServerSupabaseClient()` reads the `sb-access-token` cookie and creates a server-scoped client.
- **Service-Role Operations**: `createAdminSupabaseClient()` bypasses RLS for administrative user lookups and account verification checks.
- **Request Interception**: `proxy.ts` (Next.js 16 convention) intercepts all requests, validates the `sb-access-token` cookie, and enforces route protection.

> **Known Issue**: This custom bridge has a 1-hour session expiry limitation (no automatic server-side token refresh) and a race condition window on login. Migrating to `@supabase/ssr` is a planned architectural improvement. See `ARCHITECTURE.md` § Known Architectural Debt.

---

## 2. User Signup & Verification Lifecycle

### A. Signup Submission & Verification Pending UX
- **Signup Endpoint / Form**: `app/(auth)/signup/page.tsx` submits user credentials to Supabase Auth `signUp()`.
- **Existing Account Interception**: If an account already exists for the email address (`data.user.identities.length === 0` or explicit auth error), the form displays:
  > *"An account already exists with this email address. Please log in instead."*
  > **[Go to Login →]** button leading directly to `/login`.
- **Verification Required View**: Upon successful signup submission when email confirmation is enabled (`data.session === null`), the UI replaces the registration form with a dedicated **Check Your Email to Verify Your Account** screen.
- **Progress Pipeline**: Explicitly communicates the three-stage lifecycle:
  1. `Signup request received` ✅
  2. `Email verification pending (confirmation link sent)` ⏳
  3. `Account ready after email confirmation` 🔒

### B. Resend Verification & Wrong-Email Recovery Flow
- **Resend Integration**: Reuses `ResendVerificationCard` (`components/auth/ResendVerificationCard.tsx`), which calls `/api/auth/resend-verification` and enforces a persistent 60-second rate-limit cooldown.
- **Typo Recovery Option**: Includes an *"Entered the wrong email? Sign up again with a different address →"* trigger allowing learners to reset form state and re-submit with the corrected address.

### C. Asynchronous Email Bounce & Mailbox Validation Limits
- **Synchronous Mailbox Validation Limitation**: Resend accepts confirmation emails for delivery synchronously (returning HTTP 200 with message ID) and performs SMTP delivery out-of-band. Synchronous inbox-existence verification is technically impossible.
- **Asynchronous Bounce Handling**: If a confirmation email bounces, Resend posts an `email.bounced` webhook event to `/api/email/webhooks`, which persists the bounce event to `public.email_delivery_events`.
- **Verification Invariant**: The UI never claims "Account created" or "Account ready" while email confirmation remains unverified.

---

## 3. Persistent 60-Second Cooldown Rate Limiting

User-facing verification resend requests (`/api/auth/resend-verification`) enforce a persistent 60-second cooldown rate limit.

- **Database Table**: `public.rate_limits`
- **Rate Limit Key**: `verify_resend:${email}`
- **Behavior**: Stores window start timestamp and hit counter. Rejects duplicate requests within 60 seconds with `429 Too Many Requests`.
- **Serverless Resilience**: In the event of temporary database latency, `evaluatePersistentRateLimit()` falls back to a memory-backed LRU map while maintaining explicit rate limit constraints.

---

## 4. `auth.users` vs. `public.users` Account Synchronization

When a learner creates an account:
1. An entry is created immediately in Supabase `auth.users`.
2. The user profile row in `public.users` is created lazily via `ensureUserProfile()` when the learner verifies their email or logs in.
3. **Unverified Accounts**: Unverified users exist in `auth.users` but may not yet have a profile row in `public.users`.
4. **Admin Console Sync**: `AdminConsoleService.getUsersOverview()` lists all accounts from `auth.users` via service-role API and left-joins `public.users`, ensuring unverified users are fully visible in the Admin Console.

---

## 5. Admin Authorization

Admin authorization uses a dual-gate approach:
1. `ADMIN_EMAILS` environment variable — OR
2. `users.is_admin` database flag

This correctly prevents a compromised admin email from being the only gate. Implemented in `lib/admin/authorization.ts`.

---

## 6. Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL        ← Supabase project URL (public)
NEXT_PUBLIC_SUPABASE_ANON_KEY   ← Supabase anon key (public)
SUPABASE_SERVICE_ROLE_KEY       ← Service role key (server-only, NEVER public)
SEND_EMAIL_HOOK_SECRET          ← Hook signature verification (REQUIRED in production)
ADMIN_EMAILS                    ← Comma-separated admin email list
NEXT_PUBLIC_SITE_URL            ← Canonical app URL for email links
```

---

## 7. Status Summary

| Authentication Flow | Location | Status |
|---|---|---|
| **User Signup & Form Validation** | `app/(auth)/signup/page.tsx` | 🟢 Verified in Production |
| **Verification Pending UX & Steps** | `app/(auth)/signup/page.tsx` | 🟢 Verified in Production |
| **Duplicate Account Interception** | `app/(auth)/signup/page.tsx` | 🟢 Verified in Production |
| **Wrong-Email Recovery & Resend** | `components/auth/ResendVerificationCard.tsx` | 🟢 Verified in Production |
| **Login & Session Management** | `app/(auth)/login/page.tsx` | 🟢 Verified in Production |
| **Password Recovery Flow** | `app/(auth)/reset-password/page.tsx` | 🟢 Verified in Production |
| **Persistent 60s Rate Limiter** | `lib/rate-limit.ts`, `public.rate_limits` | 🟢 Verified in Production |
| **Unverified User Discovery** | `lib/admin/service.ts` | 🟢 Verified in Production |
| **Supabase Auth Hook Integration** | `app/api/auth/send-email-hook/route.ts` | 🟢 Verified in Production |
| **Server-Side Token Refresh** | Not implemented (`@supabase/ssr` pending) | ⚠️ Known Gap |
