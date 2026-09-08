# ADR-006: Additive API error-response contract

## Status
Accepted

## Date
2026-09-08

## Context

Several routes returned `err.message` verbatim from their `catch` blocks, publishing exception text — including Postgres and GoTrue internals — to unauthenticated clients:

- `POST /api/auth/login` (outer catch)
- `POST /api/auth/signup` (provider-error branch and outer catch)
- `POST /api/auth/update-password` (provider-error branch)
- `POST /api/cron/process-broadcasts` (outer catch)
- `updatePasswordAction` in `app/(auth)/reset-password/actions.ts` — never rendered, since the page classifies before display, but a server action's return value is serialized to the browser and was visible in the network response.

The obvious fix is a structured envelope like `{ error: { code, message } }`. That would have broken every existing consumer: the auth screens read `json.error` as a **string** and re-classify it (`classifyAuthError(new Error(json.error))`), and `ResendVerificationCard` reads `data.code` at the top level.

## Decision

Extend the shape that already exists rather than replace it.

```
{ success: false, error: "<safe string>", code: "<stable code>", errorId?: "err_…" }
```

`error` stays a string, `code` stays top-level; `success` and `errorId` are added alongside. Route-specific fields (`requiresVerification`, `email`) pass through untouched.

Three helpers in `apps/web/lib/errors/api-response.ts`:

- `apiError()` — a known, already-safe condition.
- `apiInternalError()` — an unexpected exception. Records a structured incident (ADR-004) and returns generic copy plus an `errorId`. The exception never reaches the client. The id is generated locally rather than taken from the incident insert, so it still correlates when that write fails.
- `apiClassifiedAuthError()` — routes a provider/auth error through the existing `lib/auth/errors.ts` classifier, so auth errors keep **one** classification system. The provider's message is never forwarded, but the classifier's typed code and safe copy are, preserving the specific guidance the auth screens show.

On the client, `resolveApiAuthError()` reads the server's stable `code` instead of re-deriving one from the message.

### The one genuinely contested rule

Two requirements pull against each other:

- *Validation errors must stay specific* — favours keeping the server's copy. Discarding it turned `"Password is required."` into `"An unexpected authentication error occurred."`
- *Raw provider text must never be displayed* — favours discarding untrusted response text.

**Resolution: trust the server's copy only when the body also carries a `code`.** A `code` means the body came from this contract, which sanitises its message. A body without one is of unknown provenance, so its text is dropped in favour of classifier copy.

## Alternatives Considered

### Nested `{ error: { code, message } }`
- Rejected: breaks every current consumer, and no frontend changes were in scope at the time. Cleaner greenfield; not worth a coordinated break here.

### Return the classifier's copy for everything, ignoring the server message
- Rejected: loses specificity for platform codes the auth classifier does not own (`VALIDATION`, `SIGNUPS_DISABLED`).

### Generic copy for every failure, specific only in logs
- Rejected: a user who mistyped a password deserves to be told that, not "something went wrong."

## Consequences

- HTTP status codes are unchanged: 400 validation, 400 provider rejection, 401 expired recovery link, 403 signups disabled, 409 user exists, 500 unexpected.
- `classifyAuthError()` had to become **idempotent** for two codes. The screens re-classify whatever string they receive, and `AUTH_PASSWORD_TOO_WEAK` / `AUTH_PROVIDER_UNAVAILABLE` did not match their own copy — so returning classified text would silently have downgraded the specific password guidance to `AUTH_UNKNOWN_ERROR`. One matching pattern was added for each; no existing input reclassifies.
- The generic 500 copy for auth routes is deliberately phrased so it still classifies as `AUTH_PROVIDER_UNAVAILABLE`, keeping the screens on a retryable message. Pinned by a round-trip test.
- **Admin API routes were audited and deliberately left returning `err.message`.** They sit behind `requireAdminUser`, and the messages are diagnostic by design — the bulk-requeue and alerts-query failures were made loud on purpose. The two that embed database text now pass it through `sanitizeErrorMessage()` first (ADR-005). Bringing the remaining ~18 onto this contract is open work.
