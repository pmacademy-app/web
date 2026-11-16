# Observability & Metric Telemetry Specification (Prodily)

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

## 4. Request errors, client crashes and route timing (ENG-11)

Three signals, all free and all in logs or tables you already have. Nothing here needs a paid service.

### Server errors outside `withRoute`
- **Source:** `apps/web/instrumentation.ts`, `onRequestError`. Next.js calls it for errors in Server Components, Server Actions, route handlers and the proxy. Errors inside `withRoute` are already recorded by the wrapper and answered with a 500, so they do not arrive here twice.
- **Recorded:** one `system_errors` row via `logErrorReport` (domain `api`, kind `unexpected`, operation `next.<routeType>`, summary `Unhandled <routeType> error in <routePath>`). `details` holds the method, the path without its query string, the route file pattern, the route type, the digest, the error name, the redacted message (first 500 characters) and the request id when the caller sent a well-formed `x-request-id`.
- **Never recorded:** request bodies, the query string, cookies, the Authorization header or any other header.
- **Skipped:** `redirect()`, `notFound()` and other Next.js control-flow errors.
- **Where to look:** admin console, System errors, filtered by operation `next.render`, `next.action`, `next.route` or `next.proxy`. Match a learner's "Error ID" (the digest) against `details.digest`.

### Client-side crashes
- **Source:** `apps/web/lib/monitoring/client-error-beacon.ts`, called from the four error boundaries (`app/error.tsx`, `app/global-error.tsx`, `app/(app)/error.tsx`, `app/admin/(console)/error.tsx`). It posts `{ message, digest, path, boundary }` with `navigator.sendBeacon`, or `fetch` with `keepalive` as a fallback. The message is cut to 500 characters, the path loses its query and hash, and one page load sends at most 5 reports.
- **Endpoint:** `POST /api/client-errors` (`apps/web/app/api/client-errors/route.ts`). Anonymous, on `withRoute`, 10 reports per IP per minute, body capped at 2048 bytes (413 above it), strict zod schema (400 on anything else), 204 on success. The proxy skips session checks for it so the maintenance and consent gates cannot drop reports.
- **Recorded:** one `system_errors` row via `logSystemError` at `warning` severity, operation `client.error_boundary`, with the boundary, path, digest and message in `details`. Warnings do not page admins.
- **Where to look:** admin console, System errors, operation `client.error_boundary`.

### Route timing
- **Source:** `withRoute` in `apps/web/lib/api/with-route.ts`.
- **Recorded:** one structured log line per API request, event `route.timing`, with `operation`, `method`, `status`, `ms` and `requestId`. Refusals (401, 400, 429) are timed too. Requests at or above 3000 ms log at `warn` with `slow: true`; the rest log at `info`. `health.check` is not timed, so uptime probes do not flood the log.
- **Not persisted:** these lines go to the platform log only (`lib/monitoring/log.ts`), never to a table.
- **Where to look:** Vercel project, Logs. Search `route.timing` and filter on `operation`, or `"slow":true` for the slow ones.

---

## 5. Related Decisions

- [ADR-004: Structured error taxonomy with derived severity](decisions/ADR-004-structured-error-taxonomy.md)
- [ADR-003: Database-backed feature-flag control plane](decisions/ADR-003-db-backed-configuration-control-plane.md)
