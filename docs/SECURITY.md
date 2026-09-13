# Security Threat Model & Access Control — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026  

---

## 1. Role-Based Access Control (RBAC) Architecture

Access to administrative features and Route Handlers (`/admin`, `/api/admin/*`) is governed by:

1. **Proxy Middleware Protection (`apps/web/proxy.ts`)**: Intercepts requests to `/admin` routes and checks the authenticated Supabase JWT session. As a fast path, it also trusts a `user.app_metadata?.is_admin` JWT claim before falling back to the database check.
2. **`lib/admin/guard.ts` — the actual per-request enforcement layer**: `requireAdminUser()` (used by every `/api/admin/**` route handler) and `logAdminAction()`, with per-request result caching via a `WeakMap`. It imports `isAdminEmail()` from `lib/admin/authorization.ts` (a small helper file — the enforcement logic itself lives in `guard.ts`, not `authorization.ts`).
   - **Environment Override**: Checks if `user.email` matches `ADMIN_EMAILS` environment variable (comma-separated list).
   - **Database Role Check**: Checks if `users.is_admin === true` in PostgreSQL.
   - Either condition alone grants access.

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
   - Verifies requests using `SEND_EMAIL_HOOK_SECRET`.
   - Supports Bearer token, custom headers (`x-supabase-auth-secret`), query string, and Svix HMAC-SHA256 signatures.
2. **Email provider webhooks (`/api/email/webhooks`)** — this single route handles **two** distinct providers with two distinct verification mechanisms:
   - **Resend**: Svix HMAC-SHA256 signature verification via `RESEND_WEBHOOK_SECRET` (`verifySvixSignature()`).
   - **Brevo**: a plain shared-secret header compare (`x-brevo-webhook-secret` / `x-webhook-secret`) against `BREVO_WEBHOOK_SECRET` — not HMAC-based.
   - Both reject unsigned/mismatched payloads with HTTP 401.
3. **Cron Endpoints (`/api/cron/*`)**:
   - Enforces Bearer token authentication matching `CRON_SECRET`.
   - Rejects unauthorized calls with HTTP 401 and logs a warning with `logSystemError()`.

### CSRF / Origin-Referer Scope

An Origin/Referer header check exists today on exactly **one** route: `POST /api/auth/update-password`. It is not a platform-wide CSRF policy — signup, login, and change-email do not currently enforce it.

---

## 3a. Signup Abuse Controls (added 2026-09-07)

`POST /api/auth/signup` previously had **no rate limiting of any kind**, which allowed ~1,233 automated accounts to be created in ~25 hours (see [`INCIDENT_2026-09-06_SIGNUP_ABUSE.md`](archive/INCIDENT_2026-09-06_SIGNUP_ABUSE.md)). It now enforces, via the persistent cross-instance rate limiter (`lib/rate-limit.ts`):
- **5 signups / 15 minutes** per client IP (`x-forwarded-for` / `x-real-ip`).
- **3 signups / 24 hours** per canonicalized email — Gmail `local+tag@gmail.com` addresses collapse to `local@gmail.com` before the check, closing the specific alias-abuse pattern seen in the incident.

No CAPTCHA/bot-challenge provider is configured anywhere in the codebase today. If signup abuse resumes after the above limits, that is the next control to add.

---

## 4. Secret Safety & Environment Handling

- **Server-Only Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `CRON_SECRET`, `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET` are strictly server-side.
- **Client Expose Prevention**: Never import service-role client into client components (`'use client'`).
- **Secret Sanitization**: `lib/monitoring/redaction.ts` is the single redaction implementation, applied to logged messages, to `details` payloads recursively, to queue template variables before they reach `email_dead_letter` / `notification_events`, and to the outgoing message of `apiError()`. It redacts by value shape (provider keys `xkeysib-`/`xsmtpsib-`/`re_`, `whsec_` and Svix signatures, JWTs, database connection credentials, `Authorization` and cookie headers, session tokens, one-time auth tokens in URLs, passwords) **and** by key name for structured payloads. Email addresses are masked rather than dropped so the recipient domain stays diagnosable. See [ADR-005](decisions/ADR-005-sensitive-data-redaction.md). Admin API responses use `adminErrorMessage()`, which sanitizes rather than genericizes: the operator keeps the diagnostic text, credentials and connection strings do not survive.

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
