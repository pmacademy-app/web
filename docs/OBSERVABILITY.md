# Observability & Metric Telemetry Specification — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 8, 2026  

---

## 1. Overview & Metric Source Mapping

This document specifies the complete observability architecture across internal application telemetry and external platform monitoring.

### Telemetry Source & Reliability Mapping

| Metric Name | Primary Source | Reliability Level | Metric Type | Description |
|---|---|---|---|---|
| **Provider Account Usage** | Brevo/Resend Dashboard (whichever is primary) | 🟢 Live Verified Telemetry | Upstream API Count | Total outbound email HTTPS calls accepted by the active provider |
| **Prodily Automation Quota** | `public.system_settings` (`email_daily_send_limit` / `daily_email_quota_count`) | 🟢 Live Verified Application Metric | Internal Database Counter | Daily counter for optional queued background emails — the only send quota enforced. There is no hourly limit and no global max-retry setting; both admin controls were removed in September 2026 rather than left implying enforcement |
| **Email Queue Pending** | `public.email_queue` (`status = 'pending'`) | 🟢 Live Verified Application Metric | Database State Query | Count of queued email items waiting for processing |
| **Email Delivery Events** | `public.email_delivery_events` / `public.notification_events` | 🟢 Live Verified Application Metric | Audit Log Event Stream | Log of delivery attempts with provider message IDs |
| **System Errors** | `public.system_errors` | 🟢 Live Verified Application Metric | Sanitized Log Stream | Errors classified by domain/kind/retryability with derived severity and a stored `occurrence_count` — see [`ERROR_MONITORING.md`](ERROR_MONITORING.md) |
| **Admin Audit Logs** | `public.admin_audit_logs` | 🟢 Live Verified Application Metric | Administrative Audit Trail | Immutable record of admin production actions |
| **Supabase Health Status** | `AdminConsoleService.getSystemHealth()` | 🟡 Configuration / Status Check | Connection Latency Check | Real-time query latency check on `public.users` |
| **Vercel Platform Status** | Deployment Status | 🟡 Configuration Check | Environment Presence | Verifies process environment runtime |
| **GitHub Actions Status** | Workflow Runs | 🟡 Configuration Check | Repository Secret Presence | Verifies `CRON_SECRET` & `APP_URL` trigger configurations |

---

## 2. Resend Usage vs. Prodily Automation Quota Breakdown

A key observability distinction exists between upstream provider usage and internal application queue counters:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      OUTBOUND EMAIL TRAFFIC SOURCES                     │
├───────────────────────────────────┬─────────────────────────────────────┤
│   Critical & Direct Sends         │     Queued Optional Automations     │
│   - Signup Verification           │     - Welcome Email                 │
│   - Password Recovery             │     - Daily Learning Reminders      │
│   - Admin Production Verification │     - Weekly Recaps                 │
│   - Contact Form Forwards         │     - Badge & Level Up Alerts       │
│   - Webhook Bounce Alerts         │                                     │
│   - Admin & Dev Test Emails       │                                     │
└─────────────────┬─────────────────┴──────────────────┬──────────────────┘
                  │                                    │
                  ▼                                    ▼
       Bypasses Internal Quota               Increments Internal Quota
                  │                                    │
                  │                          (daily_email_quota_count)
                  │                                    │
                  └─────────────────┬──────────────────┘
                                    │
                                    ▼
                    Active Provider (Brevo or Resend — see INTEGRATIONS.md)
                                    │
                                    ▼
                          Provider Account Usage
```

### Architectural Distinction
1. **Provider Account Usage**: Counts **EVERY** outbound HTTPS request received by the active provider (Brevo or Resend) under its account credentials, across all endpoints.
2. **Prodily Automation Quota**: Counts **ONLY** optional automated batch emails dispatched from `email_queue`. It deliberately excludes critical Auth emails and direct administrative sends to ensure user signups are never blocked when optional background automations hit their limit.

---

## 3. Known Observability & Audit Log Issue Register

### ISSUE-04: Admin Panel Email Quota vs. Resend Account Usage Metric Labeling
- **Status**: 🟡 Known Observability / UX Issue
- **Impact**: Admin Panel presents Prodily Automation Quota (`daily_email_quota_count`) under `"Daily Email Quota Usage"`, risking confusion with total Resend account usage.
- **Future Resolution**: Expose two separate metric cards: **Resend Account Outbound Usage** and **Prodily Automation Quota**.

### ISSUE-05: Admin Production Audit Trail False-Positive Success Reporting
- **Status**: 🟢 Resolved (September 2026)
- **Was**: `admin_audit_logs` recorded `SEND_PRODUCTION_EMAIL` as successful even when no email was delivered. The route checked the queue row for `status === 'failed'`, a status the processor never writes — it writes `retrying`, `dead_letter`, `skipped` or `suppressed` — so every failure was reported to the admin, and audit-logged, as a successful dispatch. An unreadable row also defaulted to `'delivered'`.
- **Resolution**: `/api/admin/emails/production-send` now treats **only** `delivered` as success. Non-delivery returns an error and writes a `SEND_PRODUCTION_EMAIL_FAILED` audit entry; policy stops (`skipped` / `suppressed`) return `409` with the reason; an unreadable row returns `500` rather than assuming success.

---

## 4. Related Decisions

- [ADR-004: Structured error taxonomy with derived severity](decisions/ADR-004-structured-error-taxonomy.md)
- [ADR-003: Database-backed feature-flag control plane](decisions/ADR-003-db-backed-configuration-control-plane.md)
