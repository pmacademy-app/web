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
- **Email Delivery Provider:** Resend API connection status, API key validation, and Brevo fallback availability.
- **Email & Notification Queue:** Count of pending vs. processing items in `email_queue`.
- **Scheduler & Cron Status:** Last execution timestamps for GitHub Actions background workflows.

### B. Active Alerts Tab (`?tab=alerts`)
Real-time system warnings categorized by severity:
- `critical` (Red) — Service outages, database errors, authentication hook failures.
- `warning` (Amber) — High queue latency, elevated bounce rates, rate limit spikes.
- `info` (Blue) — Normal operational notices.

### C. Error Logs Tab (`?tab=errors`)
Aggregated application error logs captured via `logSystemError()`:
- **15-Minute Fingerprint Deduplication:** Identical errors occurring within 15 minutes are grouped together with an incrementing `occurrence_count` rather than flooding the log.
- **Secret Sanitization:** All logged error payloads pass through `sanitizeErrorDetails()`, stripping Bearer tokens, passwords, and API keys.
- **Error Detail Drawer:** Click any error row to inspect the full stack trace, error category, HTTP route, user agent, and contextual JSON payload.

### D. Audit Log Tab (`?tab=audit`)
Searchable, immutable ledger of all administrative mutations recorded in `public.admin_audit_logs`:
- **Search & Filter:** Search by administrator email, action name (e.g., `toggle_user_fellow_status`, `update_platform_settings`), or target user ID.
- **Record Details:** Captures admin email, timestamp, IP address, user agent, target entity, and exact before/after JSON mutation payloads.

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
