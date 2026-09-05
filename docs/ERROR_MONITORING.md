# Application Error Monitoring & Alerting — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026  

---

## 1. Overview & `logSystemError()` Architecture

System errors across API routes, background crons, webhook handlers, and database operations are captured by the `logSystemError()` logging framework (`lib/monitoring/logger.ts`).

- **Database Table**: `public.system_errors`
- **Severity Levels**: `'critical'`, `'error'`, `'warning'` — there is no `'info'` level. This is enforced both in the TypeScript type and a DB `CHECK` constraint.
- **Categories**: `'auth'`, `'verification'`, `'queue'`, `'resend'`, `'webhook'`, `'cron'`, `'system'` (plus `'brevo'` in the TypeScript type, though the DB `CHECK` constraint doesn't yet include it — an internal inconsistency worth fixing). There is no `'database'` category.
- **Instrumentation**: Extensively instrumented across `/api/email/webhooks`, `/api/cron/*`, `/api/admin/emails/production-send`, and `/api/auth/send-email-hook`.

---

## 2. Secret Sanitization & Fingerprint Deduplication

### Secret Sanitization
Before writing error `message` strings to PostgreSQL, `sanitizeErrorMessage()` (not `sanitizeErrorDetails` — no such function exists) strips sensitive tokens and credentials matching sensitive patterns:
- Bearer tokens (`Bearer eyJ...` → `Bearer [REDACTED]`)
- Webhook secrets (`whsec_...` → `whsec_[REDACTED]`)
- Secret keys (`sk_...`, `key_...` → `[REDACTED]`)
- Passwords and auth header values.

**Important gap:** this sanitization only applies to the `message` field. The `details` JSON object passed to `logSystemError()` is stored **as-is, unsanitized** — callers must not put raw secrets or tokens directly into `details`.

### Fingerprint Deduplication
To prevent log flooding during persistent service outages:
- An MD5 fingerprint is calculated from `category + operation + sanitizedMessage`.
- If an error with the same fingerprint occurred recently, `logSystemError()` updates the existing row's `updated_at` timestamp rather than inserting a new row.
- **There are no `occurrence_count` or `last_seen_at` columns on `system_errors`.** The "occurrence count" shown in the admin Errors tab is computed by grouping historical rows by `fingerprint` at query time (`SystemService.getErrorGroups`), not read from a stored counter.

---

## 3. Admin System Alerts Interface (`/admin/system`)

- **UI View**: `components/admin/AdminSystemAlertsView.tsx`
- **API Handler**: `app/api/admin/system/alerts/route.ts`
- **Features**:
  - Displays real-time error log feed filtered by severity.
  - Displays occurrence count and first/last seen timestamps.
  - Provides **Resolve Error** action to mark errors as resolved.

---

## 4. Status Summary

| Monitoring Subsystem | Location | Status |
|---|---|---|
| **`logSystemError()` Framework** | `lib/monitoring/logger.ts` | 🟢 Verified in Production |
| **Secret Sanitization Engine (`sanitizeErrorMessage`)** | `lib/monitoring/logger.ts` | 🟡 Verified — `message` only, `details` unsanitized |
| **Fingerprint Deduplication (query-time grouping)** | `lib/monitoring/logger.ts`, `lib/admin/system-service.ts` | 🟢 Verified in Production |
| **`public.system_errors` Schema** | `supabase/migrations/20260810000009_*.sql` | 🟢 Verified in Production |
| **Admin System Alerts UI** | `components/admin/AdminSystemAlertsView.tsx` | 🟢 Verified in Production |
| **Cron & Webhook Error Instrumentation**| `/api/cron/*`, `/api/email/webhooks` | 🟢 Verified in Production |
