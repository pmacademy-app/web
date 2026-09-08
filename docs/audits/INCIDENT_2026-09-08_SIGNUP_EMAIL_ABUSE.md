# Security Investigation — Signup Abuse & Untrusted Welcome-Email Sends (2026-09-08)

**Repository:** `prodily-monorepo` (app at `apps/web/`)
**Branch inspected:** `email-provider-failover-implementation` (P2–P14 work, HEAD `b9581b8`)
**Scope:** Investigation and design only. No code, tests, or configuration were modified.
**Predecessor:** [`INCIDENT_2026-09-06_SIGNUP_ABUSE.md`](./INCIDENT_2026-09-06_SIGNUP_ABUSE.md) — the fixes from that incident are present in this branch and are *not* sufficient for what happened today.

---

## 0. Executive summary

The 2026-09-06 fixes closed the **queue** path (welcome emails via `email_queue`) and left the **hook** path (Supabase Auth → `/api/auth/send-email-hook` → `sendEmail()` → Brevo) completely ungated. Today's attack went through the ungated path.

Three facts explain the whole incident:

1. **Every accepted `POST /api/auth/signup` request causes a provider call before anything is committed to `public.users`.** With `requireEmailVerification = true` (the current default), `supabase.auth.signUp()` makes GoTrue invoke our send-email hook synchronously. That hook calls `sendEmail()` directly — it never touches `email_queue`, so it bypasses the daily quota gate, the global pause, `EMAIL_ENABLED`, the automation toggles, the suppression list and every dedup check. The app-side account row is never created in that flow, which is exactly why the addresses "were not registered in our database."
2. **A single attacker-controlled field, `refCode`, additionally queues the real "Welcome to Prodily!" email for an unverified address.** In Flow A, `ensureUserProfile()` runs *only* when a `refCode` is supplied — and `ensureUserProfile()` unconditionally dispatches `user.registered` → `auth.welcome`. The referral code is never validated before this happens. This is the literal "welcome email for a signup that isn't real."
3. **The rate limits cannot survive rotation and are not atomic.** The keys are per-IP and per-canonical-email only, the client IP is read from the spoofable leftmost `x-forwarded-for` entry, the limiter is a non-atomic read-modify-write, and it fails open to a per-instance in-memory map when the database errors. There is no global ceiling on signups and no provider-budget circuit breaker anywhere upstream of the hook.

Net effect: cost-per-request to the attacker is one HTTP call; cost to Prodily is one to two provider sends. Because `classifyProviderFailure()` treats 402/408/429 as failover-eligible, Brevo quota exhaustion pushes the same unbounded volume onto Resend rather than stopping it.

---

## 1. Current signup flow (as implemented on this branch)

### 1.1 Flow A — `requireEmailVerification = true` (current default)

```
Browser  POST /api/auth/signup  {name,email,password,refCode?}
   │
   ├─1 zod validate  (name/email/password; refCode: z.string() — unvalidated, unbounded)
   ├─2 SettingsService.getProductSettings()  → allowSignups gate (403 SIGNUPS_DISABLED)
   ├─3 evaluatePersistentRateLimit signup_ip:<xff[0]>      5 / 15 min
   │   evaluatePersistentRateLimit signup_email:<canon>    3 / 24 h      (429 if either fails)
   │
   ├─4 supabase.auth.signUp({email,password})   ← service-role client
   │      └─ GoTrue creates auth.users row (email_confirmed_at = NULL)
   │      └─ GoTrue POSTs the Send Email Hook  ═══════════════════╗
   │                                                              ║
   │   ╔══════════════════════════════════════════════════════════╝
   │   ║ POST /api/auth/send-email-hook
   │   ║   verify hook secret / HMAC            ✅ authenticated
   │   ║   map action_type 'signup' → auth.verify_email
   │   ║   renderEmailTemplate()
   │   ║   sendEmail()  ──────────────►  BREVO   ← ❌ NO quota gate
   │   ║                                          ❌ NO global pause
   │   ║                                          ❌ NO EMAIL_ENABLED flag
   │   ║                                          ❌ NO suppression check
   │   ║                                          ❌ NO dedup / idempotency
   │   ║                                          ❌ NO app-side volume cap
   │   ║   on 402/408/429/5xx  ──────►  RESEND  (failover — drains provider #2)
   │   ╚══════════════════════════════════════════════════════════╗
   │                                                              ║
   ├─5 existing-account detection (identities.length === 0)  ─────╝  (409 AFTER the send)
   │
   ├─6 IF refCode present:
   │      ensureUserProfile()  → INSERT public.users        ← first durable app-side write
   │        └─ dispatchWelcomeEmailIfNeeded()
   │             └─ dispatch 'user.registered'
   │                  ├─ connector.in_app.user.registered  → in_app_notifications
   │                  └─ connector.auth.welcome            → enqueueNotificationItem()
   │                       └─ email_queue INSERT (priority high)
   │                            └─ processEmailQueue(5) fired immediately, un-awaited
   │                                 └─ quota gate ✅ → sendEmailWithFailover() → BREVO
   │      createReferralAttribution()  ← refCode validated HERE, i.e. too late
   │
   └─7 200 { success:true, verificationRequired:true }

   ──── later, only if the human clicks the link ────
   GET /api/auth/callback?token_hash=…&type=signup
       verifyOtp() → ensureUserProfile() → public.users INSERT
                     └─ welcome email dispatched here (correct ordering — when no refCode)
       dispatch 'user.verified' (in-app only)
```

### 1.2 Flow B — `requireEmailVerification = false`

`admin.createUser({email_confirm:true})` → `ensureUserProfile()` (always) → welcome email queued → `signInWithPassword()` → session cookies. One fully-confirmed, logged-in account and one welcome email per request, with no email round-trip at all. This is the flow the 2026-09-06 incident used. It is not the current default but is one admin toggle away.

### 1.3 Trust boundaries crossed

| Boundary | Untrusted input | Currently validated? |
|---|---|---|
| `POST /api/auth/signup` body | `name`, `email`, `password` | zod ✅ |
| `POST /api/auth/signup` body | `refCode` | ❌ shape only; drives a privileged side effect before validation |
| `prodily_referrer` cookie | `refCode` fallback | ❌ attacker-settable, same effect |
| `x-forwarded-for` header | rate-limit identity | ❌ leftmost entry trusted verbatim |
| `origin` header | `emailRedirectTo` base | ⚠️ used unvalidated in the callback URL |
| GoTrue → send-email hook | payload | ✅ HMAC / secret verified, fails closed in prod |
| Brevo/Resend webhooks | delivery events | ✅ signature verified |

---

## 2. Root causes

### RC-1 (CRITICAL) — The auth-email path has no quota, pause, flag or dedup gate at all

`app/api/auth/send-email-hook/route.ts:330` calls `sendEmail()` from `lib/email.ts` directly. Every protection built during P2–P14 lives in `enqueueNotificationItem()` / `processEmailQueue()` (`lib/notifications/queue/processor.ts`). The hook path shares none of them:

- `increment_daily_email_quota` — only called in `processEmailQueue`.
- `email_global_pause`, `email_automations` toggles — only in the queue.
- `EMAIL_ENABLED` / `QUEUE_PROCESSING_ENABLED` feature flags — only in the queue.
- `email_suppressions` — only in the queue.
- Duplicate prevention — only in the queue.

So the documented "~100 emails/day" ceiling has never applied to signup verification, password reset, email change, magic link or invite mail. Those are precisely the messages an unauthenticated attacker can trigger. **This is the mechanism by which the Brevo quota was exhausted today.**

Compounding it: even in the queue, the quota check fails open —

```ts
} catch (quotaErr) {
  console.warn('… Daily quota RPC check failed — proceeding without quota gate:', quotaErr)
}
```
(`processor.ts`, `quotaAvailable` stays `true`.)

### RC-2 (CRITICAL) — `refCode` forces a pre-verification welcome email

`app/api/auth/signup/route.ts`:

```ts
if (data?.user?.id && refCode) {
  await ensureUserProfile(supabase, data.user, { name })   // ← creates the row AND sends the welcome email
  await createReferralAttribution(supabase, { referrerCodeOrId: refCode, newUserId: data.user.id })
}
```

`ensureUserProfile()` (`lib/auth.ts:54`) always calls `dispatchWelcomeEmailIfNeeded()` after a successful insert. Consequences:

- Adding `?ref=x` to the signup URL (or setting the `prodily_referrer` cookie) turns **one** provider call into **two**, and makes the second one the actual "Welcome to Prodily!" message.
- The welcome email is delivered to an address that has **never proved it owns the inbox**. This is a mail-bombing primitive aimed at third parties, not just a quota problem.
- `refCode` is not checked for validity before the side effect, so `refCode: "a"` works as well as a real code.
- It also creates a behavioural split that is almost certainly unintended: without `refCode` no `public.users` row is created at signup at all, with `refCode` one is.

### RC-3 (CRITICAL) — Rate limiting is keyed only on values the attacker rotates

`IP_SIGNUP_LIMIT = 5 / 15 min`, `EMAIL_SIGNUP_LIMIT = 3 / 24 h` (canonicalized for Gmail `+` aliases only). Both keys are attacker-chosen:

- A new address per request → the email key is always fresh. Canonicalization covers `gmail.com`/`googlemail.com` `+tags` only; it does not strip Gmail dots (`j.o.h.n@gmail.com`), does not handle `outlook`/`proton`/`yahoo` sub-addressing, and does nothing for freshly registered throwaway domains.
- A proxy/VPN pool → the IP key is always fresh. With 5 per IP per 15 min, 200 IPs ≈ 1,000 sends/15 min.
- **There is no aggregate ceiling.** Nothing caps "total signups per hour, platform-wide," so N distinct identities cost N× nothing.

### RC-4 (HIGH) — `x-forwarded-for[0]` is client-controlled

```ts
request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
```
The leftmost entry is whatever the client sent. A single host can present an unlimited number of distinct "IPs" and reset the per-IP bucket on every request. On Vercel the trustworthy value is `x-vercel-forwarded-for` (or the rightmost hop), not `xff[0]`.

### RC-5 (HIGH) — The persistent limiter is neither atomic nor fail-closed

`lib/rate-limit.ts::evaluatePersistentRateLimit` does `SELECT … → UPDATE count = count + 1` as two round trips with no lock, no `WHERE count < limit`, and no `RETURNING` check. Concurrent requests all read the same `count` and all pass — a burst of 50 parallel requests from one IP can consume one slot. And:

```ts
} catch (err) {
  console.warn('[rate-limit] Persistent rate limit DB query failed, falling back to memory:', err)
  return evaluateInMemoryRateLimit(key, { limit, windowMs })
}
```
Any database hiccup degrades to a per-serverless-instance map, i.e. limit × instance-count. It fails **open** on the most security-relevant control in the signup path.

### RC-6 (HIGH) — Welcome-email dedup is best-effort, not durable

In `enqueueNotificationItem()`:

- The dedup query filters `status IN ('pending','processing','delivered')`. A previous welcome that ended `failed`, `retrying`, `dead_letter`, `skipped` or `suppressed` does not block a new one.
- It uses `.maybeSingle()`, which **errors when more than one row matches**; the surrounding `try/catch` then falls through to the insert. So the more duplicates already exist, the less the check works.
- `event_id` is regex-checked for UUID v1–v5 and the welcome event id is `welcome-<uuid>` — it fails the test and is stored as `NULL`, so it contributes nothing.
- `email_queue` has **no unique index** backing any of this. `20260823000001` added a partial unique index to `in_app_notifications` only; the equivalent was never added for `email_queue`.

The `dispatchWelcomeEmailIfNeeded` docstring claims "Idempotency key `welcome-${user.id}` guarantees exactly-once queueing." It does not — the key is never persisted or enforced for email.

### RC-7 (MEDIUM) — Repeat signup on a known-unconfirmed address re-sends mail

GoTrue re-sends the confirmation email for an existing *unconfirmed* user and returns an obfuscated user with `identities: []`. The route's `isExistingAccount` check runs **after** `signUp()` has already returned, i.e. after the email has already been sent, and then returns `409 USER_EXISTS`. An attacker who knows a target signed up but never confirmed can repeatedly re-trigger mail to that inbox, bounded only by GoTrue's own limiter and by our 3/24 h email key.

The 409 is also an account-enumeration oracle (`USER_EXISTS` vs. success) on an endpoint with no CAPTCHA.

### RC-8 (MEDIUM) — Provider failover converts quota exhaustion into double spend

`classifyProviderFailure()` maps 402/408/429 and all 5xx to `failover`. The header comment states containment "lives in the pre-dispatch daily quota gate … and in signup rate limiting." For the hook path neither exists (RC-1), so the design's stated precondition is not met: Brevo hitting its quota causes the same traffic to be replayed against Resend one message at a time.

### RC-9 (MEDIUM) — Other unauthenticated provider-call paths share the same gap

| Path | Auth | Rate limit | Quota gate |
|---|---|---|---|
| `POST /api/auth/signup` → hook | none | IP 5/15m + email 3/24h (bypassable) | ❌ |
| `POST /api/auth/resend-verification` → hook | none | **email 1/60s only — no IP limit, no daily cap** | ❌ |
| `resetPasswordForEmail()` from `app/(auth)/reset-password/page.tsx` | none — **called client-side with the anon key** | ❌ none of ours; GoTrue's only | ❌ |
| `POST /api/waitlist` → `sendWaitlistConfirmationEmail` | none | **in-memory per-instance IP map only**, no email key | ❌ |
| `POST /api/auth/login` → `ensureUserProfile` → welcome | none | ❌ **no rate limiting at all** | queue ✅ |
| `POST /api/contact` | none | (verify separately) | ❌ direct `sendEmail` |

`/api/auth/login` having zero throttling is an independent credential-stuffing exposure, and it is also a welcome-email trigger.

### RC-10 (LOW) — `isCritical` definitions disagree

`processor.ts` treats only `auth.verify_email` and `auth.password_reset` as critical (bypassing pause/quota/suppression). `EmailAutomationsService.isAutomationEnabled` also treats `auth.email_change_verify` as critical. A queued email-change confirmation is therefore subject to the daily quota and global pause while the other two are not — inconsistent, and it will strand email-change confirmations first during any quota event.

---

## 3. Answers to the specific questions asked

**2. Why can an email be sent when the user isn't registered in our database?**
Because "registered in our database" means a `public.users` row, and in Flow A that row is created either at verification-callback time or (only when `refCode` is present) at signup time — while the provider call happens *inside* `supabase.auth.signUp()`, before either. The send is a synchronous side effect of GoTrue account creation, wired to our hook, with no ordering relationship to any app-side commit and no compensating check.

**3. Every path capable of triggering a welcome-type email**

*Actual `auth.welcome` template:*

| # | Trigger | Reachable by |
|---|---|---|
| 1 | `ensureUserProfile()` → `user.registered` → `connector.auth.welcome` → `email_queue` — from `/api/auth/signup` Flow A **with `refCode`** | unauthenticated |
| 2 | same, from `/api/auth/signup` **Flow B** (always) | unauthenticated (when verification is off) |
| 3 | same, from `/api/auth/callback` after `verifyOtp` | unauthenticated (needs a valid token) |
| 4 | same, from `/api/auth/login` step 4, first successful login | unauthenticated endpoint, needs valid creds |
| 5 | send-email hook, `email_action_type: 'invite'` → `auth.welcome` | GoTrue (admin-initiated invite) |
| 6 | `POST /api/admin/emails/production-send` | admin |
| 7 | `POST /api/admin/notifications/broadcast` | admin |
| 8 | `POST /api/admin/emails/test-send`, `POST /api/dev/send-test-email` | admin |
| 9 | `processEmailQueue()` retry of an existing row — via `/api/cron/process-email-queue`, `/api/cron/retry-failed`, `/api/admin/emails/queue`, or the un-awaited inline flush in `enqueueNotificationItem` | cron secret / admin / implicit |

*Signup-triggered mail generally (what actually burned the quota):* the hook path — `auth.verify_email` (signup, magiclink, reauthentication, and the unknown-action-type default), `auth.password_reset`, `auth.email_change_verify`. All unqueued, all ungated.

**4. Protection audit**

| Control | Status | Weakness |
|---|---|---|
| Rate limiting | Partial | Non-atomic, fails open, keys rotatable, no aggregate cap, absent on `/login`, in-memory-only on `/waitlist` |
| IP-based controls | Weak | Spoofable `xff[0]`; no ASN/subnet aggregation; no proxy/VPN signal; no reputation |
| Email-based controls | Weak | 3/24h; Gmail `+` only — no dot-stripping, no other providers, no domain-level or MX-level control |
| CAPTCHA / bot protection | **Absent** | No Turnstile/hCaptcha/reCAPTCHA anywhere in the repo or env; no honeypot; no proof-of-work; no timing heuristic |
| Disposable / temp email | **Absent** | No blocklist, no MX check, no domain-age signal |
| Verification requirements | Present but bypassed | `requireEmailVerification` gates *login*, not *sending*. Welcome mail precedes verification whenever `refCode` is set |
| DB/account-creation ordering | **Inverted** | Provider call happens before the app-side durable write in the default flow |
| Email quota enforcement | Partial | Enforced only in the queue; fails open on RPC error; absent on the hook and direct paths |
| Duplicate signup handling | Partial | 409 returned *after* GoTrue already re-sent mail; also an enumeration oracle |
| Provider failover | Amplifying | 402/429 → failover, and its stated containment precondition is not met on the hook path |

**5. Bypass by rotation** — yes, trivially. Rotating `x-forwarded-for` alone defeats the IP key from a single host (RC-4). Rotating the local part of the address defeats the email key. Neither requires a botnet. Concurrency alone (RC-5) defeats both without any rotation.

**6. Can failed/aborted signups consume quota?** — Yes, and this is the core of today's incident. An attempt that ends in `409 USER_EXISTS`, one whose `ensureUserProfile` insert fails, one abandoned before the verification click, and one for a non-existent inbox all consume exactly the same provider call, because the send precedes every one of those outcomes. `sendEmail()` also does not count against the daily counter even when it succeeds, so the admin console understates real usage.

**7. Ordering** — Unsafe. Current order is `auth.users` insert → **send** → (maybe) `public.users` insert → (much later) verification. The send is not compensated on any downstream failure and is not idempotent.

**8. Should the welcome email precede verification?** — No. It contains no security-critical content, it is explicitly marked non-critical (`isCritical: false`) and admin-disableable, and sending it to an unproven address is what makes the endpoint a mail-bombing amplifier. It belongs strictly after `email_confirmed_at` is set.

**9. Duplicate-welcome vectors** — (a) the `.maybeSingle()` / status-filter dedup holes and the missing unique index (RC-6); (b) `refCode` signup queues a welcome, then the verification callback calls `ensureUserProfile` again — the `existing` short-circuit prevents a second dispatch only because the row is already there, so this is load-bearing on a read that has no locking; (c) the un-awaited `processEmailQueue(5)` inside `enqueueNotificationItem` racing the cron processor — mitigated by the `FOR UPDATE SKIP LOCKED` RPC, but the degraded non-atomic fallback claim path is used whenever the migration is missing; (d) a row that fails and later succeeds on retry after a partial provider accept.

---

## 4. Abuse scenarios

| # | Scenario | Cost to attacker | Cost to Prodily |
|---|---|---|---|
| A1 | Loop `POST /api/auth/signup` with a fresh random address + rotating `x-forwarded-for` | 1 HTTP request | 1 Brevo send + 1 `auth.users` row |
| A2 | As A1 with `refCode:"x"` | 1 HTTP request | 2 sends + `auth.users` + `public.users` + `email_queue` + in-app row |
| A3 | Parallel burst from one real IP, no rotation | trivial | limiter's read-modify-write race lets most through |
| A4 | Force DB pressure, then signup | moderate | limiter fails open to per-instance memory |
| A5 | Mail-bomb a victim: repeat signup on their known-unconfirmed address | 1 request per send | inbox flooded; our sender reputation degraded |
| A6 | Mail-bomb via A2 with the victim's address as `email` | 1 request | victim gets an unsolicited "Welcome to Prodily!" |
| A7 | Loop `resend-verification` across many addresses (no IP limit) | 1 request/address/60s | 1 send each |
| A8 | Loop client-side `resetPasswordForEmail` | 1 request | 1 send each, zero app-side limiting |
| A9 | Loop `/api/waitlist` across instances | 1 request | 1 send each, in-memory limiter only |
| A10 | Continue after Brevo 429 | none | traffic fails over onto Resend, exhausting provider #2 |
| A11 | Enumerate accounts via 409 vs 200 | 1 request each | user-list disclosure, no CAPTCHA to stop it |
| A12 | Credential-stuff `/api/auth/login` | unlimited | no rate limit at all; first success also fires a welcome email |

Bounce fallout is a second-order cost: 48% of sends bounced in the September 6 incident. Sustained bounce rates on Brevo/Resend put sender reputation and domain deliverability at risk, which harms **real** learners' verification and password-reset mail.

---

## 5. Recommended architecture

### 5.1 The governing principle

> **No provider call may originate outside a single, gated send path — and no non-critical email may be sent to an address that has not proved control of the inbox.**

Two invariants follow:

- **I1 — Single choke point.** Every send, including the auth hook, passes through one function that applies: kill switch → global pause → suppression → **budget reservation** → dedup → provider dispatch → reconciliation.
- **I2 — Trust ordering.** Verified inbox → durable `public.users` row → *then* welcome email. Never the reverse.

### 5.2 Layered defence

```
L0  Edge / platform          WAF + per-IP burst cap (Vercel Firewall or Cloudflare)
L1  Bot challenge            Cloudflare Turnstile, verified server-side, on /signup
                             + honeypot field + minimum form-fill time
L2  Input policy             email syntax → MX lookup → disposable-domain blocklist
                             → aggressive canonicalization (dots, +tags, multi-provider)
L3  Identity rate limits     atomic per-IP, per-/24 & per-ASN, per-canonical-email,
                             per-email-domain — all fail-CLOSED
L4  Global circuit breaker   platform-wide signups/hour and emails/hour ceilings;
                             trip → 503 + admin alert (this is the layer that makes
                             rotation economically useless)
L5  Provider budget          atomic reserve-before-send in ONE gated send path,
                             covering hook + queue + direct; per-provider daily caps
L6  Ordering & idempotency   welcome email only after email_confirmed_at,
                             behind a DB unique constraint
L7  Detect & respond         signup-velocity alerting, bounce-rate alerting,
                             auto-pause on threshold breach
```

Each layer answers a different rotation axis: L1 raises per-request cost (defeats scripted volume), L2 shrinks the identity space (defeats address rotation), L3 caps a single identity, L4 caps *all* identities in aggregate (defeats IP rotation, which is the axis L3 cannot cover), L5 makes provider spend impossible to exceed regardless of how anything above fails, and L6 removes the untrusted-send class entirely.

### 5.3 Recommended ordering

```
1. Turnstile token verified server-side          ─┐
2. Email policy: syntax, MX, disposable, canon    │ reject before any state is created
3. Atomic rate limits (IP/subnet/ASN/email/domain)│
4. Global signup + email circuit breaker          ─┘
5. auth.users creation (Supabase)
6. Verification email  ← reserve provider budget FIRST; critical class
7. ── user clicks link ──
8. verifyOtp  →  public.users INSERT   ← the durable commit
9. Welcome email enqueued, keyed on a unique idempotency constraint
10. Queue processor: pause/flag/suppression/budget → dispatch → reconcile
```

Steps 1–4 are pure rejection: no row, no token, no send. Step 6 is the only unauthenticated send, it is genuinely necessary, and it is budgeted. Step 9 is the first non-critical send and it happens strictly after proof of inbox control.

### 5.4 Recommended limits (starting values, tune from telemetry)

| Scope | Limit | Enforced at | Fail mode |
|---|---|---|---|
| Signup / IP | 3 per 15 min, 10 per 24 h | route, atomic RPC | closed |
| Signup / IPv4 `/24` (IPv6 `/48`) | 20 per hour | route | closed |
| Signup / canonical email | 2 per 24 h | route | closed |
| Signup / email domain (non-major) | 30 per hour | route | closed |
| **Signup / global** | **60 per hour, 400 per day** | route, before Supabase | closed → 503 |
| Resend-verification / email | 1 per 60 s, 5 per 24 h | route | closed |
| Resend-verification / IP | 5 per hour | route | closed |
| Password reset / email | 3 per hour | **new server route** | closed |
| Password reset / IP | 5 per hour | new server route | closed |
| Login / IP | 10 per 15 min | route | closed |
| Login / email | 5 per 15 min | route | closed |
| Waitlist / IP + email | 3 per hour / 1 per 24 h | route, persistent | closed |
| **Provider budget / day** | admin `email_daily_send_limit` | **unified send gate** | closed |
| Provider budget / hour | ~15% of daily | unified send gate | closed |
| Critical-auth reserve | 30% of daily, non-critical cannot touch it | unified send gate | closed |

The critical-auth reserve matters: without it, a welcome-email flood starves real learners' password resets.

### 5.5 CAPTCHA — warranted

Yes, and it is now the single highest-leverage addition. Rate limiting cannot defeat IP rotation; a bot challenge attacks the axis rate limiting cannot. **Cloudflare Turnstile** is the right pick: free at this volume, privacy-preserving, invisible for most users, and it fits the existing CSP with one `script-src` and one `connect-src` entry. Verify the token server-side against `https://challenges.cloudflare.com/turnstile/v0/siteverify` in the signup route **before** step 3, bind the token to the client IP, and treat tokens as single-use (they are one-shot server-side already). Gate it behind a `TURNSTILE_ENABLED` feature flag so it can be disabled instantly if it misfires.

Apply to: `/signup` (required), `/reset-password` and `/resend-verification` (required — both are ungated send paths), `/login` (progressive: only after N failures from an IP), `/waitlist` (required), `/contact` (required).

Do **not** put Turnstile on `/api/auth/callback` — that would break verification links.

### 5.6 Disposable-email controls — warranted, with care

Warranted, but as a *scoring* input rather than a hard wall, and enforced server-side in the signup route only (never client-side). Layers:

1. **Canonicalize** — lowercase; strip `+tag` for Gmail/Outlook/Proton/Yahoo/iCloud; strip dots for Gmail only; store `email_canonical` for limit keying.
2. **MX check** — reject domains with no MX record (cached, with a short timeout and a fail-open path so a DNS blip doesn't block signups). Cheap and catches most typo/garbage domains.
3. **Disposable blocklist** — a maintained list (`disposable-email-domains`) in a DB table so admins can edit it without a deploy. Reject with a clear, non-enumerating message.
4. **Role-address handling** — flag `admin@`, `postmaster@`, `abuse@`, `noreply@` for review rather than auto-rejecting.
5. **Never** hard-block an entire mainstream provider.

This would not have stopped the September 6 incident (real Gmail) and will not stop a determined attacker today, but it removes the cheapest bulk-identity source and it is a prerequisite for domain-level rate limiting to mean anything.

### 5.7 How to guarantee no email for a failed/unregistered signup

1. **Move the welcome email behind verification.** Delete the `refCode` branch's `ensureUserProfile` call; do referral attribution in the callback after `verifyOtp`, storing the pending `refCode` in `auth.users.user_metadata` at signup. Then `ensureUserProfile` runs in exactly two places — the verification callback and login — both of which imply a proven inbox.
2. **Split the dispatch from the profile write.** Have `ensureUserProfile()` *return* whether it created the row; let callers decide about the welcome email. A profile insert is not by itself proof of verification, and today it is treated as if it were.
3. **Gate the welcome dispatch on `user.email_confirmed_at != null`** as a defence-in-depth assertion inside `dispatchWelcomeEmailIfNeeded`, so any future caller cannot reintroduce the bug.
4. **Route the hook through the unified send gate** so even the verification email is budgeted and can be paused.
5. **Reserve budget before the provider call, reconcile after**, so an aborted or failed send returns its reservation and a successful one is always counted.

### 5.8 Preventing duplicate welcome emails

- Add a **partial unique index** on `email_queue (user_id)` where `template_key = 'auth.welcome'` — a database constraint, not a query. The insert path already handles `23505`.
- Better: add an explicit `idempotency_key text` column to `email_queue` with a unique index, mirroring what `in_app_notifications` already has (`20260823000001`), and set it to `welcome-<user_id>` — making the existing docstring true.
- Add a `users.welcome_email_sent_at timestamptz` column and set it in the same statement that claims the send, so the guarantee survives queue-row cleanup.
- Fix the dedup query: drop `.maybeSingle()` in favour of `.limit(1)`, and stop filtering by status for one-shot lifecycle templates.

### 5.9 Interaction with existing subsystems

**Email queue** — unchanged as the transport for non-critical mail. The new unified gate wraps `sendEmail()` and is called by both `processEmailQueue` and the hook, so the queue's existing checks become the *second* layer rather than the only one. No change to `claim_email_queue_items`.

**Quota gate** — promote `increment_daily_email_quota` into `reserve_email_budget(p_limit, p_class)` with a reserve/commit/release shape, a per-class reserve for critical auth mail, and a **fail-closed** catch (the current `catch → proceed` must invert). Keep the same `system_settings` key so the admin console and `EmailAutomationsService.getState()` keep working.

**Provider failover** (ADR-001/002) — keep the classification as is; the policy is right *once its stated precondition holds*. Add one rule: when the primary fails with 402/429 (capacity), fail over **only if the global budget still has room**, so failover can never exceed the platform ceiling. Record `failover_used` per day so the admin console can show provider #2 being drained.

**Feature flags** — add `TURNSTILE_ENABLED`, `DISPOSABLE_EMAIL_BLOCKING_ENABLED`, `SIGNUP_CIRCUIT_BREAKER_ENABLED`, `AUTH_EMAIL_BUDGET_ENABLED`, each defaulting to the safe value and readable via `isEnabledAsync` so an admin can disable a misfiring control without a deploy. Note the existing flag service falls back to `DEFAULT_FEATURE_FLAGS` on DB failure — so defaults must be the *safe* setting, not the permissive one.

**Settings service** — surface the new limits under `product`/`email` settings so they are tunable from the admin console (per ADR-003), with hardcoded floors so a bad admin value can't disable protection.

**Error taxonomy / observability** (ADR-004) — new incident kinds: `abuse.signup_burst`, `abuse.circuit_breaker_tripped`, `email.budget_exhausted`, `email.untrusted_send_blocked`. Mask recipients through the existing redaction helpers (ADR-005).

**API error contract** (ADR-006) — new codes `CAPTCHA_REQUIRED`, `CAPTCHA_FAILED`, `EMAIL_DOMAIN_NOT_ALLOWED`, `SIGNUP_TEMPORARILY_UNAVAILABLE`. Make the duplicate-account response **non-enumerating**: return the same generic "check your email" body for both new and existing addresses.

### 5.10 Database changes

```sql
-- 1. Atomic, fail-closed rate limiting (replaces the read-modify-write in lib/rate-limit.ts)
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text, p_limit int, p_window_ms bigint
) RETURNS TABLE (allowed boolean, remaining int, reset_in_ms bigint) ...
-- single INSERT … ON CONFLICT DO UPDATE … WHERE count < limit … RETURNING

-- 2. Email budget with reserve / commit / release
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_idempotency
  ON public.email_queue (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_welcome_once
  ON public.email_queue (user_id) WHERE template_key = 'auth.welcome';
CREATE OR REPLACE FUNCTION public.reserve_email_budget(p_limit int, p_class text) RETURNS boolean ...
CREATE OR REPLACE FUNCTION public.release_email_budget(p_class text) RETURNS void ...

-- 3. Welcome-email durability independent of queue retention
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_canonical text;
CREATE INDEX IF NOT EXISTS users_email_canonical_idx ON public.users (email_canonical);

-- 4. Admin-editable domain policy
CREATE TABLE IF NOT EXISTS public.email_domain_policy (
  domain text PRIMARY KEY,
  policy text NOT NULL CHECK (policy IN ('block','allow','flag')),
  reason text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_domain_policy ENABLE ROW LEVEL SECURITY;  -- service role only

-- 5. Forensics for the next incident
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text NOT NULL,            -- HMAC, not raw IP (PII minimization)
  email_domain text,                -- domain only, never the local part
  email_canonical_hash text,
  outcome text NOT NULL,            -- accepted | rate_limited | captcha_failed |
                                    -- domain_blocked | circuit_open | duplicate | error
  captcha_passed boolean,
  user_agent_hash text
);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_created ON public.signup_attempts (created_at DESC);

-- 6. public.rate_limits has RLS enabled but zero policies (service-role only today, which is
--    correct). Make that explicit and documented rather than incidental.
```

Note that `public.rate_limits` currently has no cleanup job; add a retention sweep to the existing cron so it doesn't grow unbounded under attack.

### 5.11 Tests to add (none of the existing tests should be modified)

**Signup abuse — `lib/__tests__/signup-abuse-prevention.test.ts`**
- rejects when the Turnstile token is missing/invalid/replayed, before any Supabase call
- passes with a valid token
- `x-forwarded-for` spoofing: 100 requests with 100 different `xff` values still hit the trusted-IP limit
- rotating email local parts hits the domain and global limits
- Gmail dot/`+`/mixed-case variants collapse to one canonical key
- disposable domain rejected; MX-less domain rejected; MX lookup timeout fails open without sending
- global circuit breaker trips at the ceiling and returns 503
- rate-limit DB failure **fails closed** (the inversion of current behaviour — assert the new contract explicitly)
- `refCode` present → **no** welcome email dispatched and **no** `public.users` row created at signup
- duplicate signup returns the same non-enumerating body as a new signup

**Welcome-email trust — `lib/__tests__/welcome-email-trust-boundary.test.ts`**
- `dispatchWelcomeEmailIfNeeded` is a no-op when `email_confirmed_at` is null
- `/api/auth/callback` after a successful `verifyOtp` dispatches exactly once
- two concurrent `ensureUserProfile` calls for the same user produce exactly one queue row (unique index)
- a `failed`/`dead_letter`/`skipped` prior welcome row does not permit a second one
- `welcome_email_sent_at` set → no re-dispatch even with the queue row deleted

**Unified send gate — `lib/__tests__/email-send-gate.test.ts`**
- the send-email hook consumes budget; at the ceiling it returns 429 and does **not** call the provider
- critical auth mail still sends when the non-critical budget is exhausted (reserve honoured)
- budget RPC failure **blocks** the send (fail-closed) and raises an incident
- reservation released when the provider call throws
- failover suppressed when the global budget is exhausted
- `/api/waitlist` and `/api/contact` sends pass through the gate

**Rate limiter — `lib/__tests__/rate-limit-atomicity.test.ts`**
- 50 concurrent `consume_rate_limit` calls against limit 5 → exactly 5 allowed
- window boundary behaviour; independent keys don't interfere
- DB unavailable → denied, not silently allowed

**Login/reset/resend — `lib/__tests__/auth-endpoint-throttling.test.ts`**
- `/api/auth/login` enforces IP and email limits (currently none exist)
- server-side password-reset route enforces limits and returns a uniform non-enumerating response
- `/api/auth/resend-verification` enforces the new IP limit in addition to the email limit

**E2E (`e2e/`)** — a real user completes signup → verification → dashboard with Turnstile in test mode, receiving exactly one verification email and exactly one welcome email, in that order.

### 5.12 Existing code to remove or change

| File | Change |
|---|---|
| `app/api/auth/signup/route.ts` | Remove the `refCode`-triggered `ensureUserProfile` call (RC-2). Add Turnstile, email policy, atomic limits, circuit breaker. Replace `getClientIp` with a trusted-header resolver. Make the duplicate response non-enumerating. Stash `refCode` in `user_metadata` instead. |
| `lib/auth.ts` | `dispatchWelcomeEmailIfNeeded`: add the `email_confirmed_at` guard; set `welcome_email_sent_at`; correct the false "guarantees exactly-once" docstring. `ensureUserProfile`: return `{profile, created}` and stop implicitly emailing. |
| `lib/rate-limit.ts` | Replace the read-modify-write with the atomic RPC. **Invert the catch to fail closed.** Keep the test-env in-memory guard. |
| `lib/email.ts` | `sendEmail()` becomes private; all callers go through the new gated `sendGovernedEmail()`. |
| `app/api/auth/send-email-hook/route.ts` | Route through the gate; return 429 when budget is exhausted so GoTrue backs off. |
| `lib/notifications/queue/processor.ts` | Quota check **fails closed**. Align `isCritical` with `EmailAutomationsService` (add `auth.email_change_verify`). Fix the dedup query (`.limit(1)`, drop the status filter for one-shot templates). Reconsider the un-awaited inline `processEmailQueue(5)` flush. |
| `app/(auth)/reset-password/page.tsx` | Stop calling `resetPasswordForEmail` client-side; move to a rate-limited, CAPTCHA-gated server route. |
| `app/api/auth/resend-verification/route.ts` | Add IP limit + daily cap + CAPTCHA. |
| `app/api/auth/login/route.ts` | Add IP and email rate limiting (currently zero). |
| `app/api/waitlist/route.ts` | Replace the in-memory map with the persistent atomic limiter; add an email key; route the send through the gate. |
| `app/api/contact/route.ts` | Same treatment (verify its current limiter separately). |
| `lib/notifications/providers/failure-classification.ts` | Keep classification; update the header comment once the precondition is actually true, and add the budget check at the failover call site. |
| `supabase/migrations/` | New migration per §5.10. |

---

## 6. Prioritised plan

### CRITICAL — stop the bleeding (deploy first, in this order)

| # | Fix | Addresses | Why here |
|---|---|---|---|
| C1 | Keep `allowSignups = false` until C2–C6 ship | all | The only control currently holding |
| C2 | Route the send-email hook through a budget-gated send path; **fail closed** | RC-1 | The single change that would have prevented today's quota exhaustion |
| C3 | Remove the `refCode` → `ensureUserProfile` branch; gate welcome dispatch on `email_confirmed_at` | RC-2 | Eliminates the untrusted-welcome class outright |
| C4 | Atomic, fail-closed `consume_rate_limit` RPC | RC-5 | Every other limit is built on this; it must actually hold |
| C5 | Trusted client-IP resolution | RC-4 | Without it C4's per-IP key is decorative |
| C6 | Global signup + email circuit breaker | RC-3 | The only layer that survives IP rotation; hard cap on worst-case spend |

C2 and C3 are independent and can land in parallel. C4 must land before C5/C6 depend on it.

### HIGH — make it hold under a determined attacker

| # | Fix | Addresses |
|---|---|---|
| H1 | Cloudflare Turnstile on signup, reset, resend, waitlist, contact (flagged) | RC-3 |
| H2 | `email_queue` idempotency unique index + `users.welcome_email_sent_at` | RC-6 |
| H3 | Rate limits on `/api/auth/login` | RC-9 |
| H4 | Server-side password-reset route replacing the client-side call | RC-9 |
| H5 | IP limit + daily cap on `resend-verification` | RC-9 |
| H6 | Budget-aware failover (no failover past the global ceiling) | RC-8 |
| H7 | Non-enumerating duplicate-signup response | RC-7 |
| H8 | `signup_attempts` telemetry + velocity/bounce-rate alerting + auto-pause | detection |
| H9 | Persistent atomic limiter on `/api/waitlist` | RC-9 |

### OPTIONAL — hardening

| # | Fix |
|---|---|
| O1 | Disposable-domain blocklist + MX validation + `email_domain_policy` table |
| O2 | Extended canonicalization (Gmail dots, Outlook/Proton/Yahoo sub-addressing) |
| O3 | Subnet (`/24`, `/48`) and ASN-level aggregation |
| O4 | Progressive friction: delay/challenge escalation instead of a hard 429 |
| O5 | Reserve a share of daily budget exclusively for critical auth mail |
| O6 | Align the `isCritical` definitions (RC-10) |
| O7 | Admin "abuse dashboard": signup velocity, block reasons, budget burn-down |
| O8 | `rate_limits` retention sweep in the existing cron |
| O9 | Suppression-list the five Gmail identities from the September incident |
| O10 | Tighten CSP (drop `'unsafe-eval'`; `connect-src https:` is very broad) — unrelated to this incident but adjacent |

---

## 7. Recommended implementation sequence

**Phase 1 — Contain (deploy behind `allowSignups = false`).** C2 + C3. These are the two root causes of "an email was sent for a signup that isn't real." C2 makes every send accountable to a budget; C3 makes the welcome email conditional on proof of inbox control. They are small, self-contained, and verifiable in isolation — which is exactly what you want in the first deploy after an incident. **Why first:** they cap worst-case damage even if every other layer is bypassed. A control that fails open is worse than no control, so the fail-closed inversion belongs here rather than in a later cleanup.

**Phase 2 — Make the limits real.** C4 + C5 + C6. C4 first, because C5 and C6 are keys and ceilings evaluated *by* it — building them on a racy, fail-open primitive would give false confidence. C5 next, since a spoofable identity makes the per-IP key meaningless. C6 last in the phase because it is the backstop that holds when C4 and C5 are both circumvented: an aggregate ceiling is the only limit an attacker cannot rotate around. **Why this order:** each step is worthless without the one before it.

**Phase 3 — Raise attacker cost.** H1 (Turnstile) plus H3–H5, H9 to close the sibling endpoints. Turnstile is deliberately *after* the server-side limits: a client-side challenge is a cost multiplier, not a boundary, and shipping it first would tempt the team to treat it as the fix. Closing the sibling endpoints matters because an attacker denied at `/signup` will simply move to `resend-verification` or the client-side password reset, both of which reach the same provider. **Why here:** this is the phase that reopens signups safely.

**Phase 4 — Correctness and durability.** H2 (idempotency constraints), H6 (budget-aware failover), H7 (non-enumerating responses), O5, O6. These prevent the *next* class of problem — duplicate sends, provider-#2 drain, enumeration — rather than the one that just happened. They involve schema changes and are better done deliberately than under incident pressure. **Why not earlier:** none of them reduce blast radius today, and H2's unique indexes need the Phase 1 ordering change already in place or they will fire on legitimate pre-verification rows.

**Phase 5 — See it coming.** H8 plus O7, O8. Detection follows prevention because you must first know what "normal" looks like with the new controls in place; alert thresholds calibrated against attack traffic would be wrong. **Why last of the required work:** the September incident ran for 25 hours before anyone noticed, and today's repeat suggests the detection gap, not just the control gap, is what allowed a second occurrence.

**Phase 6 — Optional hardening.** O1–O4, O9, O10, as capacity allows. Disposable-email controls sit here deliberately: they would not have stopped either incident (both used real Gmail), they carry real false-positive risk against legitimate users, and their main value is making the domain-level limits from Phase 2 meaningful. They are a refinement, not a defence.

**Reopening signups** is safe at the end of Phase 3, once C2–C6 and H1 are verified in production. Verify with: a scripted burst against staging with rotating `xff` and rotating addresses (expect the global breaker to trip and provider calls to stop), a Turnstile-less request (expect `CAPTCHA_REQUIRED`), and a signup that is never verified (expect exactly one email, no `public.users` row, no welcome).

---

## 8. Rollout and migration considerations

- **Order:** database migration → app deploy → flags enabled one at a time. Every new control ships behind a flag defaulting to the safe value, so a misfire is a toggle rather than a rollback. Note that `FeatureFlagService` falls back to `DEFAULT_FEATURE_FLAGS` when the database is unreachable — the compiled defaults must therefore be the *protective* setting.
- **Backfill:** populate `users.email_canonical` and set `welcome_email_sent_at` for existing users who already received a welcome (derivable from `email_queue` where `template_key='auth.welcome' AND status='delivered'`) **before** adding the unique indexes, or the indexes will fail or suppress legitimate first sends.
- **Unique-index safety:** create the `email_queue` welcome index `CONCURRENTLY` and check for existing duplicates first — the September incident's rows may still be present.
- **Turnstile rollout:** ship the server-side verification in permissive mode first (verify and log, don't reject), watch the pass rate for a day, then enforce. Have a documented kill switch.
- **Budget cutover:** the daily counter currently counts only queued sends. Once the hook is included, observed usage will jump — raise `email_daily_send_limit` to reflect true volume before enabling the gate, or legitimate verification mail will be blocked on day one. Measure first, enforce second.
- **Backwards compatibility:** existing verification links must keep working through the change; `/api/auth/callback` is unchanged by this plan. Users mid-signup during the C3 deploy will simply not receive a welcome email until they verify — acceptable.
- **Reversibility:** every step is a flag flip or a `DROP INDEX` except the `refCode` behaviour change, which is a small, reviewable diff.
- **Sender reputation:** after two bounce-heavy incidents, warm Brevo/Resend volume back up gradually and monitor bounce rate rather than resuming at full volume.

---

## 9. Limits of this investigation

- Read-only static analysis of the branch. Production `system_settings` values were not read, so which of Flow A or Flow B was live during today's attack is not confirmed here. **Both** flows are covered by the fixes above.
- The exact subject line of the emails that exhausted the quota was not verified against Brevo logs. Two distinct mechanisms produce the reported symptom — the hook-path verification email (no `public.users` row, RC-1) and the `refCode` welcome email (row exists, but unverified, RC-2). Disambiguate with:

```sql
-- how many auth.users have no matching public.users row?
select count(*) from auth.users a
  left join public.users u on u.id = a.id
 where u.id is null and a.created_at > now() - interval '48 hours';

-- did any welcome emails go to unverified addresses?
select q.to_email, q.created_at, a.email_confirmed_at
  from public.email_queue q join auth.users a on a.id = q.user_id
 where q.template_key = 'auth.welcome' and a.email_confirmed_at is null
 order by q.created_at desc;
```

  Both queries should return zero after Phase 1.
- No load or penetration testing was performed; the bypasses described are derived from code reading and should be confirmed against staging.
