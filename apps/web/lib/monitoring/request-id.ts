/**
 * The request correlation id (B9-B).
 *
 * One value that identifies a single request from the proxy, through the route
 * handler, into any incident it produces. Before this there was no way to tie a
 * `system_errors` row to the request that caused it: an incident recorded what went
 * wrong and where, but not *which call* it happened on, so two learners hitting the
 * same broken endpoint a second apart were indistinguishable in the record.
 *
 * ## It is not the same thing as `errorId`, and does not replace it
 *
 * `errorId` identifies one *failure* and is minted by `apiInternalError` when an
 * unexpected exception is caught. It is what a learner quotes to support. A request
 * id identifies one *request*, exists whether or not anything failed, and is the
 * same value across every log line and incident that request produced. A failing
 * request has both, and the incident carries both, which is what lets an operator
 * go from a support ticket to the surrounding activity.
 *
 * ## Trust
 *
 * An inbound `x-request-id` is accepted so a caller that already has a trace id
 * (a load test, a client retry, a future upstream service) keeps it across the
 * boundary. It is **not trusted for anything**: it is never an authorization input,
 * never selects a code path, and never reaches the database as anything but an
 * opaque diagnostic string. There is no trusted upstream proxy in front of this app
 * that could strip the header, so treating the value as authentic would be wrong —
 * it is a correlation aid and nothing more.
 *
 * What it *is* protected against is becoming unsafe log content. The validator
 * below is an allowlist: the value must be short and drawn from an alphabet with no
 * whitespace, newlines, control characters or quoting metacharacters, so a hostile
 * header cannot forge extra log lines, inject ANSI escapes into an operator's
 * terminal, break out of a JSON string, or bloat `system_errors` rows. Anything that
 * fails the check is discarded silently and a fresh id is generated — the request is
 * never refused over it, because a malformed trace header is not the caller's
 * problem to solve and refusing would turn observability into an availability risk.
 */

/** The header this app reads and emits. Lowercase, per HTTP/2 convention. */
export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Accepted shape of an inbound id.
 *
 * Deliberately narrow: alphanumerics, dash and underscore only. That admits every
 * common trace format (UUID, ULID, nanoid, hex) while excluding whitespace,
 * newlines, control and escape characters, quotes, and anything else that would
 * change the meaning of a log line it is interpolated into. The 8–128 bound stops a
 * degenerate one-character id and a multi-kilobyte one alike.
 */
const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/

/** Generates a fresh id. Prefixed so it is recognisable as ours in a mixed trace. */
export function generateRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, '')}`
}

/**
 * Returns the inbound id if it is usable, otherwise `null`.
 *
 * Exported for the tests and for the proxy, which needs to distinguish "the caller
 * supplied one" from "we minted one" when deciding what to forward.
 */
export function readInboundRequestId(headers: Headers): string | null {
  const raw = headers.get(REQUEST_ID_HEADER)
  if (!raw) return null
  const trimmed = raw.trim()
  return VALID_REQUEST_ID.test(trimmed) ? trimmed : null
}

/**
 * The correlation id for this request: the caller's if it is well-formed, ours
 * otherwise.
 *
 * Safe to call more than once per request — but callers that need the *same* value
 * twice should pass it along rather than re-deriving, since a generated id differs
 * on each call. `withRoute` resolves once and puts the result in the handler
 * context for exactly that reason.
 */
export function resolveRequestId(request: { headers: Headers }): string {
  return readInboundRequestId(request.headers) ?? generateRequestId()
}
