# Authentication Infrastructure & User State Sync — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Framework:** Next.js 16.2.12 (Turbopack) / Supabase Auth / PostgreSQL  
**Last Updated:** September 6, 2026  

---

## 1. Overview & Current Auth Architecture

Authentication is powered by Supabase Auth with PKCE flow, custom email rendering via the Send Email Hook, and edge-level request interception.

### The session has one owner (B13-A)

httpOnly cookies are the **only** session store for the web. There is no client session
bridge and no `localStorage` session.

Before B13-A the refresh token lived in `localStorage` *and* in an httpOnly cookie
(`F-02`), which made the cookie protection decorative — the same credential sat in a
store any script on the origin could read — and let the two copies drift apart. The auth
routes also returned the full session in their JSON bodies (`F-SEC-8`).

| Concern | Web | Native |
|---|---|---|
| Access token | httpOnly `sb-access-token`, `SameSite=Lax`, `Secure` in production | `Authorization: Bearer` |
| Refresh token | httpOnly `sb-refresh-token`, rotated **server-side only** | `POST /api/auth/refresh` |
| Token in a response body | **Never** | Login, signup and refresh only, on opt-in |
| Session store | Cookies. `persistSession: false` on the browser client | Platform secure storage |
| Refresh trigger | `proxy.ts`, on the first request after the access token expires | Explicit call to `/api/auth/refresh` |
| Logout | `POST /api/auth/session` revokes server-side, then clears the cookies | Same route, or `POST /api/auth/logout` with a bearer token |

- **Client Session Management:** none. `createBrowserSupabaseClient()` (`lib/supabase.ts`)
  runs with `persistSession: false`, `autoRefreshToken: false` and
  `detectSessionInUrl: false`. Its one remaining use is `resetPasswordForEmail()`, an
  anonymous provider call that needs no session.
- **Session issuance:** `POST /api/auth/login`, `POST /api/auth/signup` and
  `GET /api/auth/callback` set the cookies directly. The browser never handles a token.
- **Session refresh:** `proxy.ts` exchanges an expired access token for a fresh pair
  using the refresh cookie and writes the rotated pair onto the response. This replaces
  what supabase-js `autoRefreshToken` plus the bridge used to do, on the side that
  actually holds the credential.
- **`POST /api/auth/session`:** sign-out only. It no longer accepts a session; the
  ingest path that made session fixation conceivable does not exist.
- **Native clients:** a caller that sends `X-Client-Type: native` receives the session in
  the login, signup and refresh response bodies, because it has no cookie jar the server
  can write to. The header is **never** an authorization input — `resolveActor()` owns
  that, Bearer-first then cookie — and a browser sending it would receive only its own
  tokens. See `lib/auth/client-type.ts`.
- **Cookie definition:** `lib/auth/session-cookies.ts` is the single definition of the
  cookie names and their `httpOnly`/`secure`/`sameSite`/`path` options.
- **Server Session Validation:** server code reads cookies to authenticate requests.
- **Service-Role Operations:** `createServiceRoleClient()` is strictly server-side,
  bypassing RLS for admin user discovery and system-level operations.
- **Request Interception (`apps/web/proxy.ts`):** Edge-level proxy inspects cookies,
  validates JWT tokens, refreshes expired sessions, and enforces platform controls.

> **Deploying B13-A logs every existing user out once.** Sessions established under the
> old model live in `localStorage`, which the new client does not read. Ship it at a low
> traffic hour and say so in the release note.

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

## 7a. Logout

`apps/web/lib/auth/logout.ts` is the only client-side logout implementation. Both
consumers call it and differ only in destination: `components/layout/Topbar.tsx`
sends the learner to `/login`, and `lib/admin/session.ts` (`signOutAdmin()`, shared
by `AdminHeader` and `AdminSidebar`) sends the admin to `/admin/login`.

Since B13-A, logging out is **one** server call: `POST /api/auth/session` with
`{ action: 'sign_out' }`. The route revokes the refresh token at the provider using the
httpOnly cookie, then clears both cookies, and reports the revocation outcome in the
response body as `revocation: 'revoked' | 'skipped' | 'failed'`.

Revocation moved server-side because it had to. With `persistSession` disabled there is
no browser-held session for `supabase.auth.signOut()` to revoke, so the old client call
would have become a no-op that still reported success — and the refresh token would have
stayed valid at the provider for its full thirty days after the user had visibly logged
out. The side that holds the credential is the side that can end it.

Clearing the cookies is not conditional on revocation succeeding. It is the part the
user can observe and the part that ends the session for this browser; refusing to clear
because the provider was unreachable would leave someone logged in at a shared machine
over a network blip. A `revocation: 'failed'` is surfaced as a `provider_sign_out`
failure instead.

Three properties the helper guarantees, and why each exists:

- **Each step is settled independently.** The earlier duplicated implementations
  ran both inside one `try`, so a failing provider sign-out skipped the cookie
  clear entirely and left a usable server-side session behind.
- **Navigation happens in `finally`.** An offline browser or a failing provider
  still moves the user off the authenticated view.
- **Failures are returned, not swallowed.** `logout()` never throws; it returns
  `{ ok, failures }`, where each failure names the step (`provider_sign_out` or
  `session_cookie_clear`) and a short, non-sensitive reason. A non-2xx response to
  the sign-out call counts as a failure — `fetch` rejects only on transport
  errors, so a 5xx would otherwise read as a successful logout.

`POST /api/auth/logout` is a separate server route that additionally revokes the
session server-side from a bearer token. No client currently calls it; it exists
for non-browser consumers.

Covered by `apps/web/lib/__tests__/b10a-error-boundaries-and-logout.test.ts` and
`apps/web/lib/__tests__/b13a-single-session-owner.test.ts`.

---

## 7b. Send Email Hook authentication

`app/api/auth/send-email-hook/route.ts` accepts `SEND_EMAIL_HOOK_SECRET` from four
places, in this order: the `Authorization: Bearer` header, one of three custom
headers (`x-supabase-auth-secret`, `x-hook-secret`, `x-secret`), a `secret` query
parameter, and a standardwebhooks/Svix HMAC signature over the raw request body.
The secret is accepted in three spellings — raw, and with the `v1,` and `whsec_`
prefixes stripped — because which form is stored depends on how it was copied out
of the dashboard.

Since B7-D every one of those comparisons is constant-time
([`SECURITY.md` §4a](SECURITY.md)). The HMAC branch was already correct and is
unchanged.

**The query-parameter branch was removed in B7-D** (F-SEC-12), after a human
verified on 2026-09-14 that the production hook is configured with a standard
`v1,whsec_...` signing secret and therefore authenticates by HMAC, not by a URL
secret. The route no longer reads query parameters at all.

That HMAC is computed over the **raw body**, which is why this route is one of the
two auth routes deliberately **not** wrapped in `withRoute`: `resolveActor` would
have to read the body to authenticate, consuming the stream the route still needs.
`app/api/auth/callback` is the other exception — it is a redirect-only browser
endpoint with no JSON envelope, so the canonical error contract does not apply.
The other eight auth routes are on the wrapper.

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

---

## API Error Response Contract

Every auth API error uses one additive shape. `error` is a **string** and `code` is top-level, because the auth screens read `json.error` and re-classify it and `ResendVerificationCard` branches on `data.code`:

```json
{ "success": false, "error": "<safe message>", "code": "<stable code>", "errorId": "err_…" }
```

- **`error`** is always copy we wrote. Raw exception, provider and database text never reaches a client. Unexpected failures return generic copy plus an `errorId` that correlates to a `system_errors` incident.
- **`code`** is stable and machine-readable — either an `AuthErrorCode` from `lib/auth/errors.ts` or a platform code (`VALIDATION`, `SIGNUPS_DISABLED`, `SERVER_ERROR`).
- **`errorId`** appears only for unexpected server failures; the auth screens render it so a learner can quote it to support.
- Route-specific fields (`requiresVerification`, `email`) are unchanged.

Helpers live in `apps/web/lib/errors/api-response.ts`. On the client, `resolveApiAuthError()` reads the server's stable code rather than re-deriving one from the message. Provider errors are routed through the existing `classifyAuthError()` classifier so auth keeps one classification system.

HTTP statuses are unchanged: `400` validation and provider rejection, `401` expired recovery link, `403` signups disabled, `409` user exists, `500` unexpected.

The `updatePasswordAction` server action follows the same contract — its return value is serialized to the browser, so it returns classifier copy and a code rather than the GoTrue message.

See [ADR-006](decisions/ADR-006-api-error-response-contract.md).

## Auth Email Delivery Failures

Delivery failures on `/api/auth/send-email-hook` and in `lib/email.ts` are recorded as structured incidents (`domain: auth` / `domain: email`) with the masked recipient, `email_action_type`, provider and status code. Until September 2026 this path emitted only `console.error`, so signup verification and password reset could fail with no admin-visible signal. See [`ERROR_MONITORING.md`](ERROR_MONITORING.md).
