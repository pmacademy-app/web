# Authentication Infrastructure & User State Sync — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Overview & Supabase Auth Architecture

Authentication is powered by Supabase Auth with PKCE flow and custom email rendering via the Send Email Hook.

- **Client Session Management**: `createClientSupabaseClient()` (`lib/supabase.ts`) handles browser session persistence and token refresh.
- **Server Session Validation**: `createServerSupabaseClient()` extracts JWT tokens from cookies or `Authorization: Bearer` headers.
- **Service-Role Operations**: `createAdminSupabaseClient()` bypasses RLS for administrative user lookups and account verification checks.

---

## 2. User Signup & Duplicate Account Handling

- **Signup Endpoint / Form**: `app/(auth)/signup/page.tsx` submits email and password to Supabase Auth `signUp()`.
- **Existing Account Detection**: When a user attempts to sign up with an already registered email, Supabase Auth returns an empty identities array (`data.user.identities.length === 0`) or an error message.
- **User UX**: Form intercepts existing account responses and immediately displays:
  > *"An account already exists with this email address. Please log in instead."*
  > **[Go to Login →]** button leading directly to `/login`.

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
| **Duplicate Account UX** | `app/(auth)/signup/page.tsx` | 🟢 Verified in Production |
| **Login & Session Management** | `app/(auth)/login/page.tsx` | 🟢 Verified in Production |
| **Password Recovery Flow** | `app/(auth)/reset-password/page.tsx` | 🟢 Verified in Production |
| **Persistent 60s Rate Limiter** | `lib/rate-limit.ts`, `public.rate_limits` | 🟢 Verified in Production |
| **Unverified User Discovery** | `lib/admin/service.ts` | 🟢 Verified in Production |
| **Supabase Auth Hook Integration** | `app/api/auth/send-email-hook/route.ts` | 🟡 Implemented — Verification Required |
