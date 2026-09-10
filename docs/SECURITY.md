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

`POST /api/auth/signup` previously had **no rate limiting of any kind**, which allowed ~1,233 automated accounts to be created in ~25 hours (see [`INCIDENT_2026-09-06_SIGNUP_ABUSE.md`](audits/INCIDENT_2026-09-06_SIGNUP_ABUSE.md)). It now enforces, via the persistent cross-instance rate limiter (`lib/rate-limit.ts`):
- **5 signups / 15 minutes** per client IP (`x-forwarded-for` / `x-real-ip`).
- **3 signups / 24 hours** per canonicalized email — Gmail `local+tag@gmail.com` addresses collapse to `local@gmail.com` before the check, closing the specific alias-abuse pattern seen in the incident.

No CAPTCHA/bot-challenge provider is configured anywhere in the codebase today. If signup abuse resumes after the above limits, that is the next control to add.

---

## 4. Secret Safety & Environment Handling

- **Server-Only Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `CRON_SECRET`, `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `RESEND_WEBHOOK_SECRET` are strictly server-side.
- **Client Expose Prevention**: Never import service-role client into client components (`'use client'`).
- **Secret Sanitization**: `lib/monitoring/redaction.ts` is the single redaction implementation, applied to logged messages, to `details` payloads recursively, to queue template variables before they reach `email_dead_letter` / `notification_events`, and to the outgoing message of `apiError()`. It redacts by value shape (provider keys `xkeysib-`/`xsmtpsib-`/`re_`, `whsec_` and Svix signatures, JWTs, database connection credentials, `Authorization` and cookie headers, session tokens, one-time auth tokens in URLs, passwords) **and** by key name for structured payloads. Email addresses are masked rather than dropped so the recipient domain stays diagnosable. See [ADR-005](decisions/ADR-005-sensitive-data-redaction.md). Admin API responses use `adminErrorMessage()`, which sanitizes rather than genericizes: the operator keeps the diagnostic text, credentials and connection strings do not survive.
