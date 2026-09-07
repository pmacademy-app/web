# Authentication Infrastructure & User State Sync — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 (Turbopack) / Supabase Auth / PostgreSQL  
**Last Updated:** September 6, 2026  

---

## 1. Overview & Current Auth Architecture

Authentication is powered by Supabase Auth with PKCE flow, custom email rendering via the Send Email Hook, and edge-level request interception.

The system uses `@supabase/supabase-js` with a custom session bridge:
- **Client Session Management:** `createBrowserSupabaseClient()` (`lib/supabase.ts`) handles browser session persistence and local tokens.
- **Server Session Bridge:** On sign-in, the client sends session tokens to `/api/auth/session`, setting HTTP-only `sb-access-token` and `sb-refresh-token` cookies.
- **Server Session Validation:** `createServerSupabaseClient()` reads cookies to authenticate server-side requests.
- **Service-Role Operations:** `createServiceRoleClient()` is strictly server-side, bypassing RLS for admin user discovery and system-level operations.
- **Request Interception (`apps/web/proxy.ts`):** Edge-level proxy inspects cookies, validates JWT tokens, and enforces platform controls.

---

## 2. User Signup & Verification Lifecycle

### A. Signup Submission & Existing Account Interception
- **Registration Form:** `app/(auth)/signup/page.tsx` submits credentials to Supabase Auth `signUp()`.
- **Existing Account Detection:** If an account already exists for an email, the UI shows:
  > *"An account already exists with this email address. Please log in instead."*
  > **[Go to Login →]** button leading to `/login`.
- **Verification Pending Screen:** When email confirmation is required, the UI displays a dedicated **Check Your Email to Verify Your Account** screen detailing:
  1. `Signup request received` ✅
  2. `Email verification pending (confirmation link sent)` ⏳
  3. `Account ready after email confirmation` 🔒

### B. Resend Verification & Wrong-Email Recovery
- **Resend Component:** `components/auth/ResendVerificationCard.tsx` invokes `/api/auth/resend-verification` with a persistent 60-second rate-limit cooldown.
- **Wrong-Email Recovery:** Provides a *"Entered the wrong email? Sign up again with a different address →"* link to reset form state and correct typos.

### C. Referral Attribution during Signup
- When a user arrives via a referral link (`?ref=CODE`), `proxy.ts` (`withReferralCookie()`) stores a 30-day HTTP-only `prodily_referrer` cookie.
- The signup form reads `?ref=` from the current URL and submits it directly in the signup request body; the server (`app/api/auth/signup/route.ts`) uses that value if present, **falling back to the `prodily_referrer` cookie** only when the body doesn't include one (`refCode = parsed.data.refCode || request.cookies.get('prodily_referrer')?.value || null`).
- `createReferralAttribution()` links the new account to the referrer in `public.referrals` (preventing self-referrals and capping at 10 signups/24h). See [`docs/admin/referrals.md`](admin/referrals.md).

---

## 3. Platform Settings & Access Controls

Authentication and route access strictly respect global settings configured in `/admin/settings`:

| Platform Control | When Enabled | When Disabled | Non-Admin Learner Impact | Admin Impact |
|---|---|---|---|---|
| **`allowSignups`** | Signups allowed | Signups blocked | Signup API returns `403 Forbidden: "SIGNUPS_DISABLED"` | Unaffected |
| **`requireEmailVerification`** | Verification required | Verification optional | Unverified learners redirected to `/login?error=email_not_confirmed` and APIs return `403 AUTH_EMAIL_NOT_CONFIRMED` | Exempt |
| **`maintenanceMode`** | Maintenance active | Normal operation | Learners redirected to `/maintenance` and APIs return `503 MAINTENANCE_MODE` | **Exempt** (Admins have full access) |

---

## 4. Persistent 60-Second Cooldown Rate Limiter

Verification resend requests (`/api/auth/resend-verification`) enforce a database-backed 60-second rate limit:
- **Table:** `public.rate_limits`
- **Key Pattern:** `verify_resend:${email}`
- **Behavior:** Rejects duplicate requests within 60 seconds with `429 Too Many Requests`.
- **Fallback:** In transient database outages, `evaluatePersistentRateLimit()` falls back to a memory-backed LRU map.

---

## 5. `auth.users` vs. `public.users` Synchronization

1. On signup, a record is created in Supabase `auth.users`.
2. The user profile row in `public.users` is created lazily via `ensureUserProfile()` when the learner verifies their email or logs in.
3. **Unverified Accounts:** Visible in the Admin Console via service-role left-join of `auth.users` with `public.users`.
4. **Admin Resend:** Admins can resend verification emails to unconfirmed learners directly from the User Detail Drawer in `/admin/users`.

---

## 6. Password Recovery & Update Flow

- **Password Reset Request:** `app/(auth)/reset-password/page.tsx` initiates reset via Supabase Auth `resetPasswordForEmail()`.
- **Email Delivery:** Rendered via Send Email Hook action `recovery` pointing to `/reset-password?type=recovery`.
- **Password Update:** `app/api/auth/update-password/route.ts` validates and updates the password, with an access-token→refresh-token fallback and an Origin/Referer check. Note: this Origin/Referer CSRF-style check is currently only applied to this one route, not platform-wide — see [`SECURITY.md`](SECURITY.md).

---

## 7. Email Address Change & Verification Flow

Settings → Security → Change Email reuses Supabase Auth's native email-change confirmation rather than a custom OTP system.

1. **Initiation** (`POST /api/settings/security/change-email`): requires current-password re-authentication (session hydrated via `setSession`), a server-side duplicate-email check, and is rate-limited. On success it calls `auth.updateUser({ email }, { emailRedirectTo: '<site>/email-verified' })`.
2. **Confirmation email**: Supabase's Send Email Hook fires with `email_action_type` of `email_change`, `email_change_current`, or `email_change_new` (one per address being notified). `send-email-hook/route.ts` maps **all three** to the dedicated template key **`auth.email_change_verify`** (kept isolated from `auth.verify_email` so an admin-edited custom template for one can never affect the other).
3. **Confirmation click** (`GET /api/auth/callback`): `normalizeOtpType()` collapses the two granular sub-types to the canonical `email_change` before calling `verifyOtp({ token_hash, type })`, since `verifyOtp()` only recognizes the literal `email_change` value.
4. **On success**: `public.users.email` is synced from `auth.users.email` (there is no database trigger for this — the callback route is the one place every confirmation flows through), a `user.verified` notification is dispatched, and the response **always** redirects to the dedicated `/email-verified` success page — regardless of whether `verifyOtp()` minted a fresh session — never to `/settings` or any other destination.
5. **On failure** (expired, invalid, or already-used link): redirects to `/email-verified?status=error`, which renders a "Link Expired or Invalid" card with a link back to Settings → Security to request the change again.

### `email_action_type` → Template Key Mapping (`send-email-hook/route.ts`)

| `email_action_type` | Template key |
|---|---|
| `signup` | `auth.verify_email` |
| `recovery` | `auth.password_reset` |
| `email_change`, `email_change_current`, `email_change_new` | `auth.email_change_verify` |
| `magiclink` | `auth.verify_email` |
| `invite` | `auth.welcome` |
| `reauthentication` | `auth.verify_email` |
| *(unknown/default)* | `auth.verify_email` (fallback, with a warning logged) |

---

## 8. Status Summary

| Authentication Flow | Location | Status |
|---|---|---|
| **User Signup & Form Validation** | `app/(auth)/signup/page.tsx` | 🟢 Verified in Production |
| **Verification Pending UX** | `app/(auth)/signup/page.tsx` | 🟢 Verified in Production |
| **Duplicate Account Guard** | `app/(auth)/signup/page.tsx` | 🟢 Verified in Production |
| **Wrong-Email Recovery & Resend** | `components/auth/ResendVerificationCard.tsx` | 🟢 Verified in Production |
| **Login & Session Bridge** | `app/(auth)/login/page.tsx`, `proxy.ts` | 🟢 Verified in Production |
| **Password Recovery & Update** | `app/(auth)/reset-password/page.tsx` | 🟢 Verified in Production |
| **Platform Behavior Controls** | `apps/web/proxy.ts`, `lib/admin/settings-service.ts` | 🟢 Verified in Production |
| **Referral Attribution** | `lib/referral/referral-service.ts` | 🟢 Verified in Production |
| **Persistent 60s Rate Limiter** | `lib/rate-limit.ts`, `public.rate_limits` | 🟢 Verified in Production |
| **Supabase Auth Hook Handler** | `app/api/auth/send-email-hook/route.ts` | 🟢 Verified in Production |
| **Email Change & `/email-verified` Flow** | `app/api/settings/security/change-email/route.ts`, `app/api/auth/callback/route.ts`, `app/(auth)/email-verified/page.tsx` | 🟢 Verified in Production |
