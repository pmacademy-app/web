# ADR-004: Structured error taxonomy with derived severity

## Status
Accepted

## Date
2026-09-08

## Context

`logSystemError()` recorded a free-text `message`, an 8-value `category`, an `operation`, and a hand-assigned `severity`. An operator could not reliably answer *what failed, why, which user was affected, which provider caused it, and what to do about it* from a row.

Concrete symptoms:

- **Severity carried no information.** Every Brevo and Resend failure was written as `critical`, including a single transient timeout that the queue would retry. Meanwhile a permanent bad-key 401 from the auth hook was `warning`. Filtering by severity told you nothing.
- **`category` was the only machine-readable dimension.** Everything else lived in an English sentence.
- **The most valuable path wrote nothing.** `/api/auth/send-email-hook` and `lib/email.ts` — the path carrying signup verification and password reset — emitted only `console.error` on delivery failure. Zero rows, zero alerts.
- **Brevo failures wrote nothing either.** `system_errors.category` had a `CHECK` constraint that omitted `'brevo'`, while the logger had been emitting that category since the Brevo provider was added. Every insert violated the constraint and was swallowed by the logger's warn-and-continue path, so the primary provider appeared instrumented while producing no rows.
- **Deduplication broke under load.** The 15-minute lookup used `.maybeSingle()` on a filter that can match many rows. PostgREST answers a multi-row `maybeSingle` with an error and null data; the error was discarded, so a duplicate was inserted, which made the next lookup match more rows. Dedup stopped working from the second occurrence onward — exactly during the sustained outages it exists for.

## Decision

A typed `ErrorReport` in `apps/web/lib/monitoring/error-taxonomy.ts` with three dimensions:

- **`domain`** — `email` | `auth` | `queue` | `admin` | `db` | `webhook` | `cron` | `api`
- **`kind`** — `provider_quota` | `provider_outage` | `provider_timeout` | `provider_rejected` | `config_missing` | `auth_failed` | `db_unavailable` | `validation` | `unexpected`
- **`retryability`** — `auto_retrying` | `manual_retry` | `terminal`

plus `operation`, a stable `summary`, a `subject` (userId, queueId, broadcastId, templateKey, masked email), a `provider` block (name, statusCode, externalId, attempt), and a `nextAction`.

Two rules make it useful rather than decorative:

1. **Severity is derived from `kind`, never passed in.** `deriveSeverity()` owns the mapping. One documented escalation: `provider_outage` / `provider_timeout` become `critical` when `allProvidersFailed` is set, because a single-provider outage is covered by failover but losing both means mail has stopped.

2. **`summary` is a stable sentence with no ids in it.** Identifiers go in `subject`. Fingerprints are built from the summary, so an interpolated id gives every occurrence its own fingerprint and defeats deduplication — which is how one outage becomes one alert per affected user.

Supporting changes: `stabilizeForFingerprint()` collapses uuids, emails, timestamps and long digit runs so legacy call sites that interpolate ids still group; the dedup lookup orders and takes one row and increments `occurrence_count`; critical alerts fan out at most once per fingerprint per hour and are dispatched in parallel.

`logSystemError()` keeps its original signature as an adapter over the same persistence path, so the ~40 existing call sites work unchanged and gain dedup, redaction and fingerprint stabilisation.

## Alternatives Considered

### Keep hand-assigned severity, document a convention
- Rejected: the previous state *was* a convention, and it drifted at every call site. Deriving it is the only way it stays consistent.

### Replace `logSystemError()` everywhere
- Rejected as churn without behaviour change. New instrumentation uses `logErrorReport()`; the adapter carries the rest.

### An external error tracker (Sentry or similar)
- Not evaluated as part of this work. `system_errors` is already the admin console's data source and already has RLS, retention and an audit story. Adding a vendor is a separate decision.

## Consequences

- Migration `20260908000001_error_taxonomy.sql` adds `domain`, `kind`, `retryability`, `next_action`, `occurrence_count`, `first_seen_at`, and **widens the `category` CHECK** so `'brevo'` and the domain values are writable.
- All new columns are nullable and `category` keeps its meaning (provider name for email failures, domain otherwise), so legacy rows and existing admin filters stay valid.
- The admin alerts view surfaces kind, retryability, occurrence count, first-seen and next action, and facets on kind / retryability / provider. Those three facets are applied client-side over the loaded window: kind and retryability are not query parameters and provider lives inside the JSONB `details`, so server-side faceting would require API changes not made here.
