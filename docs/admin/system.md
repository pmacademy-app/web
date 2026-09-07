# System Health, Error Monitoring & Audit Logs — Operating Guide

**Location:** `/admin/system`  
**Workspace:** System $\rightarrow$ System  
**Audience:** Administrators, DevOps & Support Engineers  

---

## 1. Purpose

The System Workspace provides comprehensive operational visibility into backend infrastructure health, database connection latency, aggregated application error logs, active severity alerts, and immutable administrative audit logs.

---

## 2. Access & Permissions

- **Path:** Navigate to `/admin/system` from the sidebar.
- **Permissions:** Admin role required (`is_admin = true` or listed in `ADMIN_EMAILS`).

---

## 3. System Tabs & Operational Capabilities

### A. Health Diagnostics Tab (`?tab=health`)
Live operational health checks across core infrastructure components:
- **Database (Supabase PostgreSQL):** Connection status and round-trip query latency (in ms).
- **Authentication Service:** Supabase Auth API health and token verification check.
- **Email Delivery Provider:** connection status for whichever provider (Brevo or Resend) is currently primary, plus fallback availability.
- **Email & Notification Queue:** Count of pending vs. processing items in `email_queue`.
- **Scheduler & Cron Status:** Last execution timestamps for GitHub Actions background workflows.

### A2. Auth Health Telemetry
24h/7d authentication failure counts, split into provider-error vs. network-error buckets, with spike detection (flags when ≥5 critical/error auth failures occur within a 15-minute window). `GET /api/admin/system/auth-health`.

### A3. Storage Cleanup
Triggers `AvatarService.cleanupOrphanedAvatars({ dryRun, minAgeHours })` to remove avatar files no longer referenced by any user record. Supports a dry-run mode to preview what would be deleted before committing.

### B. Active Alerts Tab (`?tab=alerts`)
Real-time system warnings categorized by severity — there are only **three** severities in the schema (no `info` level):
- `critical` (Red) — Service outages, database errors, authentication hook failures.
- `error` — Application-level errors that don't fully take down a service.
- `warning` (Amber) — High queue latency, elevated bounce rates, rate limit spikes.

### C. Error Logs Tab (`?tab=errors`)
Aggregated application error logs captured via `logSystemError()`:
- **Fingerprint Deduplication:** errors are deduplicated by a `category:operation:sanitized-message` fingerprint. There is no stored `occurrence_count`/`last_seen_at` column — the count shown in this UI is computed by grouping historical rows by fingerprint at query time, and a duplicate within the window only bumps `updated_at` rather than inserting a new row.
- **Secret Sanitization:** the error `message` string passes through `sanitizeErrorMessage()` (`lib/monitoring/logger.ts`), stripping Bearer tokens, passwords, and API keys. **The `details` JSON payload is stored unsanitized** — do not put raw secrets into it when logging.
- **Error Detail Drawer:** Click any error row to inspect the full stack trace, error category, HTTP route, user agent, and contextual JSON payload.

### D. Audit Log Tab (`?tab=audit`)
Searchable, immutable ledger of all administrative mutations recorded in `public.admin_audit_logs`:
- **Search & Filter:** Search by administrator email, action name (e.g., `toggle_user_fellow_status`, `set_portfolio_verification_verified`, `update_platform_settings`), or target user ID.
- **Record Details:** Captures admin email, timestamp, IP address, user agent, target entity, and exact before/after JSON mutation payloads.

**Note:** Alerts and Errors read from the same underlying `system_errors` table, just grouped differently (raw list vs. fingerprint-grouped) — they are not two separate data sources.

---

## 4. Header Actions: Manual Queue Trigger

In the top action bar:
- **[ Process Email Queue ] Button:** Dispatches an immediate `POST /api/cron/process-email-queue` call, forcing the serverless queue processor to claim and deliver pending items without waiting for the next 5-minute cron cycle.

---

## 5. Practical Example

**Investigating a reported issue with email delivery:**
1. Open `/admin/system` $\rightarrow$ inspect the **Health Tab**.
2. Check the **Email Provider** card. If Resend shows connection errors, inspect the **Errors Tab** for `resend_api_error` events.
3. Switch to the **Audit Log Tab** to verify who triggered recent email campaigns or setting changes.
4. Click **[ Process Email Queue ]** in the header to re-trigger the queue worker once connectivity is restored.
