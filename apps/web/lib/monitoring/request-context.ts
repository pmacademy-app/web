import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Ambient request context for logging (B9-C).
 *
 * B9-B put a correlation id on every request and handed it to the route handler.
 * That works while the id is one parameter away, but the paths this batch converts
 * are not: `processEmailQueue` is four calls below the cron handler and logs a
 * dozen times, and threading an id through every signature to reach it would be a
 * worse change than the one it enables.
 *
 * So the wrapper puts the id here for the duration of the request and the logger
 * reads it when a caller does not pass one explicitly. Nothing about B9-B changes —
 * this stores *that* id rather than deriving a second one, and an explicit
 * `requestId` field always wins.
 *
 * **Deliberately a separate module from `request-id.ts`.** That file is imported by
 * `proxy.ts`, which Next.js runs as middleware on the Edge runtime, where
 * `node:async_hooks` does not exist. Keeping the store here means the middleware
 * bundle never pulls it in. Do not import this from `proxy.ts`.
 *
 * Absence is normal and must stay harmless: a background job, a module-scope call
 * or a test has no request, and the logger simply omits the field.
 */

export interface RequestContext {
  requestId: string
}

const storage = new AsyncLocalStorage<RequestContext>()

/** Runs `fn` with `context` visible to everything it awaits. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

/** The current request's context, or `undefined` outside a request. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

/** The current request's correlation id, or `undefined` outside a request. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId
}
