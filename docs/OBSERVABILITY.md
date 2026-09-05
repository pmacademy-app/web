# Observability & Metric Telemetry Specification — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 6, 2026  

---

## 1. Overview & Metric Source Mapping

This document specifies the complete observability architecture across internal application telemetry and external platform monitoring.

### Telemetry Source & Reliability Mapping

| Metric Name | Primary Source | Reliability Level | Metric Type | Description |
|---|---|---|---|---|
| **Provider Account Usage** | Brevo/Resend Dashboard (whichever is primary) | 🟢 Live Verified Telemetry | Upstream API Count | Total outbound email HTTPS calls accepted by the active provider |
| **Prodily Automation Quota** | `public.system_settings` (`email_daily_send_limit` / `daily_email_quota_count`) | 🟢 Live Verified Application Metric | Internal Database Counter | Daily counter for optional queued background emails — the only quota actually enforced (hourly/max-retry settings exist in the UI but are dead, see `docs/ISSUES_KNOWN.md` ISSUE-22) |
| **Email Queue Pending** | `public.email_queue` (`status = 'pending'`) | 🟢 Live Verified Application Metric | Database State Query | Count of queued email items waiting for processing |
| **Email Delivery Events** | `public.email_delivery_events` / `public.notification_events` | 🟢 Live Verified Application Metric | Audit Log Event Stream | Log of delivery attempts with provider message IDs |
| **System Errors** | `public.system_errors` | 🟢 Live Verified Application Metric | Sanitized Log Stream | Categorized application errors with deduplication |
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
- **Status**: 🟠 Partially Verified / Known Production Failure
- **Impact**: In live production, `public.admin_audit_logs` records `SEND_PRODUCTION_EMAIL` even when `processEmailQueue()` returns `processed: 0` and zero emails are delivered to Resend.
- **Observability Gap**: The audit trail records the administrative trigger attempt as successful even when delivery fails silently upstream.
- **Cross-Reference**: Documented in `docs/ISSUES_KNOWN.md#issue-05-admin-production-email-zero-processed-delivery-gap`.
