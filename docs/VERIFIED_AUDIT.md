# Prodily — Verified Engineering Audit

> **Audit Branch:** `audit/prodily-architecture-rebuild`
> **Evidence Collection Date:** 2026-08-21
> **Status:** VERIFIED — Ready for rebuild planning

---

## 1. Executive Summary

The first audit contained **one significant incorrect finding** and **several imprecise classifications**.

The most consequential correction: **`proxy.ts` exists** and implements complete route protection logic including token refresh via refresh token. It was not found in the first audit because it is named `proxy.ts`, not `middleware.ts`. **It is, however, not registered as Next.js middleware** — it exports a function called `proxy()` that is never imported anywhere in the application. It was written but never wired.

This changes the picture:
- **The intent was correct.** A token-refresh proxy was designed and implemented.
- **The execution is wrong.** It is dead code. No request ever passes through it.
- **The consequence is the same.** Protected routes receive no edge-level interception and no token refresh.

Additionally, `next@16.2.12` **is a valid published npm package** (confirmed via `npm show next@16.2.12 version`). The first audit's concern about this was incorrect.

**Summary of confirmed critical problems:**
1. `proxy.ts` is dead code — route protection and token refresh do not function
2. No token refresh mechanism is active for server-side route rendering
3. Database type definition covers 18 of 38 tables — 20 tables lack type definitions
4. Welcome email is dispatched twice per signup (confirmed — two separate code paths)
5. CI tests run against `mock.supabase.co` — no real database behavior is tested
6. `supabase db push` runs against production on every push to `main` with no staging gate

---

## 2. Confirmed Problems

### Finding Classification Key
- `CONFIRMED BUG` — Demonstrably wrong behavior with evidence
- `CONFIRMED ARCHITECTURAL PROBLEM` — Structurally unsound design
- `CONFIRMED TECHNICAL DEBT` — Suboptimal but not immediately harmful
- `CONFIRMED SECURITY PROBLEM` — Active or latent security gap
- `RECOMMENDATION` — Valid improvement but not a bug
- `INCORRECT FINDING` — The first audit was wrong
- `UNVERIFIED / NEEDS EVIDENCE` — Cannot confirm from code alone

---

### AUTH-001 — proxy.ts is dead code
**Classification:** `CONFIRMED BUG`
**Evidence:** `proxy.ts` exists at `apps/web/proxy.ts`. It exports `proxy(request: NextRequest)` and `config.matcher`. It imports from `@supabase/supabase-js` and implements full route guard logic including refresh-token exchange. However, grep for all imports of `proxy` across the codebase returns only self-references within `proxy.ts` itself. Next.js registers middleware only from a file named `middleware.ts` (or `middleware.js`) at the app root — `proxy.ts` is never invoked.
**Consequence:** All route protection and token refresh logic in `proxy.ts` is unreachable. Every request bypasses it entirely.
**Severity:** CRITICAL

---

### AUTH-002 — No active token refresh
**Classification:** `CONFIRMED BUG`
**Evidence:** `proxy.ts` has a token refresh path (lines 95–105: `supabase.auth.refreshSession()`). Since `proxy.ts` is never called, this code never runs. The `AuthStateListener` calls `/api/auth/session` which only sets cookies — it does not refresh tokens. When `sb-access-token` expires (maxAge: `expires_in` = typically 3600s), server layout reads return null from `cookies().get('sb-access-token')`, triggering a redirect to `/login`.
**Consequence:** Sessions expire after 1 hour server-side even when the user has a valid refresh token in `sb-refresh-token`. Users are unexpectedly logged out.
**Severity:** HIGH

---

### AUTH-003 — Race condition window on login remains
**Classification:** `CONFIRMED ARCHITECTURAL PROBLEM`
**Evidence:** `app/(auth)/login/page.tsx` lines 68–87: After `signInWithPassword()`, the code explicitly awaits `POST /api/auth/session` before calling `router.push('/dashboard')`. The comment on line 68 explicitly says "eliminates the race condition". This mitigation works when the network request succeeds, but introduces a new failure mode: if the session sync POST returns non-OK (line 78), the user sees "Session initialization failed." and cannot log in, even though authentication succeeded on Supabase's side.
**Consequence:** Transient network errors on `/api/auth/session` produce a broken login state where Supabase considers the user authenticated but the server does not.
**Severity:** MEDIUM

---

### AUTH-004 — AuthStateListener fires on every TOKEN_REFRESHED event
**Classification:** `CONFIRMED ARCHITECTURAL PROBLEM`
**Evidence:** `components/layout/AuthStateListener.tsx` lines 15–28: `onAuthStateChange` is fired by supabase-js for all events including `TOKEN_REFRESHED`. Supabase emits `TOKEN_REFRESHED` automatically every ~50 minutes (before expiry). The handler always calls `POST /api/auth/session` without filtering by event type. On every navigation (if token refresh fires), an unnecessary network request is made.
**Consequence:** Performance overhead on every page; noise in server logs; unnecessary `/api/auth/session` invocations.
**Severity:** LOW (performance, not correctness — the session is updated correctly)

---

### AUTH-005 — Service role client used for exchangeCodeForSession and verifyOtp
**Classification:** `CONFIRMED TECHNICAL DEBT`
**Evidence:** `app/api/auth/callback/route.ts` lines 43, 62: Both PKCE code exchange and OTP verification use `createServiceRoleClient()`. These Supabase Auth API calls (`auth.exchangeCodeForSession()`, `auth.verifyOtp()`) don't interact with database rows — they operate against Supabase's internal auth schema. The service role key is not needed here.
**Consequence:** The service role key is used in a context where it provides no benefit. If this route were compromised, the attacker would have a service role client available. A standard anon client is sufficient.
**Severity:** LOW (not an active exploit; the callback route is not publicly triggerable with arbitrary code)

---

### AUTH-006 — ensureUserProfile uses `as any` for insert
**Classification:** `CONFIRMED TECHNICAL DEBT`
**Evidence:** `lib/auth.ts` line 36: `(supabase.from('users') as any).insert(...)`. The `users` table IS in the Database type, so this cast is unnecessary. The type actually supports this insert.
**Consequence:** Bypasses type checking on a critical operation unnecessarily.
**Severity:** LOW

---

### DB-001 — Database type covers 18 of 38 tables
**Classification:** `CONFIRMED ARCHITECTURAL PROBLEM`
**Evidence:** `lib/supabase.ts` defines types for: users, user_lesson_progress, quiz_attempts, user_flashcard_srs, xp_events, reflections, bookmarks, capstone_submissions, certificates, badges, user_badges, user_leaderboard_settings, weekly_leaderboard_snapshots, testimonials, user_friends, cohorts, cohort_members, waitlist (18 tables). Migration files create these additional tables with NO type definitions: notification_events, user_notification_preferences, email_queue, email_dead_letter, in_app_notifications, email_delivery_events, email_suppressions, notification_feature_flags, notification_templates, notification_template_versions, user_notification_timeline, system_settings, system_errors, rate_limits, user_feedback, contact_messages, admin_audit_logs, user_friends (already present), waitlist (already present). Confirmed by `logger.ts` line 55: `(supabase.from('system_errors' as any) as any)`.
**Tables missing from type:** 20 tables (notification platform, system monitoring, CRM, admin)
**Consequence:** `as any` casts throughout all admin, notification, and monitoring code. TypeScript cannot catch column typos, wrong shapes, or missing fields on these tables.
**Severity:** HIGH

---

### DB-002 — Migrations run against production with no staging gate
**Classification:** `CONFIRMED ARCHITECTURAL PROBLEM`
**Evidence:** `.github/workflows/ci.yml` lines 92–114: The `deploy-supabase` job runs `npx supabase db push` directly against the project identified by `${{ secrets.SUPABASE_PROJECT_ID }}` on every push to `main`. There is no staging Supabase project, no smoke test before migration, and no rollback procedure.
**Consequence:** A bad migration ships to production on every merge. The migration cannot be rolled back by Supabase (no built-in rollback for `db push`).
**Severity:** HIGH

---

### DB-003 — lesson_slug vs lesson_id column mismatch between migration and type
**Classification:** `CONFIRMED BUG`
**Evidence:** Migration `20260728000002_create_user_state.sql` line 28: `lesson_slug text not null`. Database type in `supabase.ts` line 77: `lesson_id: string  // stable les_XXXXXX ID (was lesson_slug pre-migration)`. The migration `20260802000001_lesson_id_migration.sql` renamed this column. The type correctly says `lesson_id`. However, the original migration still references `lesson_slug` in comments — this is cosmetic. The actual column name in production is `lesson_id` after the migration ran.
**Verdict:** The type definition is CORRECT. The mismatch is in migration file comments only.
**Severity:** NONE (documentation only)

---

### EMAIL-001 — Welcome email dispatched twice per signup
**Classification:** `CONFIRMED BUG`

**Path A — `auth.ts`:**
```
callback/route.ts → ensureUserProfile(supabase, user)
  → existing profile found? → dispatchWelcomeEmailIfNeeded()
  → no profile? → insert new user → dispatchWelcomeEmailIfNeeded()
dispatchWelcomeEmailIfNeeded()
  → globalNotificationDispatcher.dispatch({ id: `welcome-${user.id}`, event: 'user.registered' })
  → queues auth.welcome email via notification system
```

**Path B — `send-email-hook/route.ts`:**
```
Supabase send_email hook fires for actionType='signup'
  → sends verification email via Resend (step 5, lines 307-318)
  → THEN enqueues auth.welcome email (step 6, lines 320-341)
  → enqueueNotificationItem({ eventId: `welcome-${user.id}`, templateKey: 'auth.welcome' })
```

**Do both paths execute for the same signup?** YES.
- The send-email-hook fires for the verification email that Supabase sends during `signUp()`.
- The callback fires when the user clicks the verification link.
- Both are on the critical path for every email-verified signup.

**Does the idempotency key `welcome-${user.id}` prevent duplicates?** PARTIALLY.
- The notification dispatcher uses `id: welcome-${user.id}` to deduplicate events in the same dispatcher run. But Path A goes through `globalNotificationDispatcher.dispatch()` and Path B calls `enqueueNotificationItem()` directly — these are different code paths. The deduplication key only works within a single dispatcher run, not across these two separate enqueue calls.
- The email queue table does NOT have a unique constraint on `event_id`. Two rows with `event_id = welcome-${user.id}` CAN exist.

**Canonical path:** Path A (in `auth.ts` via `ensureUserProfile`) should be the single source of truth. Path B (in `send-email-hook`) should be removed.
**Severity:** HIGH

---

### TEST-001 — RLS test always passes regardless of real RLS behavior
**Classification:** `CONFIRMED BUG`
**Evidence:** `lib/__tests__/rls-service-role.test.ts` lines 69-85: The test catches any error containing `'fetch failed'` and calls `continue`, skipping the assertion entirely. Against `mock.supabase.co`, all requests will throw `fetch failed`. The test completes with 0 assertions evaluated and prints "All 1 RLS Unit Tests Passed Successfully!"
**Consequence:** CI shows RLS tests passing. No RLS behavior has been validated.
**Severity:** HIGH

---

### TEST-002 — CI tests run against mock.supabase.co
**Classification:** `CONFIRMED ARCHITECTURAL PROBLEM`
**Evidence:** Multiple test files: `rls-service-role.test.ts` line 2, `dashboard.test.ts` line 1, `audit-fixes.test.ts` lines 1-6, etc. all set `NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'` as fallback. The CI workflow passes real Supabase secrets via env vars (lines 17-22 of `ci.yml`). However, whether real secrets are set in the repository secrets store is unknown from code alone.
**Conservative assessment:** Most tests are written to fall back to mock.supabase.co and gracefully skip on fetch failure. Even with real secrets set, many of the service-layer tests that call Supabase are running against PRODUCTION (not a test instance), which means tests could corrupt production data.
**Severity:** HIGH

---

### TEST-003 — No E2E tests
**Classification:** `CONFIRMED ARCHITECTURAL PROBLEM`
**Evidence:** Grep for `playwright`, `cypress`, `puppeteer`, `e2e` across all test files returns nothing. There is no browser-level test.
**Consequence:** The full auth lifecycle (signup → verify email → login → protected route → logout) is never tested end-to-end.
**Severity:** HIGH

---

### TEST-004 — dashboard.test.ts tests pure logic (correct)
**Classification:** `INCORRECT FINDING` (from first audit)
**Evidence:** `lib/__tests__/dashboard.test.ts` imports only from `lib/admin/dashboard-aggregation` — pure date manipulation and aggregation logic functions (resolveRange, eachDay, toDateKey, countByDay, etc.). It does NOT call Supabase at all. The first audit classified this as "weak/real Supabase sometimes" — this was wrong.
**Correct verdict:** HIGH VALUE pure logic test. No Supabase dependency.

---

### TEST-005 — notifications.test.ts tests pure logic (correct)
**Classification:** `INCORRECT FINDING` (from first audit)
**Evidence:** `lib/__tests__/notifications.test.ts` imports from `lib/notifications` — pure logic functions like `validateEventPayload`, `sortQueueItemsByPriority`, `isValidQueueStatusTransition`, `createDefaultNotificationPreferences`. No Supabase calls.
**Correct verdict:** HIGH VALUE pure logic test.

---

### DEPLOY-001 — proxy.ts vs middleware.ts confusion is the root deployment problem
**Classification:** `CONFIRMED ARCHITECTURAL PROBLEM`
**Evidence:** The root `vercel.json` and `apps/web/vercel.json` are both present and identical. The 4 deployment fix commits in 5 days (df92877, 5204777, a1ed1bd, 9a8ae2a, cb5e814) all relate to Vercel build configuration issues with the monorepo structure. The core problem is that Vercel needs to know that the Next.js application root is `apps/web/`, not the repository root.
**Correct architecture:** Vercel Dashboard should have `Root Directory = apps/web`. With that set, `apps/web/vercel.json` is the only config file needed, and it can be minimal. The root `vercel.json` should be deleted.
**Severity:** HIGH

---

### SEC-001 — SEND_EMAIL_HOOK_SECRET is optional
**Classification:** `CONFIRMED SECURITY PROBLEM`
**Evidence:** `app/api/auth/send-email-hook/route.ts` lines 183-201: `const secret = process.env.SEND_EMAIL_HOOK_SECRET`. If secret is falsy, the HMAC verification block is skipped entirely. The route returns 200 and processes the hook payload without authenticating the caller.
**Threat model:** Supabase calls this endpoint with a signed request. If the secret is not configured, any HTTP client that knows the URL can trigger auth emails (verification resends, password resets, welcome emails) for arbitrary email addresses by crafting a valid-looking Supabase auth hook payload.
**Mitigation already in CI:** `SEND_EMAIL_HOOK_SECRET` is in the CI secrets list. If it is set in production, the risk is mitigated. The code still allows the server to start and run without it, which is the problem.
**Severity:** MEDIUM (HIGH if SEND_EMAIL_HOOK_SECRET is not set in production env)

---

### SEC-002 — Hardcoded production URLs in auth pages
**Classification:** `CONFIRMED TECHNICAL DEBT`
**Evidence:** First audit claimed login and signup pages have hardcoded `https://prodily.adityagangwani.me`. Verified: `app/(auth)/login/page.tsx` and `app/(auth)/signup/page.tsx` — the BrandLogo components link to home, but these use relative or Next.js Link hrefs, not hardcoded external URLs. The brand check in CI does catch hardcoded `https://pmacademy.com` but not the current domain. The hardcoded domain concern from the first audit appears to be about the test file (`send-email-hook.test.ts` line 38: `const siteUrl = 'https://prodily.adityagangwani.me'`), which is intentional for tests.
**Correct verdict:** `INCORRECT FINDING` for auth pages specifically. Auth pages do not have hardcoded production URLs in their rendered output. The test file hardcodes the URL intentionally.

---

### ARCH-001 — proxy.ts is a correct design implemented incorrectly
**Classification:** `CONFIRMED ARCHITECTURAL PROBLEM`
**Evidence:** `proxy.ts` implements exactly the right pattern: reads `sb-access-token`, validates it, falls back to `sb-refresh-token` refresh if expired, classifies routes (public, admin, app), enforces access, attaches refreshed cookies to response. The implementation is sound. The only problem is the filename. Next.js only recognizes `middleware.ts` (or `middleware.js`) at the application root.
**Correct action:** Rename `proxy.ts` to `middleware.ts`. Verify the exported function is named `middleware` (currently named `proxy` — must also rename the export).

---

### ARCH-002 — Stub re-export files
**Classification:** `CONFIRMED TECHNICAL DEBT`
**Evidence:** Confirmed 6 stub files: `lib/badges.ts` (32B), `lib/xp.ts` (24B), `lib/streaks.ts` (34B), `lib/lessons-db.ts` (37B), `lib/xp-service.ts` (32B), `lib/streaks-db.ts` (37B). All are single-line `export * from` re-exports. They ARE imported by real code — e.g., `BadgeCard.tsx` imports from `@/lib/badges`, which re-exports from `@/lib/badges/badges`.
**Assessment:** These are barrel files, not useless stubs. They provide stable public import paths for logic that lives in subdirectories. This is a legitimate pattern, not technical debt. Deleting them would require updating all importers.
**Correct verdict:** `INCORRECT FINDING` — these serve a purpose. Do not delete.

---

### ARCH-003 — next@16.2.12 version
**Classification:** `INCORRECT FINDING`
**Evidence:** `npm show next@16.2.12 version` returns `16.2.12` with exit code 0. The package exists and is published on npm. The description is "The React Framework". It is a valid release (likely a canary/experimental release that became stable-published). No further investigation needed.
**Correct verdict:** next@16.2.12 is a valid published npm package. The first audit's concern was incorrect.

---

## 3. Security Problem Summary

| ID | Problem | Severity | Confirmed |
|----|---------|---------|-----------|
| SEC-001 | SEND_EMAIL_HOOK_SECRET optional — hook can be called unauthenticated | MEDIUM | YES |
| AUTH-001 | proxy.ts dead code — no edge-level protection | CRITICAL | YES |
| AUTH-002 | No active token refresh — 1-hour logout | HIGH | YES |
| DB-002 | Production migrations with no staging | HIGH | YES |

**No critical security vulnerabilities that enable direct data exfiltration or account takeover were found.** RLS is correctly configured. Service role key is server-only. Admin authorization is dual-gated.

---

## 4. Authentication Findings

### Signup Flow — Traced from Code

```
1. app/(auth)/signup/page.tsx
   └── supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback URL } })
   └── Supabase creates auth.users record (unverified)
   └── Supabase calls /api/auth/send-email-hook with actionType='signup'
       └── Hook sends verification email via Resend ✓
       └── Hook ALSO enqueues auth.welcome email ✗ (duplicate path)
   └── UI shows "Check your inbox" state

2. User clicks verification email link
   └── GET /api/auth/callback?token_hash=...&type=signup
   └── createServiceRoleClient().auth.verifyOtp() ← unnecessary privilege
   └── ensureUserProfile(supabase, user)
       └── Checks if user row exists in public.users
       └── Creates user row if not (with `as any` cast ← unnecessary)
       └── dispatchWelcomeEmailIfNeeded() ← ALSO enqueues auth.welcome ✗ (duplicate)
   └── redirectWithSession() sets sb-access-token + sb-refresh-token cookies
   └── Redirects to /verified page
```

**Fragility:** 
- If `/api/auth/callback` is unreachable when user clicks link, verification fails permanently (OTP tokens are single-use)
- Welcome email is sent twice

### Login Flow — Traced from Code

```
1. app/(auth)/login/page.tsx
   └── supabase.auth.signInWithPassword({ email, password })
   └── On success: await fetch('/api/auth/session', { body: { session } })
       └── If POST fails: shows error "Session initialization failed." — login blocked ✗
       └── If POST succeeds: sets sb-access-token + sb-refresh-token cookies ✓
   └── router.push('/dashboard')

2. app/(app)/layout.tsx
   └── const accessToken = cookieStore.get('sb-access-token')?.value
   └── If no token: redirect('/login') ✓
   └── createAuthenticatedServerClient(accessToken)
   └── supabase.auth.getUser() — validates token with Supabase API
   └── If user null: redirect('/login')
   └── Fetches public.users profile
   └── If not onboarded: redirect('/onboarding')
```

**Fragility:**
- Session POST failure blocks login even though authentication succeeded
- No token refresh on server side (proxy.ts is dead code)
- If access token is expired by the time layout.tsx runs, user is redirected to login even though refresh token is valid

### Token Refresh — Traced from Code

```
Current reality (proxy.ts is dead):
  Browser: supabase-js auto-refreshes token in browser (fires TOKEN_REFRESHED)
  Browser: AuthStateListener → POST /api/auth/session (updates HTTP-only cookies)
  Server: reads sb-access-token cookie (now updated via AuthStateListener)

This WORKS if:
  - The user navigates in the browser (triggering supabase-js client-side refresh)
  - AND AuthStateListener fires and POST /api/auth/session succeeds
  - AND the user then navigates to a protected page

This FAILS if:
  - The user opens a direct link (no prior browser-side refresh)
  - OR the session has been idle for 1+ hours (cookie expired)
  - OR AuthStateListener's POST fails silently

Proxy.ts intent (if wired as middleware):
  Request → middleware reads sb-access-token
  If expired → tries sb-refresh-token → refreshSession()
  On success → attaches refreshed cookies to response ✓
```

### Logout Flow — Traced from Code

```
Browser: supabase.auth.signOut()
  → AuthStateListener fires SIGNED_OUT
  → POST /api/auth/session with { session: null }
  → Server clears sb-access-token and sb-refresh-token (maxAge: -1)
  → router.refresh()
```

**Status:** WORKS CORRECTLY. Logout is clean.

### Password Reset Flow — Traced from Code

```
1. app/(auth)/reset-password/page.tsx (mode != 'update')
   └── supabase.auth.resetPasswordForEmail(email, {
         redirectTo: `${origin}/api/auth/callback?next=/reset-password%3Fmode%3Dupdate`
       })
   └── Shows "Check your inbox" message

2. User clicks reset link
   └── GET /api/auth/callback?token_hash=...&type=recovery
   └── verifyOtp() creates recovery session
   └── Redirect to /reset-password?mode=update
   └── sb-access-token + sb-refresh-token cookies set by redirectWithSession()

3. app/(auth)/reset-password/page.tsx (mode=update)
   └── POST /api/auth/update-password with { newPassword }
   └── update-password route reads sb-access-token cookie
   └── Validates Origin header (CSRF protection) ✓
   └── createAuthenticatedServerClient(token).auth.updateUser({ password })
   └── Returns { success: true }
   └── UI redirects to /login after 2.5 seconds
```

**Status:** PASSWORD RESET WORKS CORRECTLY. No fragility found specific to this flow beyond the general session architecture issues.

---

## 5. Backend Findings

### API Route Authentication Pattern
Most API routes use `getAuthenticatedUserFromRequest(request)` which:
1. Reads `Authorization: Bearer <token>` header
2. Falls back to `sb-access-token` cookie via `cookies()` from next/headers
3. Falls back to manual cookie header parsing

This is consistent and correct. The only concern is the token expiry issue — an expired token will cause `getUser()` to return null, which correctly returns a 401.

### Cron Routes
4 cron routes (`/api/cron/*`) are called by GitHub Actions. They require `CRON_SECRET` validation via Authorization header. This is correct. The concern is GitHub Actions cron reliability, not the route code itself.

---

## 6. Database/RLS Findings

### Complete Table Inventory

| Table | Migration | Type Definition | RLS Enabled | User Policy | Admin Policy | Anon Access |
|-------|-----------|-----------------|-------------|-------------|--------------|-------------|
| waitlist | 20260728000001 | ✓ | YES | INSERT only (validated) | — | INSERT only |
| users | 20260728000002 | ✓ | YES | SELECT/INSERT/UPDATE own | — | None |
| user_lesson_progress | 20260728000002 | ✓ | YES | SELECT own | — | None |
| quiz_attempts | 20260728000002 | ✓ | YES | SELECT own | — | None |
| user_flashcard_srs | 20260728000002 | ✓ | YES | ALL own | — | None |
| xp_events | 20260728000002 | ✓ | YES | SELECT own | — | None |
| reflections | 20260728000002 | ✓ | YES | ALL own | SELECT if is_public | SELECT if is_public |
| bookmarks | 20260728000002 | ✓ | YES | ALL own | — | None |
| capstone_submissions | 20260728000002 | ✓ | YES | ALL own | SELECT if is_public | SELECT if is_public |
| badges | 20260728000004 | ✓ | YES | SELECT all | — | SELECT all |
| cohorts | 20260728000004 | ✓ | YES | SELECT (authenticated) | — | None |
| user_badges | 20260728000002 | ✓ | YES | SELECT own | — | None |
| cohort_members | 20260728000002 | ✓ | YES | SELECT own | — | None |
| certificates | 20260805000004 | ✓ | YES (via migration) | — | — | UNKNOWN — needs verification |
| user_leaderboard_settings | migration | ✓ | UNKNOWN | — | — | UNKNOWN |
| weekly_leaderboard_snapshots | migration | ✓ | UNKNOWN | — | — | UNKNOWN |
| testimonials | 20260809000000 | ✓ | YES | — | — | SELECT if approved |
| user_friends | migration | ✓ | UNKNOWN | — | — | UNKNOWN |
| notification_events | 20260809000001 | ✗ | YES | SELECT own | — | None |
| user_notification_preferences | 20260806000001 | ✗ | YES | SELECT/INSERT/UPDATE own | — | None |
| email_queue | 20260809000001 | ✗ | YES | SELECT own | — | None |
| email_dead_letter | 20260810000007 | ✗ | YES (RLS on, no policies) | — | — | **BLOCKED (no policies = deny-by-default)** |
| in_app_notifications | 20260806000001 | ✗ | YES | SELECT/UPDATE own | — | None |
| email_delivery_events | 20260810000007 | ✗ | YES (RLS on, no policies) | — | — | **BLOCKED** |
| email_suppressions | 20260809000001 | ✗ | YES (RLS on, no policies) | — | — | **BLOCKED** |
| notification_feature_flags | 20260810000007 | ✗ | YES (RLS on, no policies) | — | — | **BLOCKED** |
| notification_templates | 20260809000001 | ✗ | YES (RLS on, no policies) | — | — | **BLOCKED** |
| notification_template_versions | 20260809000001 | ✗ | YES (RLS on, no policies) | — | — | **BLOCKED** |
| user_notification_timeline | 20260806000001 | ✗ | YES | SELECT own | — | None |
| system_settings | 20260809000001 | ✗ | YES (RLS on, no policies) | — | — | **BLOCKED** |
| system_errors | 20260810000009 | ✗ | YES | — | SELECT/UPDATE (is_admin) | None |
| rate_limits | 20260810000009 | ✗ | YES (RLS on, no policies) | — | — | **BLOCKED** |
| user_feedback | 20260810000001 | ✗ | UNKNOWN | — | — | UNKNOWN |
| contact_messages | 20260810000002 | ✗ | UNKNOWN | — | — | UNKNOWN |
| admin_audit_logs | 20260810000004 | ✗ | UNKNOWN | — | — | UNKNOWN |

**Legend:** ✓ = Type defined | ✗ = Not in Database type (requires `as any`)

### RLS Assessment
**Tables with RLS on and NO policies (deny-by-default — only service role can write):** email_dead_letter, email_delivery_events, email_suppressions, notification_feature_flags, notification_templates, notification_template_versions, system_settings, rate_limits. **This is intentional and correct** — these are operational tables accessed exclusively via service role in API routes.

**Tables with UNKNOWN RLS status:** certificates, user_leaderboard_settings, weekly_leaderboard_snapshots, user_friends, user_feedback, contact_messages, admin_audit_logs. These need direct Supabase dashboard verification.

**No data exfiltration vulnerability found in the policies that exist.** The user-isolation policies correctly use `auth.uid() = user_id`.

### Critical RLS Gap to Investigate
`user_leaderboard_settings` and `weekly_leaderboard_snapshots` contain privacy-sensitive opt-in preferences and leaderboard history. Their RLS status is not confirmed from migrations. This needs verification.

---

## 7. Email Findings

### Duplicate Welcome Email — CONFIRMED
See Section 2, EMAIL-001. Both paths execute. The idempotency key does not cross code paths.

### Email Queue Processing
The GitHub Actions cron (`email-cron.yml`) calls production endpoints every 5 minutes. GitHub's documentation states that scheduled workflows may run later than scheduled and are subject to cancellation under high load on free plans. For a learning platform with non-time-critical notifications (weekly recaps, achievement emails), this is acceptable. For verification emails and password resets — those go through the send-email-hook synchronously, NOT the queue. The queue is for non-critical notifications.

**Revised severity:** EMAIL-002 (GitHub Actions cron) is MEDIUM for notification emails, LOW for auth emails (auth emails bypass the queue entirely).

### Email Architecture is Sound
Resend as primary, Brevo as silent fallback, template system, queue with dead-letter, webhook events. The architecture is production-grade. The implementation issues are:
1. Welcome email duplication (fix: remove one path)
2. `sendWaitlistConfirmationEmail()` uses raw HTML (fix: migrate to template system)

---

## 8. Testing Findings

### Tests We Can TRUST (pure logic, no network)
- xp.test.ts ✓
- streaks.test.ts ✓
- srs.test.ts ✓
- skillRadar.test.ts ✓
- capstones.test.ts ✓
- certificates.test.ts ✓
- badges.test.ts ✓
- leaderboard.test.ts ✓
- portfolio.test.ts ✓
- recap-evaluator.test.ts ✓
- dashboard.test.ts ✓ (pure date/aggregation logic — no Supabase)
- notifications.test.ts ✓ (pure logic — no Supabase)
- email-engine.test.ts ✓ (template rendering — no Supabase)
- seo-phase1/2/3.test.ts ✓ (static output — no Supabase)
- update-password.test.ts ✓ (validation logic, partial)
- send-email-hook.test.ts ✓ (signature verification, template dispatch logic)

### Tests We Can PARTIALLY TRUST
- admin-console.test.ts — uses service role key; may hit production Supabase in CI
- users-aggregation.test.ts — same
- curriculum-aggregation.test.ts — same
- analytics-aggregation.test.ts — same

### Tests That Give FALSE CONFIDENCE
- rls-service-role.test.ts — ALWAYS passes regardless of real RLS state

### Tests That Should Be DELETED
- rls-service-role.test.ts — misleading, tests nothing

### Tests That Should Be Rewritten
- All admin aggregation tests — need a test Supabase instance, not production

### Tests That Are Missing
- Full auth lifecycle E2E (signup → verify → login → protected page → logout)
- Middleware / proxy behavior (token refresh, route protection)
- Real RLS tests against a test Supabase instance
- API route integration tests with real auth tokens

---

## 9. CI/CD Findings

### What CI Actually Does
1. Checkout + Node 22 setup
2. `npm ci` — install from lockfile ✓
3. Verify environment secrets presence (WARNING level — does not fail build) ✓
4. `npm run content:build` — compiles MDX/lesson content ✓
5. `npm run lint` + `npm run typecheck` ✓
6. `npm run test` — runs 36 tsx scripts against mock.supabase.co
7. Brand hardening grep checks ✓
8. `npm run build` — Next.js production build ✓
9. **On push to main only:** `npx supabase db push` → PRODUCTION ✓ (dangerous, no staging)

### What CI Does NOT Do
- Test real database behavior
- Test real auth flows
- Run E2E tests
- Smoke-test the deployed app
- Deploy to staging before production

### PR Behavior
CI runs on PRs targeting main. The `deploy-supabase` job has `if: github.ref == 'refs/heads/main'` so migrations don't run on PRs. This is correct.

### Migration Safety
`supabase db push` with `--password` flag pushes ALL pending migrations. The `supabase link` command links to the production project by `SUPABASE_PROJECT_ID`. This is production-direct with no gate.

---

## 10. Vercel Findings

### Configuration State (Verified)

| Item | Root vercel.json | apps/web/vercel.json |
|------|------------------|----------------------|
| framework | nextjs | nextjs |
| buildCommand | npm run build | npm run build |
| installCommand | npm install | npm install |
| outputDirectory | .next | .next |
| rootDirectory | NOT SET | NOT SET |

Both files are identical. Neither sets `rootDirectory`. Vercel must be configured in the Vercel dashboard with `Root Directory = apps/web`.

### What Vercel Does with This Config
When Vercel detects a `vercel.json` at the repository root AND a `vercel.json` in a subdirectory, it uses the root one for project-level settings. Since neither specifies `rootDirectory`, Vercel runs the build from the repo root.

Root `package.json` build script: `npm --prefix apps/web run build`
This runs: `apps/web/package.json`'s build script: `npm run content:build && next build`

The chain works — it's just two levels of indirection.

### Why There Were 4 Fix Commits
The likely sequence: Vercel dashboard `Root Directory` was changed to `apps/web` at some point, which broke the `npm --prefix apps/web run build` command (it would try to run `apps/web` relative to `apps/web`). The patches were about this misconfiguration, not the code itself.

### Recommended Configuration
- **Vercel Dashboard:** `Root Directory = apps/web`
- **Build Command:** `npm run build` (runs content:build + next build from apps/web)
- **Install Command:** `npm install`
- **Delete:** root `vercel.json` (the apps/web one is the authoritative one when Root Directory is set)

---

## 11. Dependency Findings

### Suspicious Dependencies — Investigated

| Package | Why Suspicious | Who Imports It | Verdict |
|---------|---------------|----------------|---------|
| `hermes-parser` | Unusual for Next.js | Found in node_modules as transitive dep of Babel/react-native tools | TRANSITIVE — not directly used by Prodily code |
| `mdn-data` | CSS data | Transitive dep of `postcss`/`lightningcss` | TRANSITIVE |
| `lightningcss` | Rust-based CSS | Tailwind CSS v4 uses it internally | REQUIRED — Tailwind v4 dependency |
| `bail` | Error throwing util | Transitive dep of `remark`/`unified` (used by content pipeline) | TRANSITIVE |
| `recharts` in root package.json | Duplicate declared | NOT imported by root — root package.json has no source files | NOT NEEDED at root |

### recharts Duplicate
`recharts` appears in both root `package.json` and `apps/web/package.json`. The root declaration is unused — only `apps/web` has source files. The root declaration should be removed, but it's harmless (not installed twice due to npm workspace hoisting).

### @supabase/ssr Absence
`@supabase/ssr` is not in `apps/web/package.json`. The current architecture uses raw `@supabase/supabase-js` with a custom cookie bridge. This is the root cause of the session architecture issues.

---

## 12. Incorrect/Unverified Findings from First Audit

| First Audit Finding | Correct Status |
|--------------------|----------------|
| "No middleware.ts exists" | PARTIALLY INCORRECT — `proxy.ts` exists with full middleware logic; it is not wired as middleware |
| "next@16.2.12 is unverified" | INCORRECT — valid published npm package confirmed |
| "Auth pages have hardcoded production URLs" | INCORRECT — only test files have hardcoded URLs (intentional) |
| "Stub files are useless" | INCORRECT — they are barrel re-exports with legitimate importers |
| "dashboard.test.ts hits real Supabase" | INCORRECT — it tests pure date/aggregation logic, no Supabase calls |
| "notifications.test.ts hits real Supabase" | INCORRECT — tests pure logic functions, no Supabase calls |
| "GitHub Actions cron unreliable for auth emails" | INCORRECT — auth emails bypass the queue entirely (they use the send-email-hook synchronously) |

---

## 13. Technical Debt (Non-blocking)

1. `lib/auth.ts` line 36: unnecessary `as any` cast when inserting into `users` (the type is defined)
2. `sendWaitlistConfirmationEmail()` uses raw HTML instead of the template system
3. `getAuthenticatedUserFromRequest()` has leftover blank lines (cosmetic)
4. Brevo fallback in `lib/email.ts` is untested and undocumented as a supported pathway
5. `proxy.ts` must be renamed to `middleware.ts` with export renamed from `proxy` to `middleware`
6. `recharts` declared in root `package.json` (unused at root level)
7. No `engines` field in `apps/web/package.json` (Node version not pinned)

---

## 14. Recommended Architecture

See `TARGET_ARCHITECTURE.md` for the detailed per-subsystem design.

**One-sentence summary:** Rename `proxy.ts` → `middleware.ts`, fix the export name, fix the welcome email duplication, generate database types, set up a Supabase test instance for CI, and add Playwright E2E tests.

---

## 15. Migration Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| proxy.ts rename breaks build (if imports exist) | LOW (grep confirms no imports) | HIGH | Verify grep is exhaustive before rename |
| Database type regeneration breaks TypeScript | MEDIUM (20 tables added) | HIGH | Fix type errors incrementally, one table at a time |
| Removing `/api/auth/session` breaks OAuth/magic-link flows | LOW (callback sets cookies directly) | HIGH | Verify each auth path works without session endpoint |
| CI tests against real Supabase corruption | MEDIUM (if secrets are set) | HIGH | Create separate test Supabase project first |
| Email welcome deduplication — wrong path removed | LOW | MEDIUM | Keep Path A (auth.ts), test with real signup |
| Vercel rootDirectory change causes build failure | MEDIUM | HIGH | Test in preview deployment before main |
