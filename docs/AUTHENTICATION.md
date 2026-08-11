# Authentication Infrastructure & User State Sync — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `875f6ba`  
**Last Updated:** August 11, 2026  

---

## 1. Overview & Supabase Auth Architecture

Authentication is powered by Supabase Auth with PKCE flow and custom email rendering via the Send Email Hook.

- **Client Session Management**: `createClientSupabaseClient()` (`lib/supabase.ts`) handles browser session persistence and token refresh.
- **Server Session Validation**: `createServerSupabaseClient()` extracts JWT tokens from cookies or `Authorization: Bearer` headers.
- **Service-Role Operations**: `createAdminSupabaseClient()` bypasses RLS for administrative user lookups and account verification checks.

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
- **Typo Recovery Option**: Includes an *"Entered the wrong email? Sign up again with a different address →"* trigger allowing learners to reset form state and re-submit with the corrected address immediately if a typo occurred during registration.

### C. Asynchronous Email Bounce & Mailbox Validation Limits
- **Synchronous Mailbox Validation Limitation**: Resend accepts confirmation emails for delivery synchronously (returning HTTP 200 with message ID) and performs SMTP delivery out-of-band. Therefore, synchronous verification of whether an email address inbox actually exists at the exact moment of clicking "Create Account" is technically impossible in modern email infrastructure.
- **Asynchronous Bounce Handling**: If a confirmation email bounces due to a non-existent or invalid address, Resend posts an `email.bounced` webhook event to `/api/email/webhooks`, which persists the bounce event to `public.email_delivery_events`.
- **Verification Invariant**: The UI never claims "Account created" or "Account ready" while email confirmation remains unverified.

---

## 3. Persistent 60-Second Cooldown Rate Limiting

To prevent mail bombing and API abuse, user-facing verification resend requests (`/api/auth/resend-verification`) enforce a persistent 60-second cooldown rate limit.

- **Database Table**: `public.rate_limits`
- **Rate Limit Key**: `verify_resend:${email}`
- **Behavior**: Stores window start timestamp and hit counter. Rejects duplicate requests within 60 seconds with `429 Too Many Requests`.
- **Serverless Resilience**: In the event of temporary database latency or offline mock testing, `evaluatePersistentRateLimit()` falls back to a memory-backed LRU map while maintaining explicit rate limit constraints.

---

## 4. `auth.users` vs. `public.users` Account Synchronization

When a learner creates an account:
1. An entry is created immediately in Supabase `auth.users`.
2. The user profile row in `public.users` is created lazily via `ensureUserProfile()` when the learner verifies their email or logs in.
3. **Unverified Accounts**: Unverified users exist in `auth.users` but may not yet have a profile row in `public.users`.
4. **Admin Console Sync**: `AdminConsoleService.getUsersOverview()` lists all accounts from `auth.users` via service-role API and left-joins `public.users`, ensuring unverified users are fully visible in the Admin Console.

---

## 5. Status Summary

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

