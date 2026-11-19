# Security Threat Model & Access Control: Prodily

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026  

---

## 1. Role-Based Access Control (RBAC) Architecture

Access to administrative features and Route Handlers (`/admin`, `/api/admin/*`) is governed by:

1. **Proxy Middleware Protection (`apps/web/proxy.ts`)**: Intercepts requests to `/admin` routes and checks the authenticated Supabase JWT session. As a fast path, it also trusts a `user.app_metadata?.is_admin` JWT claim before falling back to the database check.
2. **`lib/admin/guard.ts`, the actual per-request enforcement layer**: `requireAdminUser()` (used by every `/api/admin/**` route handler) and `logAdminAction()`, with per-request result caching via a `WeakMap`.
   - **Database Role Check (the only rule)**: access is granted only when `users.is_admin === true` in PostgreSQL, read with the service-role client. `lib/admin/authorization.ts` exposes the same rule as `isAdminUser()` for the console layout.
   - **No email allowlist**: the `ADMIN_EMAILS` environment variable is no longer read anywhere. The verified auth email is still recorded in audit logs, but it never grants access.
   - **Changing admin status**: only the service role or `postgres` can change `users.is_admin` (the `guard_privileged_user_columns` trigger rejects `authenticated` and `anon`). Grant or remove access from the admin console. The one-time migration from the old env list is the owner-run snippet `supabase/migrations/pending-approval/admin_backfill_from_admin_emails.sql`.
   - **Admin deletion**: `DELETE /api/admin/users/[id]` returns 403 for any account with `is_admin = true`. An admin must be demoted before the account can be deleted.

---

## 2. Row Level Security (RLS) Policies

All user-owned database tables enforce strict RLS policies:

- `users`: Users can read any profile; users can update only their own profile row (`auth.uid() = id`).
- `user_lesson_progress`: Users can read and write only their own progress (`auth.uid() = user_id`).
- `xp_events`: Users can read their own XP events; insert permitted for authenticated user (`auth.uid() = user_id`). Direct updates or deletes are DENIED.
- `in_app_notifications`: Users can read and update only their own notifications (`auth.uid() = user_id`).
- `system_errors` & `admin_audit_logs`: Read and write permitted ONLY to service-role clients. Client users have 0 access.

---

## 3. Webhook & API Authentication Security

1. **Supabase Auth Hook (`/api/auth/send-email-hook`)**:
   - Verifies requests using Standard Webhooks (Svix) HMAC-SHA256 signatures (`webhook-signature` or `svix-signature`) over `${webhook-id}.${webhook-timestamp}.${body}` using `SEND_EMAIL_HOOK_SECRET`.
   - Enforces a 5-minute (300 second) maximum timestamp drift to prevent replay attacks.
   - Bearer token and custom header bypasses have been removed (SEC-16).
2. **Email provider webhooks (`/api/email/webhooks`)** — this single route handles **two** distinct providers with two distinct verification mechanisms:
   - **Resend**: Svix HMAC-SHA256 signature verification via `RESEND_WEBHOOK_SECRET` (`verifySvixSignature()`).
   - **Brevo**: a plain shared-secret header compare (`x-brevo-webhook-secret` / `x-webhook-secret`) against `BREVO_WEBHOOK_SECRET`: not HMAC-based.
   - Both reject unsigned/mismatched payloads with HTTP 401.
3. **Cron Endpoints (`/api/cron/*`)**:
   - Enforces Bearer token authentication matching `CRON_SECRET`.
   - Rejects unauthorized calls with HTTP 401 and logs a warning with `logSystemError()`.

### CSRF / Same-Origin Write Check (SEC-12)

Cookie-authenticated mutating endpoints (POST, PUT, PATCH, DELETE) across `/api/*` enforce same-origin verification in `apps/web/proxy.ts` (SEC-12). Requests carrying session cookies must supply `Sec-Fetch-Site: same-origin` or a valid `Origin` header matching `BRAND.siteUrl` or the request host. Non-matching cross-origin requests are rejected with HTTP 403 Forbidden. Server-to-server endpoints (`api/auth/send-email-hook`, `api/email/webhooks`, `api/email/unsubscribe`, `api/cron/*`) are exempt.

---

## 3a. Signup Abuse Controls (added 2026-09-07)

`POST /api/auth/signup` previously had **no rate limiting of any kind**, which allowed ~1,233 automated accounts to be created in ~25 hours (see `docs/archive/INCIDENT_2026-09-06_SIGNUP_ABUSE.md`, deleted in `1dbd2a4`; read it with `git show 1dbd2a4^:docs/archive/INCIDENT_2026-09-06_SIGNUP_ABUSE.md`). It now enforces, via the persistent cross-instance rate limiter (`lib/rate-limit.ts`):
- **5 signups / 15 minutes** per client IP (`x-forwarded-for` / `x-real-ip`).
- **3 signups / 24 hours** per canonicalized email — Gmail `local+tag@gmail.com` addresses collapse to `local@gmail.com` before the check, closing the specific alias-abuse pattern seen in the incident.

No CAPTCHA/bot-challenge provider is configured anywhere in the codebase today. If signup abuse resumes after the above limits, that is the next control to add.

---

## 3b. Google Sign-In (OAuth) Controls (added 2026-10-20)

Google sign-in is behind `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` (off by default; `GET /api/auth/google` returns 404 while off). Setup and rollout are in [`DEPLOYMENT.md`](DEPLOYMENT.md) §5.

- **PKCE, server side.** `GET /api/auth/google` starts a PKCE flow with a dedicated Supabase client (`lib/auth/oauth-pkce.ts`). The code verifier never reaches browser JavaScript: it is stored in the `prodily_oauth_pkce` cookie (httpOnly, `SameSite=Lax`, `Secure` in production, `path=/api/auth`, 10 minutes). The callback reads it back for the code exchange. A missing verifier fails the sign-in; there is no verifier-less fallback.
- **Signed intent.** Consent ticks, referral code and the `next` path travel in `prodily_oauth_intent`, a JSON payload signed with HMAC-SHA256 under `OAUTH_STATE_SECRET` (server only, 32+ chars) and compared with `timingSafeEqual` (`lib/auth/oauth-intent.ts`). Same cookie options as the verifier. The callback rejects a bad signature, an expired or future `iat`, and an off-origin `next` (`sanitizeNextPath`). If the secret is missing while the flag is on, the start route fails closed with `/login?error=oauth_unavailable`. Both cookies are cleared on every callback exit. Neither uses the `sb-` prefix, which stays reserved for the session cookies (B13-A).
- **Abuse gates.** The start route is rate limited per client IP (persistent limiter, fail closed) and redirects to `/login?error=oauth_rate_limited` instead of returning JSON. New Google accounts are held to the same rules as email signup: the admin `allowSignups` switch and the `signup_global` aggregate limit. A new account that hits either is deleted (only while its profile row is still missing; otherwise all its sessions are revoked) and sent to `/login?error=signups_closed` or `signup_limited`. Turnstile does not apply, because Google has already verified the person and the email address.
- **Consent gate.** Consent is only ever recorded server side with `buildConsentRecord()`. A Google account created without both acknowledgements (for example from the login page) is held by `proxy.ts` on `/signup/complete-consent`: app pages redirect there and learner APIs return 403 `CONSENT_REQUIRED`. Only accounts with `auth_provider = 'google'` and no `terms_accepted_at` are gated; legacy password accounts with no recorded consent are never gated. `POST /api/auth/complete-consent` (learner actor, rate limited) accepts or declines. Decline deletes the account only when it is a fresh, unused Google-only account (created in the last 30 minutes, every identity is Google, no recorded consent, no learning activity); otherwise it only signs out. Session cookies are cleared either way.
- **Existing accounts.** A Google sign-in that matches an existing account never changes its consent record or provider. Settings refuses password-based changes for Google-only accounts with 400 `PASSWORD_NOT_SET` instead of a misleading wrong-password error.
- **CSP.** No change: the flow is plain top-level navigation, and `form-action` / `navigate-to` are not set.
- **Consent from the button only counts on a same-origin navigation.** `terms=1&age=1` on the start route is trusted only when `Sec-Fetch-Site` is `same-origin` (or, without that header, the Referer is the site's own `/signup`). A crafted third-party link produces an intent without consent, so the user confirms on the gate.
- **Admins cannot use Google.** An `is_admin` account that signs in with Google is signed out and sent to `/login?error=oauth_admin_blocked`.
- **Pre-account takeover defence.** Email verification is permanently OFF for password signup (owner decision), so a password account may have been created by someone who does not own the address. When Supabase links a Google identity into an existing password account (link less than 10 minutes old, account older than the link), the first Google sign-in: rotates the password to a random value and sets `app_metadata.password_set = false`; signs out every other session; and posts a critical in-app security notification. The real owner keeps access through Google; to use a password again they use Forgot password. Each step is logged with the user id only and the sign-in continues if a step fails. Follow-up: send this notice as an email as well (today it is in-app only, and is skipped if in-app notifications are switched off).
- **Learners cannot edit provider or consent columns.** Migration `20261020000001` extends `guard_privileged_user_columns` so `auth_provider` and the consent columns can only be written by the service role.

---

## 4. Secret Safety & Environment Handling

- **Server-Only Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `CRON_SECRET`, `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET` are strictly server-side.
- **Client Expose Prevention**: Never import service-role client into client components (`'use client'`).
- **Secret Sanitization**: `lib/monitoring/redaction.ts` is the single redaction implementation, applied to logged messages, to `details` payloads recursively, to queue template variables before they reach `notification_events` (the `email_dead_letter` table was dropped by `20261031000001`), and to the outgoing message of `apiError()`. It redacts by value shape (provider keys `xkeysib-`/`xsmtpsib-`/`re_`, `whsec_` and Svix signatures, JWTs, database connection credentials, `Authorization` and cookie headers, session tokens, one-time auth tokens in URLs, passwords) **and** by key name for structured payloads. Email addresses are masked rather than dropped so the recipient domain stays diagnosable. See [ADR-005](decisions/ADR-005-sensitive-data-redaction.md). Admin API responses use `adminErrorMessage()`, which sanitizes rather than genericizes: the operator keeps the diagnostic text, credentials and connection strings do not survive.

---

## 4a. Constant-Time Secret Comparison

`lib/security/constant-time.ts` is the single implementation used everywhere a
caller-supplied shared secret is compared against one this system holds:

- `resolveActor()` — the `CRON_SECRET` bearer token on the six cron routes.
- `/api/auth/send-email-hook` — the `SEND_EMAIL_HOOK_SECRET` on its header and
  query-parameter branches.

Both sides are hashed to SHA-256 before `timingSafeEqual`. That is not decoration:
`timingSafeEqual` throws when the buffers differ in length, and the obvious guard —
comparing lengths first — leaks the secret's length through both timing and the
early return. Fixed-width digests remove the length channel entirely.
`secretMatchesAny()` evaluates every candidate without short-circuiting, so the work
done does not reveal which accepted spelling of the secret matched.

HMAC signature verification is a different problem and keeps its own path: the
Supabase auth hook and `/api/email/webhooks` compare signatures with
`timingSafeEqual` guarded by a length check, which is correct there because a
signature's length is fixed by its encoding and is not secret.

**F-SEC-12 is closed.** The auth hook's remaining acceptance paths — `Authorization:
Bearer`, three custom headers, and the standardwebhooks HMAC signature — all compare
in constant time, and the query-parameter path is **removed**. The route no longer
reads `nextUrl.searchParams` at all, so no secret can travel in a URL to this
endpoint.

Removal was gated on confirming production did not depend on it. A human verified
the Supabase Send Email Hook configuration on 2026-09-14: the configured secret is
in the standard `v1,whsec_...` form, which authenticates by HMAC over the raw
request body. Post-deploy verification of email delivery is still outstanding — see
ISSUE-27.

---

## 4b. Profile URL Validation (N-2)

Two functions, deliberately separate, because they answer different questions:

| Function | Question | Accepts |
|---|---|---|
| `validateOptionalUrl` | is this **stored** value safe to render as a link? | `http:`, `https:` |
| `validateWritableUrl` | may we accept this as **new input**? | `https:` only |

`validateOptionalUrl` guards the public portfolio and the JSON-LD against
`javascript:` and `data:` URLs. It must keep accepting `http:`: tightening it
would have silently un-rendered the links of every learner who saved an `http://`
address before B7-F. Validation is write-side only.

`validateWritableUrl` is where the locked plan's https-only allowlist lives. Both
write paths use it — the `app/api/settings/profile` schema and
`updatePortfolioSettings()`.

**Learner-fixable rejections are typed.** `PortfolioValidationError` separates a
message the learner should see (taken username, non-https URL, a capstone that is
not theirs) from a genuine fault. The route answers 400 with the former and
rethrows the latter into `withRoute`, which genericises it. Before B7-F both
returned `error.message`, which is how a driver error carrying a connection string
could have reached an authenticated learner (N-3).

---

## 4c. Security Event Recording (daily security summary, added 2026-11-19)

Refusal and failure paths count themselves in `public.security_event_counts` through
`recordSecurityEvent()` in `apps/web/lib/security/security-events.ts`, which calls the
`record_security_event` RPC with the service role. The admin console (separate repository)
reads the counts and writes one rule-based summary per day to `public.security_digests`. No AI
is involved. Both tables come from the held migration
`supabase/migrations/pending-approval/20261119000007_security_events.sql`.

What is stored: one row per IST calendar day, event type, app, IP bucket and subject, with a
count, first and last time seen, and one sample path. The subject (email or user id) is stored
as the first 16 hex characters of its sha256 plus a masked hint for emails (`j***@gmail.com`).
The IP is reduced to its network (`/24` for IPv4, `/48` for IPv6). Paths lose their query
string. A day stops taking new keys at 50000 rows; existing keys keep counting.

Behaviour: the call never throws and never delays the response (`after()` inside a request,
a detached promise outside one). Until the migration is applied the RPC is missing (PostgREST
`PGRST202`); the helper then pauses itself for 10 minutes per process instead of logging every
event. Retention: counters 30 days, digests 365 days (`lib/retention/policy.ts`).

| Event type | Recorded when | Where |
|---|---|---|
| `login_failed` | Wrong password or unknown account (401) | `app/api/auth/login/route.ts` |
| `login_rate_limited` | The per-IP or per-email login limit refuses (429) | `app/api/auth/login/route.ts` |
| `signup_blocked` | Signups are closed (403), or the per-IP, Siteverify budget, per-email or aggregate limit refuses (429) | `app/api/auth/signup/route.ts` |
| `turnstile_failed` | A Turnstile token is missing or rejected (400). Not when Cloudflare is unavailable (503) | `app/api/auth/signup/route.ts`, `app/api/auth/resend-verification/route.ts` |
| `password_reset_requested` | Supabase Auth asks the send-email hook for a recovery email (subject: the hook's user email) | `app/api/auth/send-email-hook/route.ts` |
| `password_reset_rate_limited` | Email governance refuses a recovery email (429, not a deduplicated redelivery) | `app/api/auth/send-email-hook/route.ts` |
| `origin_rejected` | A cookie-carrying API write fails the same-origin check (403) | `proxy.ts` |
| `webhook_auth_failed` | A provider webhook has a bad Resend signature, a wrong Brevo secret or no authentication headers (401) | `app/api/email/webhooks/route.ts` |
| `email_hook_auth_failed` | The send-email hook signature does not verify (401) | `app/api/auth/send-email-hook/route.ts` |
| `cron_auth_failed` | A cron route is called with a wrong or missing `CRON_SECRET` bearer (401) | `lib/api/actor.ts` (shared actor resolution) |
| `internal_revalidate_auth_failed` | `/api/internal/revalidate` is called without the right bearer (401) | `app/api/internal/revalidate/route.ts` |
| `client_errors_flood` | The platform-wide `/api/client-errors` cap is hit (429) | `app/api/client-errors/route.ts` |
| `quiz_check_rate_limited` | The quiz answer check limiter refuses (429; subject: learner id) | `app/api/v2/lessons/[lessonId]/quiz/check/route.ts` via `withRoute` `onRateLimited` |
| `admin_login_failed`, `admin_login_rate_limited`, `admin_login_non_admin` | Recorded by the admin console with `app = 'admin'` | admin repository |

Not recorded in this repository: rate limits Supabase Auth applies itself before calling the
hook (the reset-password page calls `resetPasswordForEmail` from the browser, so no learner
route sees that refusal), and the contact form, which has no Turnstile check.

---

## 5. CI Supply-Chain & Secret-Scanning Gates

Two gates run on every push and pull request, in the `security-audit` job of
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml). The job is deliberately
separate from `build-and-validate` so a security finding appears as its own check
rather than as a line in a build log, and neither gate is advisory-only: both fail
the job when they find something.

The job installs nothing. `npm audit` resolves entirely from the committed
lockfile, so the job that exists to distrust the dependency tree never executes a
third-party install script.

### 5.1 Dependency audit policy

[`scripts/ci/audit-gate.ts`](../scripts/ci/audit-gate.ts) wraps `npm audit`:

| Severity | Behaviour |
|---|---|
| `critical`, `high` | **Blocks**, unless reviewed in the allowlist |
| `moderate`, `low` | Reported in the job log; never blocks |

The only way past a blocking advisory is an entry in
[`scripts/ci/npm-audit-allowlist.json`](../scripts/ci/npm-audit-allowlist.json)
carrying two mandatory fields:

- **`reason`** — what was actually checked. An entry states the reachability
  analysis, not a conclusion. No entry may be added for an advisory whose
  vulnerable code path is reachable in production; the remedy there is to fix the
  dependency.
- **`reviewBy`** — the date the judgement stops being valid. Past that date the
  gate blocks again, so an acceptance cannot quietly become permanent.

The gate prints every accepted advisory on every run — an allowlist entry records a
decision, it does not silence the finding. Entries that no longer match anything
npm reports are flagged as stale (a warning, not a failure) so the list shrinks.

**Worked example — the first time the gate blocked.** On 2026-09-14 it blocked on
two Next.js criticals (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4). The AVIF
image-optimizer RCE was judged plausibly reachable: `/_next/image` is enabled and
`next.config.ts` lists `image/avif` in `formats`. Per the rule above, a reachable
advisory is fixed rather than accepted — `next` was upgraded 16.2.12 → 16.3.5,
which cleared both, and incidentally cleared four already-accepted `sharp` and
`postcss` highs whose entries were then removed as stale.

**Triage order for a new blocking advisory:** is the vulnerable code path reachable
in production, build, test or deploy? If yes, fix it — update, replace, or remove
the dependency. If no, and the analysis is checkable, add an allowlist entry with a
short review date. Never `npm audit fix --force`: forced remediation crosses
declared dependency ranges and is not reviewed.

### 5.2 Secret scanning

`gitleaks` runs over the working tree with [`.gitleaks.toml`](../.gitleaks.toml),
which extends the upstream rule set and adds two Prodily-specific rules:

- **`prodily-supabase-service-role-key`** — a Supabase service-role JWT. The
  upstream `jwt` rule already catches any JWT; this one exists so the finding
  *names* the highest-value secret in the system rather than reporting a generic
  token. It matches all three base64 phase alignments of the `service_role` claim.
- **`prodily-resend-api-key`** — `re_` keys, which the upstream rule set does not
  cover and which fall below the generic-key entropy threshold.

The binary is pinned by version **and** verified by SHA-256 checksum: an unpinned
scanner is a supply-chain hole in the control that exists to find supply-chain
holes. Findings are `--redact`ed so a discovered secret never reaches the public
build log, while the file, line and rule are still reported.

The allowlist covers published test values (Cloudflare's documented always-pass
Turnstile keys), the deterministic doubles in `vitest.setup.ts`, and the
credential-shaped fixtures in `lib/__tests__/` that exist precisely to prove
`lib/monitoring/redaction.ts` scrubs them. Each fixture is allowlisted by its
placeholder marker rather than by allowlisting the test directory, so a real
secret pasted into a test still fails the scan. Machine-generated, git-ignored
trees (`node_modules/`, `.next/`, `backups/`) are excluded so a local run reports
what CI reports — **`.env*` is deliberately not excluded**, since one force-added
into a commit is exactly the accident this scan exists to catch.

### 5.3 Dependabot

[`.github/dependabot.yml`](../.github/dependabot.yml) opens weekly PRs for
`apps/web`, the monorepo root manifest, and the pinned GitHub Actions. Patch and
minor updates are grouped; majors stay separate so each gets its own review and
regression run. Dependabot is what keeps the audit allowlist converging rather
than only growing.

Every ecosystem sets `cooldown: { default-days: 3 }`: a new release is not
proposed until it is 3 days old, which gives a compromised publish time to be
caught and pulled first. Cooldown applies to version updates only, so security
updates still arrive as soon as an advisory is published.

### 5.4 CI secrets and install scripts

Added 2026-11-13 (SEC-10, SEC-20). What changed in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

- **No sensitive secret at job level.** Job-level `env` reaches every step,
  including third-party install scripts. `build-and-validate` and `e2e` now keep
  only public values there: the two `NEXT_PUBLIC_SUPABASE_*` values (inlined into
  the client bundle anyway) and the published Turnstile test keys.
- **Secrets go only to the step that needs them.** In `build-and-validate`, no
  step gets `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` or
  `SEND_EMAIL_HOOK_SECRET`: unit tests use the mocks in `vitest.setup.ts`, and a CI
  build is never served (its build-time readers of the service-role key fall back
  to an empty list). The environment check gets a true/false flag, not the key.
  In `e2e`, only the step that starts the server gets `SUPABASE_SERVICE_ROLE_KEY`.
- **Installs run no scripts.** Both jobs run `npm ci --ignore-scripts`, then
  `npm rebuild esbuild unrs-resolver`, the only lockfile packages that declare an
  install script on Linux. Re-check that list when the lockfile gains a new
  `hasInstallScript` entry.
- **The deploy CLI is pinned.** `deploy-supabase` installs the Supabase CLI with
  `supabase/setup-cli`, pinned to a commit SHA, at a fixed `version:`, instead of
  `npx supabase` resolving whatever is newest on the day. Bump the version on
  purpose after reading the CLI release notes.
