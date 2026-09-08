# Application Error Monitoring & Alerting — Prodily PM Academy

**Repository:** `prodily-monorepo` (app code at `apps/web/`)
**Last Updated:** September 8, 2026  

---

## 1. Overview & Logging Architecture

Operational failures are recorded in `public.system_errors` by `lib/monitoring/logger.ts`.

Two entry points, one persistence path:

- **`logErrorReport(report)`** — the structured entry point. Takes a typed `ErrorReport` (`lib/monitoring/error-taxonomy.ts`). Use this for new instrumentation.
- **`logSystemError(options)`** — the original signature, retained as an adapter so the ~40 existing call sites work unchanged. They gain deduplication, redaction and fingerprint stabilisation for free.

### Taxonomy

| Dimension | Values |
|---|---|
| `domain` | `email`, `auth`, `queue`, `admin`, `db`, `webhook`, `cron`, `api` |
| `kind` | `provider_quota`, `provider_outage`, `provider_timeout`, `provider_rejected`, `config_missing`, `auth_failed`, `db_unavailable`, `validation`, `unexpected` |
| `retryability` | `auto_retrying`, `manual_retry`, `terminal` |
| `severity` | `critical`, `error`, `warning` — **derived from `kind`, never passed in** |

Severity being derived is the point: it was previously assigned by hand, so every provider blip was `critical` while a permanent bad-key 401 was `warning`. One documented escalation — `provider_outage` / `provider_timeout` become `critical` when `allProvidersFailed` is set, since a single-provider outage is covered by failover but losing both means mail has stopped.

A report also carries `subject` (userId, queueId, broadcastId, templateKey, masked email), `provider` (name, statusCode, externalId, attempt) and `nextAction` — the operator guidance the alerts UI renders as the card's primary line.

`category` is retained for backward compatibility and for the admin console's existing filters: email failures report the provider name (`brevo` / `resend`), everything else reports its domain.

### Instrumented paths

`/api/auth/send-email-hook` and `lib/email.ts` (auth and direct transactional delivery), both provider classes, `sendEmailWithFailover` (the `email.failover_exhausted` escalation), the queue's dead-letter and degraded-claim paths, feature-flag hydration and persistence failures, and the admin alerts-query and bulk-requeue failures.

Until September 2026 the auth path emitted only `console.error`, so the platform's most business-critical email path produced no rows at all.

---

## 2. Redaction & Deduplication

### Redaction

`lib/monitoring/redaction.ts` is the single implementation, applied to messages, to `details` (recursively), and to the outgoing message of `apiError()`. It works in two layers — by value shape and by key name — because either alone is bypassable. Full rationale and coverage: [ADR-005](decisions/ADR-005-sensitive-data-redaction.md).

Covers provider keys (`xkeysib-`, `xsmtpsib-`, `re_`), webhook secrets (`whsec_`, Svix `v1,`), JWTs (the shape of a Supabase service-role key), database connection credentials, `Authorization` and cookie headers, session tokens, one-time auth tokens in URLs (`token_hash`, `access_token`, `otp`), and passwords in both `key=value` and JSON form. Email addresses are **masked**, not dropped, so the recipient domain stays diagnosable.

Structured payloads are additionally redacted by key name, with an allowlist protecting the fields operators triage by (`templateKey`, `authAction`, `statusCode`, `errorId`, `queueId`, `maskedEmail`).

Sanitisation is idempotent: prefix rules run first so the marker records which *kind* of secret was present, and later generic rules skip values already redacted.

### Deduplication

- An MD5 fingerprint is computed from `domain:kind:operation:stabilizedSummary`. `stabilizeForFingerprint()` collapses uuids, emails, timestamps and long digit runs, so legacy call sites that interpolate ids into their message still group.
- Repeats inside a **15-minute** window increment the stored `occurrence_count` instead of inserting a new row.
- Critical incidents fan out an admin in-app notification at most **once per fingerprint per hour**, dispatched in parallel.

`summary` must be a stable sentence with no ids in it — identifiers belong in `subject`. An id in the summary gives every occurrence its own fingerprint and turns one outage into one alert per affected user.

---

## 3. Admin System Alerts Interface (`/admin/system`)

- **UI View**: `components/admin/AdminSystemAlertsView.tsx`
- **API Handler**: `app/api/admin/system/alerts/route.ts`
- **Server-side filters**: status, severity, category.
- **Client-side facets**: kind, retryability, provider — applied over the loaded window (the fetch requests the API's 100-row maximum). They are not server filters because kind and retryability are not query parameters and provider lives inside the JSONB `details`.
- **Displays**: kind and retryability chips, occurrence count, first-seen for repeated incidents, `nextAction`, and a context row (template, queue, user, masked recipient, provider status, provider id). All values shown are the sanitized ones written at log time.
- **Actions**: Acknowledge and Resolve.
- A failed alerts query returns `500 ALERTS_QUERY_FAILED` and the view renders an error state. It must never render as the empty "no alerts" state — that made a broken monitoring pipeline indistinguishable from a healthy system.

---

## 4. Status Summary

| Monitoring Subsystem | Location | Status |
|---|---|---|
| **Structured taxonomy (`logErrorReport`)** | `lib/monitoring/error-taxonomy.ts`, `lib/monitoring/logger.ts` | 🟡 Implemented — production verification pending |
| **Legacy adapter (`logSystemError`)** | `lib/monitoring/logger.ts` | 🟢 Verified in Production |
| **Redaction (message + details + API responses)** | `lib/monitoring/redaction.ts` | 🟡 Implemented — production verification pending |
| **Fingerprint dedup with `occurrence_count`** | `lib/monitoring/logger.ts` | 🟡 Implemented — production verification pending |
| **`public.system_errors` schema** | `supabase/migrations/20260810000009_*.sql`, `20260908000001_error_taxonomy.sql` | 🟡 Migration `20260908000001` must be applied |
| **Admin System Alerts UI** | `components/admin/AdminSystemAlertsView.tsx` | 🟡 Implemented — production verification pending |
| **Auth & provider email instrumentation** | `lib/email.ts`, `/api/auth/send-email-hook`, provider classes | 🟡 Implemented — production verification pending |

---

## 5. Related Decisions

- [ADR-004: Structured error taxonomy with derived severity](decisions/ADR-004-structured-error-taxonomy.md)
- [ADR-005: Two-layer redaction for the error pipeline](decisions/ADR-005-sensitive-data-redaction.md)
