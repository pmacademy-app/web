/**
 * An error whose message is safe to show the caller.
 *
 * `RouteError` (B7-B) already expresses "this refusal is expected and its copy is
 * ours" — but only a route handler can throw it, because it lives next to the
 * wrapper. The service layer has the same need: `addFriend` raising
 * `Learner "ada" not found.` is deliberate, user-facing copy, and before B7-E the
 * only way it reached the UI was the route re-publishing `err.message` verbatim —
 * the very pattern N-3 closed on the settings routes.
 *
 * So the distinction the wrapper needs is not "where was this thrown" but "was
 * this message written by us". A service raises `PublicError` when it was, and a
 * plain `Error` when it was not; `withRoute` publishes the first and replaces the
 * second with generic copy plus an incident id. A service that says nothing keeps
 * the safe default.
 *
 * Deliberately free of any Next.js or route import so the data layer can throw it
 * without dragging the request stack into its module graph.
 *
 * The same rule as `RouteError` applies to the message: copy we wrote, never text
 * from an exception, a provider, or the database.
 */
export class PublicError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message)
    this.name = 'PublicError'
    this.status = options?.status ?? 400
    this.code = options?.code ?? 'VALIDATION'
  }
}
