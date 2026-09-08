# ADR-001: Shared provider resolution and single-secondary-attempt failover

## Status
Accepted

## Date
2026-09-07

## Context

Outbound email ran through two independent stacks that each decided which provider to use:

- `apps/web/lib/email.ts` — direct transport used by the Supabase Auth hook, `/api/contact`, `/api/waitlist`, admin test send, and the local campaign scripts.
- `apps/web/lib/notifications/providers/` — a `ProviderRegistry` used by `processEmailQueue()`.

Two defects followed from that split:

1. **The queue had no failover at all.** `processEmailQueue()` resolved one provider via `getActiveEmailProvider()` and sent through it. On failure the item was deferred by `handleRetryableFailure()`, and the next run resolved *the same* provider again. `ResendProvider` was registered but was only ever selected when `PRIMARY_EMAIL_PROVIDER=resend` or `BREVO_API_KEY` was absent. A Brevo problem stalled the whole queue while a healthy Resend key sat unused. This was the actual cause of "Resend fallback isn't working" — not the fallback policy in `lib/email.ts`.

2. **The two stacks disagreed on the primary.** With `PRIMARY_EMAIL_PROVIDER` unset, `lib/email.ts` preferred Resend whenever a Resend key existed, while the registry preferred Brevo. Auth mail and queued mail could leave via different providers, meaning a different sender identity, different DKIM alignment, and bounce webhooks arriving at a provider that had not sent the message.

## Decision

One resolver and one failover helper, shared by both stacks.

- `resolvePrimaryProvider()` in `apps/web/lib/notifications/config.ts` is the single source of truth. Order: explicit `PRIMARY_EMAIL_PROVIDER` → Brevo when `BREVO_API_KEY` is set → Resend when `RESEND_API_KEY` is set → Brevo. Both stacks call it.
- `sendEmailWithFailover()` in `apps/web/lib/notifications/providers/index.ts` sends on the primary and, when the failure is failover-eligible (ADR-002), retries **once** on the other provider. Never a third attempt.
- The secondary is skipped unless `isConfigured()` returns true. Without an API key both provider classes short-circuit to a simulated success, so failing over to an unconfigured provider would report a delivery that never happened.
- `processEmailQueue()` dispatches through this helper. `lib/email.ts` keeps its own transport functions but uses the shared resolver and the shared classifier.

## Alternatives Considered

### Route `lib/email.ts` through the provider registry as well
- Pros: one transport, not two.
- Cons: the provider classes build the sender from `BRAND`, while `sendEmail()` accepts a per-call `fromEmail` and `replyTo` that the marketing campaign scripts depend on. Unifying them would have changed sender behaviour for those campaigns.
- Rejected for now: the split transport is acceptable once both sides share resolution and classification. Consolidating remains open.

### Retry the failed provider before failing over
- Rejected: the primary has already answered. For quota or configuration failures an immediate retry returns the same answer, and for an outage the queue's own backoff already provides delayed retries.

### Try every registered provider in a loop
- Rejected: with two providers it is the same as one secondary attempt, and an unbounded loop over a growing registry makes worst-case latency unpredictable inside a serverless request.

## Consequences

- Brevo quota exhaustion, 5xx, timeouts and network failures now reach Resend on both the auth path and the queue path.
- `email_queue` records which provider produced the outcome and every attempt (`provider`, `provider_attempts` — migration `20260907000001_email_provider_failover.sql`).
- Failover volume is bounded by the pre-dispatch daily quota gate and signup rate limiting, not by a circuit breaker. **No circuit breaker is implemented.** If sustained double-provider outages become a problem, one belongs in `sendEmailWithFailover()`.
- Environments that never set `PRIMARY_EMAIL_PROVIDER` may see their primary change from Resend to Brevo. `.env.example` sets it explicitly.
