# Incident Report — Unthrottled Signup & Welcome-Email Flood (2026-09-06/07)

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Status:** Signups paused, permanent fixes committed and deployed to production (`e13f907` + a follow-up test-isolation fix), 1,233 flagged accounts banned (not deleted, fully reversible).
**Last Updated:** September 7, 2026

---

## 1. Summary

Between **2026-09-06 08:00 UTC** and **2026-09-07 09:20 UTC**, `public.users` grew from a baseline of ~293 accounts (~280 legitimate learners plus a handful of routine daily signups) to **1,526 total accounts** — an increase of **1,233 accounts** in roughly 25 hours. Every one of the added accounts fired a "Welcome Email" through the notification queue, which pushed **1,238 emails** through Brevo (the primary provider) in the same window; **592 of those (48%)** ended up in `failed` status due to bounce/block events reported back by Brevo's own delivery webhooks.

This was **not** externally distributed spam. It was traced conclusively to **five Gmail accounts using "+" address aliasing** to generate unlimited unique-looking recipient addresses (`jbokojoo11+loadtest-N-<hash>@gmail.com`, `dopromokdodotatmo+prodily-test-N-<hash>@gmail.com`, etc.), hitting the public signup API in a tight, sustained loop. The naming convention (`loadtest`, `prodily-test`) is self-descriptive and consistent with an unauthenticated load-testing/probing tool rather than credential-stuffing or account-takeover fraud — but the effect on infrastructure (email quota, database growth, false "attack" signal) was real regardless of intent.

**None of the 1,233 accounts show any product engagement**: 0 completed onboarding, 0 rows in `user_lesson_progress`, 0 with `total_xp > 0`. The 5 genuine signups that occurred during the same window all completed onboarding normally and are unaffected.

## 2. Timeline

| Time (UTC) | Event |
|---|---|
| 2026-08-04 → 2026-09-05 | Normal baseline: 1–49 signups/day, ~293 total accounts by 2026-09-05 |
| 2026-09-06 08:20 | First `+loadtest-`/`+prodily-test-` pattern account created |
| 2026-09-06 09:00–12:00 | Peak burst: 273, 386, 349 signups in three consecutive hours (~1 every 9–10 seconds, sustained) |
| 2026-09-06 (day total) | 1,136 signups |
| 2026-09-06 18:00–19:00 | Second burst window (125 signups) after a multi-hour gap |
| 2026-09-07 08:00–09:20 | Final tail of the burst (102 signups) before mitigation |
| **2026-09-07 09:20 UTC** | **`allowSignups` flipped to `false` in `system_settings.product_settings`; verified live via a direct POST to `/api/auth/signup` returning HTTP 403 `SIGNUPS_DISABLED`.** |

## 3. Attack Vector / Root Cause

### 3.1 How accounts were created
- All 1,233 accounts went through the **normal, public `/api/auth/signup` route** — no evidence of a separate or bypassed endpoint.
- The platform's `requireEmailVerification` setting was **already `false`** in production at the time of the incident (an existing configuration choice, not something flipped during the attack). This routed every signup through **Flow B** in [`signup/route.ts`](../apps/web/app/api/auth/signup/route.ts): `supabase.auth.admin.createUser({ email_confirm: true })` followed by an immediate `signInWithPassword()` — i.e. every request produced a **fully confirmed, logged-in account in one round trip**, with no email-click friction at all.
- **`POST /api/auth/signup` had zero rate limiting of any kind** — no per-IP limit, no per-email limit, no CAPTCHA, no bot detection. Every other public write endpoint in the codebase (`/api/waitlist`, `/api/contact`, `/api/auth/resend-verification`) has some form of throttling; the actual account-creation endpoint did not.
- The Supabase project's own Auth REST API already has public self-service signup **disabled** at the platform level (`signup_disabled` — confirmed live during this investigation), so the public anon key cannot be used to create users directly. Our own backend uses the **service-role** key via `supabase.auth.admin.createUser()` / `supabase.auth.signUp()`, which is a privileged path unaffected by that project-level flag. This route is the **only** account-creation call site in the codebase (verified by search — no OAuth wiring, no other route calls `admin.createUser`/`auth.signUp`).
- The `+` alias trick let a handful of real Gmail inboxes look like ~1,233 distinct email identities to our schema (`users.email` is only unique per exact string, and nothing canonicalized `local+tag@gmail.com` down to `local@gmail.com` for rate-limiting purposes).

### 3.2 Why the email system amplified it
- **Every** new signup — regardless of `requireEmailVerification` — fires exactly one "Welcome Email" via `ensureUserProfile()` → `dispatchWelcomeEmailIfNeeded()` ([`lib/auth.ts`](../apps/web/lib/auth.ts)) → `user.registered` → `auth.welcome`, queued in `public.email_queue`. This is correct, idempotent behavior by design; the problem was purely upstream signup volume.
- The platform has a documented daily email send quota (`system_settings.email_daily_send_limit`, default 100) with a correctly-written atomic Postgres function, `increment_daily_email_quota(p_limit)` ([migration `20260810000008`](../supabase/migrations/20260810000008_email_automations_and_limits.sql)), that atomically increments-and-checks in one statement and returns `false` once the limit is hit.
- **That function was being called *after* the email had already been sent successfully, and its return value was discarded.** ([`lib/notifications/queue/processor.ts`](../apps/web/lib/notifications/queue/processor.ts), pre-fix). The quota was tracked but never actually gated anything — this is the reason 1,238 emails went out through Brevo in a day against a documented ~100/day intended ceiling.
- Delivery data from `email_delivery_events` for the incident window: `brevo.request: 501`, `email.bounced: 483`, `email.opened: 12`, `email.delivered: 3`, `brevo.error: 1`. Almost the entire failure volume (592/1,238 queue rows) came back as **Brevo-side bounce/block webhook events after initial acceptance**, not as synchronous send errors — consistent with Brevo's own quota/reputation limits kicking in under sustained burst volume. Only **1** request failed synchronously with a timeout.
- Because almost all failures were asynchronous bounces rather than synchronous errors, the Brevo→Resend fallback in [`lib/email.ts`](../apps/web/lib/email.ts) rarely triggered in this specific incident (no `resend.*` events appear in `email_delivery_events` for the window). However, the fallback logic itself was unconditional (`if (!brevoRes.success) → fall back to Resend`), which **would** have pushed the same unbounded volume onto Resend given a slightly different failure shape (e.g. Brevo returning a synchronous 429/402 for quota exhaustion instead of accepting-then-bouncing). This has been fixed regardless — see §5.

## 4. Database Audit

| Metric | Count |
|---|---|
| Total `auth.users` at time of audit | 1,526 |
| Matching `+loadtest-`/`+prodily-test-` automated pattern | **1,233** |
| Distinct Gmail base identities behind the pattern | 5 (`jbokojoo11`, `jojojojojoo11`, `jojojojojo`, `dopromokdodotatmo`, `dopromokotatmo`) |
| Pattern accounts with `onboarding_complete = true` | 0 / 1,233 |
| Pattern accounts with any `user_lesson_progress` row | 0 |
| Pattern accounts with `total_xp > 0` | 0 |
| Everything else (legitimate baseline + organic signups) | 293 |
| Confirmed (`email_confirmed_at` set) | 1,520 / 1,526 |
| Unconfirmed | 6 |
| Email domain concentration | 1,505 / 1,526 (98.6%) on `gmail.com` |

**Selection criterion used for classification:**
```sql
email ~* '\+(loadtest|prodily-test)-[0-9]+-[a-f0-9]+@gmail\.com$'
```
This is a precise, low-false-positive-risk pattern — it only matches the exact self-labeled automated naming convention observed, not "any Gmail plus-alias" (which some genuine users may legitimately use).

## 5. Immediate Mitigation (done)

1. **Signup paused in production** by setting `allowSignups: false` in `system_settings.product_settings` (the existing DB-backed feature flag already read by `/api/auth/signup` before any account-creation call). This required **no code deploy** and took effect immediately.
2. Verified server-side enforcement live: `POST https://prodily.adityagangwani.me/api/auth/signup` now returns `HTTP 403 { "code": "SIGNUPS_DISABLED" }` before touching Supabase Auth or the database.
3. Confirmed **no bypass path** exists:
   - The only two account-creation call sites in the entire codebase (`supabase.auth.signUp()` and `supabase.auth.admin.createUser()`) are both inside the now-gated route.
   - No OAuth/social login is wired up anywhere in the app.
   - The Supabase project's public Auth REST API already rejects direct signup attempts (`signup_disabled`) independent of this flag.
   - `/api/auth/login` only authenticates existing users (it may auto-confirm an existing user's email when `requireEmailVerification` is off, but never creates a new one).
   - `/api/auth/callback` only exchanges an already-issued code/OTP; it cannot originate a new account.
4. **Existing users are fully unaffected**: login, password reset, and email-change flows do not touch `allowSignups` and were not modified.
5. This is a one-line, instantly reversible toggle back to `true` (Admin Panel → Platform Behavior → **Allow Signups**, or the same DB upsert) once the permanent fixes below are deployed and the team is ready to reopen registration.

## 6. Permanent Fixes (implemented in code, pending commit/deploy)

All four are minimal, targeted, and covered by the existing test suite (100 files / 1,029 tests passing after the change):

1. **Server-side rate limiting added to `/api/auth/signup`** ([`route.ts`](../apps/web/app/api/auth/signup/route.ts)) — previously the only public write endpoint in the codebase with none:
   - 5 signups / 15 minutes per IP address.
   - 3 signups / 24 hours per **canonicalized** email (Gmail `+tag` aliases collapse to their base address specifically to close the abuse pattern seen in this incident).
   - Both use the existing persistent, cross-instance `evaluatePersistentRateLimit()` (already used by `/api/auth/resend-verification`) rather than in-memory counters, so it holds up correctly on serverless.
2. **Email-provider fallback made failure-aware** ([`lib/email.ts`](../apps/web/lib/email.ts)) — Brevo→Resend (and the reverse) now only triggers on genuinely transient failures (network exception, timeout, or 5xx). It no longer falls back on quota exhaustion, invalid recipient, or auth/config errors (4xx), so a future Brevo quota event can no longer silently dump unlimited volume onto Resend.
3. **The daily email send quota is now actually enforced** ([`lib/notifications/queue/processor.ts`](../apps/web/lib/notifications/queue/processor.ts)) — the existing atomic `increment_daily_email_quota()` Postgres function is now called **before** dispatch (not after), and non-critical items are deferred to the next processing run once the limit is reached, instead of being sent and merely logged. This is the actual circuit breaker that was missing.
4. **Webhook diagnostic fix** ([`app/api/email/webhooks/route.ts`](../apps/web/app/api/email/webhooks/route.ts)) — bounce/failure `error_message` values were unconditionally labeled `"Resend event: ..."` even for Brevo-originated events, which made this exact investigation harder. Now correctly labeled per actual provider.

Deployed as commit `e13f907` on `main`, 105 test files / 1,063 tests passing (34 new tests added specifically for these four fixes).

### Follow-up: test-isolation gap found during production verification
While verifying the deploy, a check of the live `rate_limits` table turned up three rows with obviously test-fixture emails (`sarah@example.com`, `john@example.com`, `duplicate@example.com`). Two **pre-existing** test files (`platform-behavior.test.ts`, `email-confirmation-requirement.test.ts`) call the signup route directly without mocking the new rate limiter; one of their Supabase mocks didn't implement `.upsert()` for the `rate_limits` table in a way that reliably fell back to the in-memory limiter, so a real write reached production using the local dev environment's live service-role credentials. The three test rows were deleted immediately (verified by exact key match against the known fixture set — nothing else was touched). Fixed at the source: `evaluatePersistentRateLimit()` ([`lib/rate-limit.ts`](../apps/web/lib/rate-limit.ts)) now hard-guards against running its real-database path in any test environment (`NODE_ENV=test`/`VITEST=true`) unless `ALLOW_TEST_DB_ACCESS=true` is explicitly set, so correctness no longer depends on every test's mock being complete. Both affected test files, plus the dedicated persistent-limiter test (which legitimately needs the real code path against a safe, fully in-process fake table), were updated accordingly. Re-ran the full suite after the fix: 0 new rows in `rate_limits`.

### Not yet implemented — requires a product/infra decision
- **CAPTCHA / bot challenge (e.g. Cloudflare Turnstile) on signup.** No CAPTCHA provider is currently configured anywhere in the codebase or environment. Rate limiting alone would have slowed this specific incident dramatically (5/15min/IP vs. one request every ~9 seconds sustained) but a determined multi-IP script could still trickle through. Recommend provisioning a Turnstile site/secret key and gating the signup form + API on it.
- **Disposable/role-based email domain blocking** — would not have stopped this specific incident (all activity was real gmail.com), but is a reasonable general-purpose addition.
- **IP/device fingerprinting** — heavier lift, not recommended as a first response; the rate limiting + CAPTCHA combination is the standard, proportionate fix for this class of abuse.

## 7. Cleanup of the 1,233 Automated Accounts — EXECUTED (approved by the team)

Selection query used (matches the audit exactly):
```sql
select id, email, created_at, email_confirmed_at, last_sign_in_at
from auth.users
where email ~* '\+(loadtest|prodily-test)-[0-9]+-[a-f0-9]+@gmail\.com$'
order by created_at;
-- returned exactly 1,233 rows, matching the audit count
```

**Action taken:** Soft-disable, not delete. Before any mutation, a full backup (`id`, `email`, `created_at`, `email_confirmed_at`, `last_sign_in_at`) for all 1,233 matching rows was exported outside the database. Each row was then banned via `supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' })` — this blocks login without touching `public.users` or triggering any cascading delete. `public.users` rows are untouched (no XP/streak/progress data exists to lose — confirmed zero engagement in §4).

**Result:** 1,233 / 1,233 banned successfully, 0 failures. Spot-checked 5 accounts post-run and confirmed `banned_until` is set (~100 years out) on each.

**Rollback:** unbanning is `admin.updateUserById(id, { ban_duration: 'none' })` — instant, no data loss, since nothing was deleted.

**Hard deletion** was explicitly **not** performed and is not currently planned — the ban already fully neutralizes these accounts with no user-facing risk. If the team wants to hard-delete later (`auth.admin.deleteUser()`, cascades to `public.users` via `ON DELETE CASCADE`), that should be a separate, explicit decision after a retention window (suggest 14–30 days), not an automatic follow-on to this cleanup.

## 8. Remaining Risks

- The permanent code fixes (§6) are sitting as **uncommitted working-tree changes** on `main` — deploying them (commit, push, verify Vercel build) is left to the team to trigger on their own schedule. Production is currently protected only by the `allowSignups=false` DB flag, which is fully effective on its own but should not be the only defense-in-depth layer long-term.
- Reopening signups (`allowSignups: true`) is likewise left to the team's judgment on timing.
- No CAPTCHA is in place; once signups reopen, a slower/multi-IP variant of the same script could still create accounts within the new rate limits (just much more slowly than before).
- The five Gmail identities behind this incident have not been added to any blocklist/suppression list — worth doing before signups reopen.
- The pre-mutation backup of the 1,233 banned accounts (`incident-2026-09-06-banned-accounts-backup.json`) was written to a local working directory outside the git repo (by design — it contains real email addresses and shouldn't be committed). It was also delivered to the team directly; move it to durable, access-controlled storage rather than relying on it staying in that location.

## 9. Verification Performed

- Live production test: `POST /api/auth/signup` → `403 SIGNUPS_DISABLED` (post-mitigation).
- Live production test: direct `POST {SUPABASE_URL}/auth/v1/signup` with the public anon key → `422 signup_disabled` (confirms no anon-key bypass exists at the Supabase Auth layer).
- Full codebase search: confirmed exactly two account-creation call sites, both inside the gated route; no OAuth wiring found.
- Full test suite: **100 files / 1,029 tests passing** after all code changes.
