# Application Error Monitoring & Alerting — Prodily PM Academy

**Repository:** `pmacademy-app/web`  
**Current Baseline HEAD:** `490fea37ea08813aa582fc5ebbc3896ee4eb070c`  
**Last Updated:** August 10, 2026  

---

## 1. Overview & `logSystemError()` Architecture

System errors across API routes, background crons, webhook handlers, and database operations are captured by the `logSystemError()` logging framework (`lib/monitoring/logger.ts`).

- **Database Table**: `public.system_errors`
- **Severity Levels**: `'info'`, `'warning'`, `'error'`, `'critical'`
- **Categories**: `'system'`, `'auth'`, `'resend'`, `'webhook'`, `'cron'`, `'database'`
- **Instrumentation**: Extensively instrumented across `/api/email/webhooks`, `/api/cron/*`, `/api/admin/emails/production-send`, and `/api/auth/send-email-hook`.

---

## 2. Secret Sanitization & 15-Minute Deduplication

### Secret Sanitization
Before writing error messages or stack traces to PostgreSQL, `sanitizeErrorDetails()` strips sensitive tokens and credentials matching sensitive patterns:
- Bearer tokens (`Bearer eyJ...` → `Bearer [REDACTED]`)
- Webhook secrets (`whsec_...` → `whsec_[REDACTED]`)
- Secret keys (`sk_...`, `key_...` → `[REDACTED]`)
- Passwords and auth header values.

### 15-Minute Fingerprint Deduplication
To prevent log flooding during persistent service outages:
- An MD5 fingerprint is calculated from `category + operation + sanitizedMessage`.
- If an error with the same fingerprint occurred within the last 15 minutes, `logSystemError()` updates the existing row in `public.system_errors`:
  - Increments `occurrence_count` by 1.
  - Updates `last_seen_at` timestamp.
  - Skips inserting duplicate rows.

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
| **Secret Sanitization Engine** | `lib/monitoring/logger.ts` | 🟢 Verified in Production |
| **15m Fingerprint Deduplication** | `lib/monitoring/logger.ts` | 🟢 Verified in Production |
| **`public.system_errors` Schema** | `supabase/migrations/20260810000009_*.sql` | 🟢 Verified in Production |
| **Admin System Alerts UI** | `components/admin/AdminSystemAlertsView.tsx` | 🟢 Verified in Production |
| **Cron & Webhook Error Instrumentation**| `/api/cron/*`, `/api/email/webhooks` | 🟢 Verified in Production |
