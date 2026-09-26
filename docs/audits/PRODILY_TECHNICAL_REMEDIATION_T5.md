# Prodily Technical Remediation Report: Phase T5 — Operational Resilience & Observability

> **Phase**: T5 (Final Planned Phase)  
> **Branch**: `tech-fixes`  
> **Starting Commit**: `8c99090` (T4 completed state; `548d6167993d3544636ab79a8267e3770e1ccac5` equivalent)  
> **Date**: September 26, 2026  
> **Status**: Complete & Validated  

---

## 1. Executive Summary

Phase T5 is the final designated phase of the Prodily Technical Remediation Track. It hardens operational resilience, infrastructure observability, deliverability compliance, and scheduled background processing across five core areas:

1. **Email Bounce / Complaint Webhook Ingestion & Suppression Synchronization** (T5.1)
2. **System Health Check Endpoint (`GET /api/health`)** (T5.2)
3. **Email Provider Failover & Operational Alerting** (T5.3)
4. **Reminder Cron Timezone-Aware Delivery Windows** (T5.4)
5. **Redundant Retry Cron Deprecation & Scheduling Cleanup** (T5.5)

All implementations adhere strictly to the repository's `withRoute` infrastructure, PostgreSQL relational constraints, idempotency protocols, and zero-PII logging standards. Zero hypothetical services were introduced. Full regression testing verified that invariants from Phases T1, T2, T3, and T4 remain fully intact.

---

## 2. Commit & Environment Metadata

- **Branch**: `tech-fixes`
- **Starting Commit**: `8c99090` (`fix(frontend): remediate technical audit phase t4`)
- **T4 Equivalent Commit**: `548d6167993d3544636ab79a8267e3770e1ccac5`
- **Environment**: Next.js 16 (React 19), Supabase PostgreSQL, Node 22

---

## 3. T5.1 — Email Bounce & Complaint Webhook Ingestion

### Findings & Root Cause
Prior to T5, while `/api/email/webhooks` had signature verification scaffolding for Resend (via Svix) and Brevo (via webhook token), it lacked:
1. Deterministic webhook event deduplication (`provider_event_id`). Repeated webhook delivery from providers could create duplicate delivery event logs.
2. Suppression synchronization into `email_suppressions` on hard bounces and spam complaints.
3. User notification preference synchronization: permanently bounced or complaining users were not marked as unsubscribed from non-critical communications in `user_notification_preferences`.
4. Suppression enforcement in outbound email queues: non-critical marketing and reminder emails could still be enqueued and sent to suppressed addresses.

### Remediation
- **Migration `20260926000001_phase_t5_operational_resilience.sql`**:
  - Added `provider_event_id TEXT` to `email_delivery_events`.
  - Added unique partial index `idx_email_delivery_events_provider_event_id` on `email_delivery_events (provider_event_id) WHERE provider_event_id IS NOT NULL`.
  - Added composite index `idx_email_suppressions_email_reason` on `email_suppressions (email, reason)`.
- **Webhook Ingestion (`apps/web/app/api/email/webhooks/route.ts`)**:
  - Authenticates Brevo requests via `BREVO_WEBHOOK_SECRET` header or payload token, and Resend requests via Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) using `RESEND_WEBHOOK_SECRET`.
  - Parses events safely and handles malformed JSON with HTTP 400 without crashing.
  - Queries `email_delivery_events` by `provider_event_id`. Duplicate webhook deliveries return HTTP 200 with `{ received: true, duplicate: true }` immediately, guaranteeing idempotency.
  - **Bounce Classification**:
    - Distinguishes permanent/hard bounces from transient/soft bounces.
    - Soft bounces record the delivery event log but do *not* suppress the recipient or mark the queue item failed.
    - Hard bounces and spam complaints upsert suppression records into `email_suppressions`.
  - **Preference Synchronization**:
    - Resolves user profile by email and updates `user_notification_preferences` (`all_email: false, marketing_email: false`).
  - **Outbound Suppression Enforcement**:
    - `apps/web/lib/notifications/queue/processor.ts` (`enqueueNotificationItem`) checks `email_suppressions` before enqueuing non-critical emails.
    - `apps/web/lib/email.ts` (`sendEmail`) supports direct suppression checking via `checkSuppression: true`.
    - Critical authentication/security emails (password reset, email verification) bypass suppression.
  - **Privacy**: Strips email bodies and unnecessary recipient metadata before persisting event metadata.

---

## 4. T5.2 — System Health Check Endpoint (`GET /api/health`)

### Findings & Root Cause
The application lacked a lightweight, standardized operational health check endpoint. Load balancers, deployment probes, and uptime monitors had no machine-readable way to verify process and database health without invoking expensive application routes.

### Remediation
- **Implemented `apps/web/app/api/health/route.ts`**:
  - Wrapped with standard `withRoute` infrastructure with public access enabled for uptime monitors.
  - **Dependency Checks**:
    - Process availability and uptime (`process.uptime()`).
    - Database connectivity: executes minimal `select('id').limit(1)` probe against `public.users` with latency timing.
    - Confirmed that Redis is *not* used in the current architecture (rate limiting uses PostgreSQL `rate_limits`, queues use PostgreSQL `email_queue`), so no hypothetical Redis checks were added.
  - **Response Payload**:
    - Returns HTTP 200 when healthy:
      ```json
      {
        "status": "healthy",
        "timestamp": "2026-09-26T08:23:44.000Z",
        "uptime": 1245.2,
        "version": "0.2.0",
        "services": {
          "application": { "status": "up" },
          "database": { "status": "up", "latencyMs": 14 }
        }
      }
      ```
    - Returns HTTP 503 when degraded or database is unreachable, with status `'degraded'`.
    - Triggers operational error alert via `logErrorReport` (`health.check_failure`) on database failure.
  - **Security**: Strictly zero environment variables, credentials, database connection strings, or stack traces are exposed.

---

## 5. T5.3 — Email Provider Failover & Alerting

### Findings & Root Cause
Prodily supports Brevo as the primary provider with Resend available in the architecture. However:
1. Operational alerts were missing for repeated provider batch failures and runaway queue backlog growth.
2. Provider failure classification needed strict validation to prevent invalid fallback on client errors (400, 422, invalid recipient).
3. If a secondary provider was unconfigured in the environment, the system must not attempt fake fallback or simulate secondary sends.

### Remediation
- **Provider Failure Classification**:
  - Verified and tested `apps/web/lib/notifications/queue/failure-classification.ts`:
    - Failover eligible: Capacity exhaustion (HTTP 402, 429), provider server outages (HTTP 500, 502, 503), network timeouts / DNS failures.
    - Failover ineligible: Client errors (HTTP 400, 422), invalid recipient email, recipient suppression, syntax errors.
- **Failover Logic (`sendEmailWithFailover`)**:
  - If primary provider experiences an eligible outage and secondary provider `isConfigured() === true`, execution fails over cleanly to the secondary provider.
  - If secondary provider is unconfigured (`!secondary.isConfigured()`), the system logs the failure, skips fallback, and does not simulate sends.
- **Operational Alerts (`apps/web/lib/notifications/queue/processor.ts`)**:
  - Added repeated provider failure alerting: when `>= 5` dispatches fail in a single batch, an alert (`email.repeated_provider_failures`) is logged with affected provider name, failure count, and sample errors.
  - Added queue backlog growth alerting: when remaining queue items exceed 200 after batch processing, a warning alert (`email.queue_backlog_growth`) is logged.

---

## 6. T5.4 — Reminder Cron Timezone-Aware Delivery Windows

### Findings & Root Cause
In Phase T3, reminder crons were scaled using bounded keyset pagination and execution deadlines, but timezone-aware delivery was deferred. Daily reminders and weekly recaps were sent based on server UTC time, resulting in reminders arriving in the middle of the night for users outside UTC.

### Remediation
- **Timezone Source of Truth**:
  - Inspected existing schema: `public.user_notification_preferences` already contains `preferred_reminder_hour`, `timezone`, `preferredRecapDay`, and `preferredRecapHour`. No schema duplication was introduced.
- **Timezone Utility (`apps/web/lib/notifications/timezone.ts`)**:
  - Implemented runtime conversion using standard ECMAScript `Intl.DateTimeFormat` with IANA timezone identifiers (e.g., `America/New_York`, `Asia/Kolkata`, `Europe/London`).
  - Safely falls back to `UTC` if timezone string is missing or invalid.
  - Accurately resolves local hour, local day of week, and local `YYYY-MM-DD` date across DST transitions and UTC boundaries without manual offset math.
- **Daily Reminders (`apps/web/app/api/cron/daily-reminder/route.ts`)**:
  - Evaluates user local hour against `preferred_reminder_hour` (default 9 AM local).
  - Skips delivery if current local hour is not the target hour (unless overridden with `?force=true`).
  - Generated idempotency key: `daily-reminder-${user.id}-${userLocalTime.localDate}` ensures exactly-once delivery per local calendar day.
- **Weekly Recap (`apps/web/app/api/cron/weekly-recap/route.ts`)**:
  - Evaluates user local day of week and local hour against `preferredRecapDay` (default 0 / Sunday) and `preferredRecapHour` (default 18 / 6 PM local).
  - Generated idempotency key: `weekly-recap-${user.id}-${userLocalTime.localDate}` prevents duplicate delivery around midnight and DST boundaries.
- **Scalability Preserved**:
  - Maintained T3 keyset pagination (`gt('id', lastSeenId)`), batch preference fetching (`getBatchNotificationPreferences`), bounded batch sizes (100), and 25-second execution budget.

---

## 7. T5.5 — Redundant Retry Cron Deprecation & Cleanup

### Findings & Root Cause
The technical audit identified redundant retry cron behavior:
- `/api/cron/process-email-queue` runs every 5 minutes and claims both `pending` and retryable `failed` items (`retries < max_retries`, `retry_after <= now()`) with exponential backoff and lease reclamation.
- `/api/cron/retry-failed` ran concurrently every hour on GitHub Actions (`30 * * * *`), attempting to reset failed rows back to pending. This created lease contention and duplicate retry paths.

### Remediation
- **Route Deprecation (`apps/web/app/api/cron/retry-failed/route.ts`)**:
  - Deprecated the endpoint. When invoked, it returns:
    ```json
    {
      "success": true,
      "deprecated": true,
      "message": "Retry handling is natively integrated into /api/cron/process-email-queue with exponential backoff and lease reclamation. This endpoint is retained as a manual no-op fallback.",
      "processed": 0
    }
    ```
- **Workflow Cleanup (`.github/workflows/notification-scheduler.yml`)**:
  - Removed the redundant scheduled cron `30 * * * *` from `retry-failed-emails`.
  - Retained the job with `workflow_dispatch` only for emergency manual runs.
- **Documentation (`docs/CRON_AND_SCHEDULING.md`)**:
  - Documented that `/api/cron/process-email-queue` is the sole authoritative retry processor.

---

## 8. Summary of Files Changed

| File | Change Description |
| :--- | :--- |
| `supabase/migrations/20260926000001_phase_t5_operational_resilience.sql` | **New**: Adds `provider_event_id` column to `email_delivery_events` with unique index, and index on `email_suppressions(email, reason)`. |
| `apps/web/lib/notifications/timezone.ts` | **New**: Timezone conversion utility using `Intl.DateTimeFormat` with IANA validation and local date formatting. |
| `apps/web/lib/__tests__/phase-t5-operational-resilience.test.ts` | **New**: Dedicated 19-test suite validating T5.1–T5.5 requirements. |
| `apps/web/app/api/email/webhooks/route.ts` | Webhook idempotency deduplication, bounce classification, suppression sync, and preference sync. |
| `apps/web/app/api/health/route.ts` | Machine-readable health check endpoint with database probe, latency, uptime, and 200/503 status codes. |
| `apps/web/app/api/cron/daily-reminder/route.ts` | Timezone-aware local hour evaluation and local date idempotency keys. |
| `apps/web/app/api/cron/weekly-recap/route.ts` | Timezone-aware local day/hour evaluation and local date idempotency keys. |
| `apps/web/app/api/cron/retry-failed/route.ts` | Deprecated redundant retry endpoint with informative response. |
| `apps/web/lib/notifications/queue/processor.ts` | Suppression checks on enqueue, repeated provider failure alerts, and backlog growth alerts. |
| `apps/web/lib/email.ts` | Direct suppression enforcement option (`checkSuppression: true`). |
| `apps/web/types/database.ts` | Added `provider_event_id` to `email_delivery_events` Row/Insert/Update types. |
| `apps/web/lib/api/with-route.ts` | Cleaned up stale audit comment (P3-2). |
| `.github/workflows/notification-scheduler.yml` | Removed scheduled hourly cron for redundant retry job. |
| `docs/CRON_AND_SCHEDULING.md` | Updated retry cron documentation. |

---

## 9. Security & Privacy Considerations

1. **Authentication**: All webhook requests must satisfy provider signature verification (Brevo token or Resend Svix HMAC). Unauthenticated requests are rejected with HTTP 401.
2. **Public Health Endpoint**: `/api/health` exposes only high-level status (`healthy`/`degraded`), service statuses (`up`/`down`), and round-trip latencies. Zero credentials, connection strings, or system paths are exposed.
3. **Privacy**: Delivery event logging strips email bodies and recipient personally identifiable information (PII).
4. **Critical Email Immunity**: Authentication emails (password resets, magic links, email verification) bypass suppression lists so users can always regain account access.

---

## 10. Provider Configuration Requirements

For production deployment, ensure the following environment variables are configured in the hosting environment (e.g. Vercel / Railway):

| Variable | Provider | Purpose |
| :--- | :--- | :--- |
| `BREVO_API_KEY` | Brevo | Primary email sending API key. |
| `BREVO_WEBHOOK_SECRET` | Brevo | Webhook authorization secret for incoming Brevo delivery events. |
| `RESEND_API_KEY` | Resend | Secondary / failover email sending API key. |
| `RESEND_WEBHOOK_SECRET` | Resend | Svix webhook signing secret for incoming Resend delivery events. |
| `CRON_SECRET` | System | Bearer token securing all background cron endpoints. |

> [!IMPORTANT]
> **External Webhook Verification Notice**:
> In accordance with operational safety guidelines, local code verifies webhook signatures and payload contracts using cryptographic unit tests with Svix HMAC and Brevo tokens. Webhook endpoints must be registered in the Brevo and Resend provider dashboards in staging/production pointing to `https://<domain>/api/email/webhooks`.

---

## 11. Validation & Test Results

### 1. Dedicated T5 Test Suite
Command: `npx vitest run lib/__tests__/phase-t5-operational-resilience.test.ts`
- **Result**: **19 / 19 passed** (100%)
- **Test breakdown**:
  - `rejects unauthenticated webhook requests with HTTP 401`: Passed
  - `rejects invalid Svix signature with HTTP 401`: Passed
  - `handles malformed JSON payload safely with HTTP 400 without crashing`: Passed
  - `processes hard bounce: logs delivery event, records suppression, and syncs user preferences`: Passed
  - `soft bounce records event but does NOT permanently suppress or mark queue failed`: Passed
  - `spam complaint creates spam_complaint suppression and syncs preferences`: Passed
  - `duplicate webhook delivery is idempotent and does not re-insert`: Passed
  - `suppressed user cannot receive non-critical emails but critical auth emails bypass suppression`: Passed
  - `returns HTTP 200 with operational telemetry when database is healthy`: Passed
  - `returns HTTP 503 when database is unreachable or degraded`: Passed
  - `confirms Redis is not a required dependency in current architecture`: Passed
  - `classifies provider failures correctly: failover on capacity/5xx, permanent on 400/422`: Passed
  - `does NOT attempt fake fallback when secondary provider is not configured`: Passed
  - `triggers failover to configured secondary provider on eligible 500 error`: Passed
  - `resolves user local hour and date accurately across multiple IANA timezones`: Passed
  - `safely falls back to UTC on invalid or missing timezone strings`: Passed
  - `evaluates delivery windows accurately for daily reminder and weekly recap`: Passed
  - `daily reminder cron respects timezone delivery windows and local date idempotency`: Passed
  - `/api/cron/retry-failed is marked as deprecated and returns honesty note`: Passed

### 2. Full Regression Suite (Phases T1, T2, T3, T4, T5)
Command: `npx vitest run lib/__tests__/phase-t1-security-hardening.test.ts lib/__tests__/phase-t2-backend-reliability.test.ts lib/__tests__/phase-t3-performance-query.test.ts lib/__tests__/phase-t4-frontend-resilience.test.ts lib/__tests__/phase-t5-operational-resilience.test.ts`
- **Result**: **84 / 84 passed** across all 5 test files
  - `phase-t1-security-hardening.test.ts`: 15 passed
  - `phase-t2-backend-reliability.test.ts`: 19 passed
  - `phase-t3-performance-query.test.ts`: 9 passed
  - `phase-t4-frontend-resilience.test.ts`: 22 passed
  - `phase-t5-operational-resilience.test.ts`: 19 passed

### 3. Auxiliary Test Suites
- `lib/__tests__/email-hook-reliability.test.ts`: **22 / 22 passed**
- `npm run test:email` (`email-engine.test.ts` + `email-hook-reliability.test.ts`): **23 / 23 passed**
- `npm run test:notifications` (`notifications.test.ts` + `notification-queue-integrity.test.ts`): **17 / 17 passed**
- `npm run test:automations` (`email-automations.test.ts`): **5 / 5 passed**
- `npm run test:monitoring` (`system-monitoring.test.ts`): **12 / 12 passed**

### 4. Static Checks
- **TypeScript Typecheck (`tsc --noEmit`)**: Clean exit (code 0), 0 errors across entire repository.
- **ESLint**: ESLint has no configuration file present in the project.

---

## 12. Remaining Operational Risks

1. **Provider Webhook Registration**: Webhooks must be explicitly configured in the Brevo and Resend dashboards with their respective signing secrets set in environment variables. Until configured, bounces will not be automatically ingested from live provider activity.
2. **Timezone Data Completeness**: Users without an explicitly set timezone will default to UTC for reminder deliveries until they update their preferences or browser timezone is captured.
3. **Database Migration Rollout**: Migration `20260926000001_phase_t5_operational_resilience.sql` must be applied to Supabase before deploying the application code so that the `provider_event_id` column and indices exist.

---

## 13. Recommended Production Rollout Sequence

1. **Step 1: Database Migration**:
   - Run migration `supabase/migrations/20260926000001_phase_t5_operational_resilience.sql` on the target database.
2. **Step 2: Environment Variables**:
   - Verify `BREVO_WEBHOOK_SECRET` and `RESEND_WEBHOOK_SECRET` are set.
   - Verify `CRON_SECRET` is set.
3. **Step 3: Deploy Application**:
   - Deploy branch `tech-fixes` to production.
4. **Step 4: Verify Health Endpoint**:
   - Issue `GET https://<prod-domain>/api/health` to confirm HTTP 200 and healthy database connectivity.
5. **Step 5: Register Webhook Endpoints**:
   - In Brevo Dashboard: Set webhook URL to `https://<prod-domain>/api/email/webhooks` for hard bounce and spam complaint events.
   - In Resend Dashboard: Set webhook URL to `https://<prod-domain>/api/email/webhooks` with Svix secret.
6. **Step 6: Update GitHub Actions**:
   - Ensure the updated `.github/workflows/notification-scheduler.yml` is active on default branch so the deprecated hourly retry cron ceases running.
