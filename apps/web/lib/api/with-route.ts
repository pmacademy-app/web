import type { NextRequest } from 'next/server'

import { apiError, apiInternalError } from '@/lib/errors/api-response'
import { PublicError } from '@/lib/errors/public-error'
import type { ErrorDomain } from '@/lib/monitoring/error-taxonomy'
import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/monitoring/request-id'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'

import { resolveActor, type Actor, type ActorDenial, type ActorPolicy } from './actor'

/**
 * Canonical route contract wrapper (B7-B).
 *
 * 68 of 127 routes hand-roll the same preamble — resolve the caller, validate the
 * body, throttle, catch — and 68 are off the ADR-006 error contract, so a few
 * still return raw exception text to the client. The pieces to fix that already
 * exist (`resolveActor`, `lib/errors/api-response.ts`, `lib/rate-limit.ts`);
 * adoption is the gap. This wraps them into one declaration a route can make.
 *
 * What it owns, and nothing more:
 *   1. actor policy      — via `resolveActor`, fail-closed
 *   2. input validation  — body and query, against schemas the route declares
 *   3. rate limiting     — declarative rules, non-enumerating refusal
 *   4. the error envelope — ADR-006, with unexpected exceptions never reaching
 *                           the client
 *
 * What it deliberately does not own: business logic, authorization decisions
 * beyond the actor kind, and response shaping for the success path. A handler
 * returns its own `Response` and the wrapper passes it through untouched.
 *
 * Nothing imports this yet. Route migration is B7-C onwards.
 */

/**
 * An expected, already-safe failure raised by a handler.
 *
 * Distinct from an unexpected throw: this maps straight to its declared status and
 * code with no incident row and no `errorId`, because nothing went wrong with the
 * system — the request was simply refused. `message` must be copy we wrote, never
 * text from an exception, a provider, or the database.
 */
export class RouteError extends Error {
  readonly status: number
  readonly code: string
  readonly extra?: Record<string, unknown>

  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.name = 'RouteError'
    this.status = status
    this.code = code
    this.extra = extra
  }
}

/**
 * The shape this wrapper needs from a validator. Structural rather than a zod
 * import, so a route may bring any schema library that can `safeParse`.
 */
export interface ParseableSchema<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ message?: string }> } }
}

export interface RateLimitRule {
  /**
   * The bucket to charge, or `null` to skip this rule for this request — used
   * when the key's input is absent (no trusted IP, no authenticated user).
   */
  key: (context: { request: Request; actor: Actor; body: unknown; query: unknown }) => string | null
  limit: number
  windowMs: number
  /**
   * Reject rather than degrade to the process-local counter when the persistent
   * limiter cannot reach the database. Required on any path that can cause an
   * outbound provider send — see `lib/rate-limit.ts`.
   */
  failClosed?: boolean
}

export interface RouteHandlerContext<TBody, TQuery, TRequest extends Request = NextRequest> {
  /**
   * Typed as `NextRequest` by default because that is what Next.js passes a route
   * handler at runtime, so `cookies` and `nextUrl` are available without a cast.
   * The wrapper's own parameter stays the wider `Request`, which keeps unit tests
   * free to hand it a plain `Request`.
   */
  request: TRequest
  actor: Actor
  body: TBody
  query: TQuery
  /**
   * This request's correlation id (B9-B).
   *
   * Resolved once here and handed to the handler, rather than re-derived: a
   * generated id differs on every call, so deriving it twice would produce two
   * traces for one request. Safe to put in a log line — it is either ours or a
   * caller-supplied value that passed a strict allowlist.
   */
  requestId: string
  /**
   * Resolved dynamic segment params, `{}` for a static route.
   *
   * Typed as single values because this app has no catch-all segments — every
   * dynamic directory under `app/` is `[id]`, `[key]`, `[lessonId]`, `[module]`
   * or `[username]`. A catch-all (`[...slug]`) would yield an array and this type
   * would have to widen with it.
   */
  params: Record<string, string>
}

export interface WithRouteConfig<TBody, TQuery> {
  /** Mandatory. There is no default, because a default would make a route public by omission. */
  actor: ActorPolicy
  /** Stable operation name for incident correlation, e.g. `settings.profile.update`. */
  operation: string
  /** Incident domain. Defaults to `api`. */
  domain?: ErrorDomain
  /**
   * Stable one-line incident summary for an unexpected fault. Defaults to
   * `Unhandled exception in <operation>`.
   *
   * Worth setting when a route already had a specific summary before migration:
   * the summary feeds the incident fingerprint, so changing it silently splits a
   * failure's history in two. No ids — see the taxonomy's fingerprint rules.
   */
  summary?: string
  /**
   * Client-facing copy for an unexpected fault. Defaults to the generic
   * server-error message.
   *
   * The auth routes must set `AUTH_SERVICE_UNAVAILABLE_MESSAGE`: the auth screens
   * re-classify whatever string they receive, and that copy is phrased so it still
   * reads as `AUTH_PROVIDER_UNAVAILABLE` instead of collapsing to
   * `AUTH_UNKNOWN_ERROR`. ADR-006 pins this.
   */
  errorMessage?: string
  /** Machine-readable code for an unexpected fault. Defaults to `SERVER_ERROR`. */
  errorCode?: string
  body?: ParseableSchema<TBody>
  query?: ParseableSchema<TQuery>
  rateLimit?: RateLimitRule[]
  /**
   * Side effect to run when the **actor policy** refuses the request — and only
   * then. Validation failures, rate-limit refusals and handler faults do not
   * invoke it; those are not authorization events.
   *
   * It exists because four cron routes record an unauthorized attempt with
   * `logSystemError`, and that signal must survive migration to the wrapper. The
   * hook receives the denial's internal `reason`, which the client never sees.
   *
   * It cannot influence the response: the return value is ignored and a rejection
   * is swallowed, on the same principle as `apiInternalError`'s incident write —
   * instrumentation must never change the decision it is observing.
   */
  onDenied?: (context: { request: Request; denial: ActorDenial }) => void | Promise<void>
}

/** Next.js passes dynamic params as the second argument; in 15+ they are a promise. */
interface NextRouteContext {
  params?: Record<string, string> | Promise<Record<string, string>>
}

const UNAUTHORIZED_MESSAGE = 'Authentication required.'
const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.'
const RATE_LIMITED_MESSAGE = 'Too many requests. Please wait a while before trying again.'

function firstIssueMessage(error: { issues: Array<{ message?: string }> }, fallback: string): string {
  return error.issues[0]?.message || fallback
}

async function resolveParams(context?: NextRouteContext): Promise<Record<string, string>> {
  if (!context?.params) return {}
  return await context.params
}

/**
 * Evaluates every declared rule and refuses if any of them is exhausted.
 *
 * All rules are evaluated rather than short-circuiting on the first refusal, so
 * every bucket is charged consistently, and the refusal reports the longest reset
 * across them. The response never says which rule tripped: distinguishing an IP
 * limit from an email limit is an account-enumeration oracle, which is the hole
 * I-03-B6 closed on the login route.
 */
async function enforceRateLimits(
  rules: RateLimitRule[],
  context: { request: Request; actor: Actor; body: unknown; query: unknown }
): Promise<{ ok: true } | { ok: false; resetInMs: number }> {
  const charged = rules
    .map((rule) => ({ rule, key: rule.key(context) }))
    .filter((entry): entry is { rule: RateLimitRule; key: string } => Boolean(entry.key))

  if (charged.length === 0) return { ok: true }

  const results = await Promise.all(
    charged.map(({ rule, key }) =>
      evaluatePersistentRateLimit(key, {
        limit: rule.limit,
        windowMs: rule.windowMs,
        failClosed: rule.failClosed,
      })
    )
  )

  const refused = results.filter((result) => !result.success)
  if (refused.length === 0) return { ok: true }

  return { ok: false, resetInMs: Math.max(...refused.map((result) => result.resetInMs)) }
}

/**
 * Wraps a route handler in the canonical contract.
 *
 * Order of operations, and why: the actor is resolved first so an unauthenticated
 * flood is refused before it can consume limiter budget; input is validated next
 * so a rule may key on the parsed body, which is what the login and signup routes
 * need; the limiter runs last before the handler.
 */
export function withRoute<
  TBody = undefined,
  TQuery = undefined,
  TRequest extends Request = NextRequest,
>(
  config: WithRouteConfig<TBody, TQuery>,
  handler: (context: RouteHandlerContext<TBody, TQuery, TRequest>) => Promise<Response>
): (request: Request, context?: NextRouteContext) => Promise<Response> {
  return async function routeWithContract(request: Request, context?: NextRouteContext): Promise<Response> {
    // Resolved before anything else so every exit path below — refusal, validation
    // failure, throttle, handler response, unexpected fault — can carry it. The
    // proxy stamps this header on the routes it matches; the routes it does not
    // match (cron, the webhooks, health) still get an id here, which is the reason
    // this cannot live in the proxy alone.
    const requestId = resolveRequestId(request)

    try {
      // 1. Who is calling?
      const resolution = await resolveActor(request, config.actor)
      if (!resolution.ok) {
        if (config.onDenied) {
          // Awaited rather than fire-and-forget: on a serverless runtime the
          // response ends the invocation, so an un-awaited log can simply be
          // dropped — which is the one log you least want to lose.
          try {
            await config.onDenied({ request, denial: resolution })
          } catch (hookError) {
            console.error(`[withRoute] onDenied hook failed for ${config.operation}:`, hookError)
          }
        }

        // `resolution.reason` stays out of the response on purpose — a refusal
        // must not tell the caller which check refused it.
        return apiError({
          status: resolution.status,
          code: resolution.code,
          message: resolution.status === 401 ? UNAUTHORIZED_MESSAGE : FORBIDDEN_MESSAGE,
          requestId,
        })
      }
      const actor = resolution.actor

      // 2. Input. The body is read only when a schema is declared, so a route
      //    that wants the raw stream still gets it.
      let body = undefined as TBody
      if (config.body) {
        let raw: unknown
        try {
          raw = await request.json()
        } catch {
          return apiError({
            status: 400,
            code: 'VALIDATION',
            message: 'Invalid request body. JSON object expected.',
            requestId,
          })
        }

        const parsed = config.body.safeParse(raw)
        if (!parsed.success) {
          return apiError({
            status: 400,
            code: 'VALIDATION',
            message: firstIssueMessage(parsed.error, 'Invalid request body.'),
            requestId,
          })
        }
        body = parsed.data
      }

      let query = undefined as TQuery
      if (config.query) {
        // Repeated keys collapse to the last value. A route needing every value
        // of a repeated parameter should read `request.url` itself.
        const searchParams = new URL(request.url).searchParams
        const parsed = config.query.safeParse(Object.fromEntries(searchParams))
        if (!parsed.success) {
          return apiError({
            status: 400,
            code: 'VALIDATION',
            message: firstIssueMessage(parsed.error, 'Invalid query parameters.'),
            requestId,
          })
        }
        query = parsed.data
      }

      // 3. Throttling.
      if (config.rateLimit?.length) {
        const verdict = await enforceRateLimits(config.rateLimit, { request, actor, body, query })
        if (!verdict.ok) {
          return apiError({
            status: 429,
            code: 'RATE_LIMITED',
            message: RATE_LIMITED_MESSAGE,
            requestId,
            extra: { resetInMs: verdict.resetInMs },
          })
        }
      }

      // 4. The route's own work.
      const response = await handler({
        request: request as TRequest,
        actor,
        body,
        query,
        requestId,
        params: await resolveParams(context),
      })

      // Stamped on the success path too, so a request that behaved is as traceable
      // as one that did not. The handler's own headers are preserved; only this one
      // is added, and only when the handler did not already set it.
      if (!response.headers.has(REQUEST_ID_HEADER)) {
        response.headers.set(REQUEST_ID_HEADER, requestId)
      }
      return response
    } catch (cause) {
      // An expected refusal the handler raised: already-safe copy, no incident.
      if (cause instanceof RouteError) {
        return apiError({
          status: cause.status,
          code: cause.code,
          message: cause.message,
          requestId,
          extra: cause.extra,
        })
      }

      // A service-layer refusal whose copy is ours. Same treatment as
      // `RouteError` — the distinction between the two is only which layer
      // raised it, and the client must not be able to tell.
      if (cause instanceof PublicError) {
        return apiError({
          status: cause.status,
          code: cause.code,
          message: cause.message,
          requestId,
        })
      }

      // Anything else is a genuine fault. The exception is recorded as an
      // incident and the client receives generic copy plus a correlating id.
      return await apiInternalError({
        cause,
        domain: config.domain ?? 'api',
        operation: config.operation,
        summary: config.summary ?? `Unhandled exception in ${config.operation}`,
        requestId,
        ...(config.errorMessage ? { message: config.errorMessage } : {}),
        ...(config.errorCode ? { code: config.errorCode } : {}),
      })
    }
  }
}
