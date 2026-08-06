# PM Academy — Canonical Authentication Flow

> **Status:** Production-stable as of Phase 1.6
> **Last updated:** 2026-08-03
> This document is the single source of truth for every authentication flow.
> Do not introduce new redirect patterns without updating this file.

---

## Route Map

| Next.js File | Actual URL | Notes |
|---|---|---|
| `app/(auth)/login/page.tsx` | `/login` | `(auth)` is a route group — not in URL |
| `app/(auth)/signup/page.tsx` | `/signup` | |
| `app/(auth)/reset-password/page.tsx` | `/reset-password` | |
| `app/(auth)/verified/page.tsx` | `/verified` | NOT `/auth/verified` |
| `app/api/auth/callback/route.ts` | `/api/auth/callback` | Central auth handler |
| `app/api/auth/session/route.ts` | `/api/auth/session` | Cookie sync (sign-out) |

> **Rule:** Next.js route groups `(group-name)` are organisation-only; the folder name
> never appears in the URL. Always use the actual URL path in redirects, not the file path.

---

## The One Canonical Callback

**`/api/auth/callback`** is the single entry point for all server-side authentication
responses. Every email link, OAuth redirect, and magic link MUST route through it.

### Parameters accepted

| Param | Source | Purpose |
|---|---|---|
| `code` | Supabase PKCE / OAuth | Exchanged via `exchangeCodeForSession()` |
| `token_hash` | Supabase OTP email | Verified via `verifyOtp()` |
| `type` | Supabase OTP email | `signup`, `recovery`, `email_change`, `invite`, `magiclink` |
| `next` | Our application | URL to redirect to after successful auth (default: `/dashboard`) |

### What the callback does

1. If `?code=` present -> PKCE exchange -> session -> set cookies -> redirect to `next`
2. If `?token_hash=` + `?type=` present -> OTP verify -> session -> set cookies -> redirect to `next`
3. Both fail -> redirect to `/login?error=auth_failed`

### Session cookie format

```
sb-access-token   httpOnly, secure (prod), sameSite=lax, maxAge=expires_in
sb-refresh-token  httpOnly, secure (prod), sameSite=lax, maxAge=30 days
```

---

## Flow 1: Email Signup + Verification

```
User fills /signup
  -> supabase.auth.signUp({ emailRedirectTo: "/api/auth/callback?next=/verified" })
  -> Supabase sends confirmation email
  -> Email link: {SiteURL}/api/auth/callback?token_hash={TokenHash}&type=signup&next=/verified
  -> /api/auth/callback: verifyOtp({ token_hash, type: "signup" })
  -> session created -> cookies set -> redirect to /verified
  -> User sees "Email Verified!" page with "Go to Dashboard" button
  -> Dashboard click -> /dashboard (middleware validates session cookies)
```

### Supabase "Confirm Signup" email template link

```
{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/verified
```

---

## Flow 2: Password Reset

```
User fills /reset-password (request mode)
  -> supabase.auth.resetPasswordForEmail({ redirectTo: "/api/auth/callback?next=/reset-password%3Fmode%3Dupdate" })
  -> Supabase sends reset email
  -> Email link: {SiteURL}/api/auth/callback?token_hash={TokenHash}&type=recovery&next=/reset-password?mode=update
  -> /api/auth/callback: verifyOtp({ token_hash, type: "recovery" })
  -> session created -> cookies set -> redirect to /reset-password?mode=update
  -> User sees password update form (session cookies allow updateUser() to work)
```

### Supabase "Reset Password" email template link

```
{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password%3Fmode%3Dupdate
```

---

## Flow 3: Magic Link

### Supabase "Magic Link" email template link

```
{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard
```

---

## Flow 4: Google OAuth (Phase 2)

```
-> supabase.auth.signInWithOAuth({ redirectTo: "/api/auth/callback" })
-> Google OAuth -> Supabase PKCE code -> /api/auth/callback?code=...
-> exchangeCodeForSession(code) -> session -> cookies -> redirect to /dashboard
```

---

## Flow 5: Email Change

### Supabase "Change Email" email template link

```
{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=email_change&next=/settings
```

---

## Flow 6: Invite User

### Supabase "Invite User" email template link

```
{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/onboarding
```

---

## Non-Negotiable Rules

1. **All email links MUST route through `/api/auth/callback`** — never link directly to app pages.
2. **Never use `{{ .ConfirmationURL }}`** in templates — it generates an implicit-flow hash URL
   (`#access_token=...`) that the server cannot read. Always use `{{ .TokenHash }}`.
3. **`next=` must percent-encode `?` as `%3F` and `&` as `%26`** when the destination URL
   has its own query params (e.g., `next=/reset-password%3Fmode%3Dupdate`).
4. **`(auth)` route group does not appear in URLs.** `app/(auth)/verified/page.tsx` -> `/verified`.
5. **Session cookies are set only by `/api/auth/callback`** via `redirectWithSession()`.

---

## Middleware Route Classification (proxy.ts)

| Route prefix | Class | Authenticated | Unauthenticated |
|---|---|---|---|
| `/login`, `/signup`, `/reset-password` | isAuthPage | -> /dashboard | Allow |
| `/dashboard`, `/review`, `/progress` etc. | isAppPage | Allow | -> /login |
| `/verified`, `/curriculum`, `/` etc. | Public | Allow | Allow |
| `/api/auth/callback` | Excluded | Route handler | Route handler |
