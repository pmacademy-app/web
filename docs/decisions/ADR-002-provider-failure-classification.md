# ADR-002: Provider failure classification

## Status
Accepted

## Date
2026-09-07

## Supersedes
The failover policy added on 2026-09-07 during the signup-abuse remediation, which is described in [`INCIDENT_2026-09-06_SIGNUP_ABUSE.md`](../archive/INCIDENT_2026-09-06_SIGNUP_ABUSE.md).

## Context

After the 2026-09-06 signup-abuse incident, `lib/email.ts` gained `isTransientProviderFailure()`, which allowed failover only for a missing status code or a 5xx. The stated reason was that failing over on quota exhaustion would move the same unbounded traffic onto the second provider instead of surfacing the real problem.

That predicate conflated two different concerns:

- *"Do not let a failover amplify abusive traffic."*
- *"Do not fail over when the provider is out of capacity."*

Brevo answers an exhausted allowance with **HTTP 402** (`not_enough_credits`) or **429**. Both are below 500, so both were classified permanent. With Brevo primary, a spent daily allowance therefore took signup verification and password reset down while a healthy Resend key sat idle — the precise failure the second provider exists to absorb.

Volume containment was never the failover predicate's job. It is enforced upstream, before any provider is called, by the pre-dispatch daily quota gate in `processEmailQueue()` and by signup rate limiting. Those caps bound total send volume, and therefore bound failover volume too.

## Amendment — 2026-09-09

The decision below is unchanged in intent, but its premise was incomplete and the gap
caused a second incident.

This ADR asserted that "Brevo answers an exhausted allowance with **HTTP 402** or
**429**". In production on 2026-09-09 Brevo answered `POST /v3/smtp/email` with an
ordinary **HTTP 400** carrying `{"code":"not_enough_credits"}`. 400 is classified
`permanent`, so failover was refused on every send and a healthy Resend key again sat
idle while auth mail stopped — the exact outcome this ADR was written to prevent,
reached through a status code it did not anticipate.

Classifying on the HTTP status alone is therefore not sufficient: for this one
condition the status actively misdescribes the failure. The signature is now
`classifyProviderFailure(statusCode?, providerCode?)`, and a provider error code that
reports capacity exhaustion (`isCapacityExhaustionSignal()`) outranks the status:

- Both provider classes and `lib/email.ts` now surface the provider's own `code`
  (Brevo) / `name` (Resend) as `providerCode` on every failed result.
- The matched vocabulary is deliberately narrow — credit/quota/plan/rate-limit terms
  only. `400 Invalid email address` remains `permanent`. This is not "4xx now fails
  over"; that would reintroduce the failure mode the 2026-09-07 policy guarded against.
- A capacity signal additionally marks the provider exhausted for the rest of the UTC
  day (`email_provider_quota`), so subsequent sends skip it rather than spending a
  request to rediscover it.

The table below still holds for the status-only case.

## Decision

A single shared classifier, `classifyProviderFailure(statusCode?, providerCode?)` in
`apps/web/lib/notifications/providers/failure-classification.ts`, returns one of three classes:

| Class | Statuses | Meaning |
|---|---|---|
| `failover` | no status (network/DNS/abort), 5xx, **402**, **408**, **429**, or any status carrying a provider capacity code | The provider cannot accept this message now. Try the other one. |
| `permanent` | 400, 401, 403, 404, 422 (without a capacity code) | Our payload or credentials are wrong. The other provider would reject it identically. |
| `retry` | anything else | Unrecognised. Retry this provider later; do not fail over. |

Both stacks use it: `sendEmailWithFailover()` directly, and `lib/email.ts` through `isFailoverEligibleFailure()`.

Provider classes report `statusCode` on every result. A request that produced no HTTP response reports 504 for a timeout and 503 for other network faults, so both stacks classify identically.

## Alternatives Considered

### Keep 402/429 permanent and alert instead
- Pros: an exhausted quota stays loudly visible rather than being absorbed.
- Cons: it is visible *and* mail has stopped. Failing over plus alerting (the incident is still raised as `provider_quota`, severity `critical` — see ADR-004) gives the same visibility without the outage.
- Rejected.

### Make failover configurable per status code
- Rejected: a settings surface for this invites misconfiguration of a safety property, and the repository already carries a history of settings that persist without a runtime consumer.

## Consequences

- The two assertions in `apps/web/lib/__tests__/email-fallback-failure-modes.test.ts` that pinned 402/429 as non-failover were inverted, in both directions, as part of this change.
- 401/403 map to `permanent` for failover purposes but to `config_missing` in the observability taxonomy (ADR-004) — a bad or revoked API key should page someone, not be retried.
- The classifier is intentionally separate from `classifyProviderFailureKind()` in `lib/monitoring/error-taxonomy.ts`. This one answers *"should we fail over?"*; that one answers *"what do we tell the operator?"*. Keeping them apart avoids a dependency from the monitoring layer into the notification layer.
