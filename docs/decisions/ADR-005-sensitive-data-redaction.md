# ADR-005: Two-layer redaction for the error pipeline

## Status
Accepted

## Date
2026-09-08

## Context

The error pipeline persists provider error bodies, exception messages, Supabase errors, and queue template variables into `system_errors`, `email_dead_letter` and `notification_events`, all readable by any admin. Redaction was a single regex list applied to the `message` string only.

Gaps found:

- **No Brevo rule.** The list covered Resend's `re_` prefix but not `xkeysib-` / `xsmtpsib-`. Brevo is the primary provider, so a provider error body echoing the `api-key` header persisted a live production credential.
- **`details` was written raw.** Anything a caller put in the details object — a stringified request, a provider payload — bypassed redaction entirely.
- **One-time auth credentials were persisted.** `handlePermanentFailure()` writes `template_variables` into `email_dead_letter`. For `auth.verify_email` / `auth.password_reset` those variables carry `verificationUrl` / `resetUrl` with a live `token_hash` — an account-takeover credential in a long-lived, admin-readable table. (Before the dead-letter context fix these were always `{}`; threading the real variables through for diagnosability is what exposed them.)
- **No coverage** for database connection strings, `Authorization`/cookie headers, session tokens, or JWTs (the shape of a Supabase service-role key).

## Decision

One implementation in `apps/web/lib/monitoring/redaction.ts`, applying **two independent layers**, because either alone is bypassable:

1. **By value shape** — ordered regexes. Prefix-recognisable credentials run first so the marker records *which kind* of secret was present (`whsec_[REDACTED]` is more useful to an operator than a bare `[REDACTED]`); generic `key=value` rules run after and skip values an earlier rule already redacted, which makes sanitisation idempotent. Covers `xkeysib-`, `xsmtpsib-`, `re_`, `whsec_`, `sk_live/test`, JWTs, Svix `v1,` signatures, `postgres://user:pass@` credentials, `Authorization` and cookie headers, `sb-access-token` / `sb-refresh-token`, and auth tokens in URLs and query strings (`token_hash`, `access_token`, `otp`, …).

2. **By key name** — for structured payloads. A token in an unanticipated format (an opaque string with no recognisable prefix) survives the regexes but is caught because of where it sits in the object. An explicit allowlist protects the fields operators triage by (`templateKey`, `authAction`, `statusCode`, `errorId`, `queueId`, `maskedEmail`), which a naive `/key/i` deny-list would have stripped.

Applied at three boundaries: `logErrorReport()` / `logSystemError()` message and details; the `email_dead_letter` and `notification_events` writes in the queue processor; and `apiError()`'s outgoing user-facing message.

**Emails are masked, not dropped.** `j***e@corp-mail.co.uk` keeps the recipient domain, which is what identifies a failing destination.

## Alternatives Considered

### Allowlist fields instead of redacting values
- Pros: fail-closed by construction.
- Cons: `details` is deliberately free-form so a call site can record whatever made the failure legible. An allowlist would either be permanently incomplete or force every new diagnostic through a schema change.
- Rejected, but the key-name layer gives most of the benefit.

### Redact only at the persistence boundary
- Rejected: `console.error` output reaches the platform log drain, which is a second copy with its own access model.

### Drop emails entirely rather than masking
- Rejected: the domain is the diagnostic. Over-redaction destroys the reason the pipeline exists.

## Consequences

- Sanitisation is idempotent; re-sanitising a redacted string is a no-op. Covered by test.
- Dead-letter records keep variable *names* and non-sensitive values, so they stay diagnosable, but a dead-lettered auth email can no longer be replayed with its original token. That is the intended trade: those tokens expire, and a replay should mint a fresh one.
- `notification_events.payload` masks the recipient and redacts variables; `toEmail` is no longer stored in full.
- `apiError()` sanitises the outgoing message as a last line of defence. `extra` is deliberately **not** sanitised — routes legitimately echo the requester's own email there for the resend-verification flow.
- Verified by `apps/web/lib/__tests__/sensitive-data-redaction.test.ts`, which asserts representative live-shaped credentials are absent from console output, both `system_errors` entry points, and API response bodies.
