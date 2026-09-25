import { requireAdminUser } from '@/lib/admin/guard'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { secretsMatch } from '@/lib/security/constant-time'

/**
 * Canonical actor resolution (B7-A).
 *
 * Who is making this request? Today that question is answered in three unrelated
 * places — `getAuthenticatedUserFromRequest`, `requireAdminUser`, and six
 * hand-copied `CRON_SECRET` comparisons in `app/api/cron/*` — so there is nowhere
 * to add a policy and no way to be sure every route answers it the same way.
 *
 * This module is that one place. It **delegates** to the existing helpers rather
 * than reimplementing them: `requireAdminUser` keeps its database re-read of
 * `is_admin` and its audit logging, and `getAuthenticatedUserFromRequest` keeps
 * its bearer/cookie/refresh resolution. What is added here is a declarative
 * policy, a fail-closed precedence order, and a constant-time secret comparison.
 *
 * Nothing imports this yet. `withRoute` (B7-B) is its first consumer, and route
 * migration happens in B7-C onwards.
 *
 * **Deliberately not modelled: `webhook`.** The roadmap lists it, but the only
 * webhook surfaces (`app/api/auth/send-email-hook`, `app/api/email/webhooks`)
 * authenticate by HMAC over the *raw request body*. A resolver that reads the body
 * would consume the stream the route still needs, and lifting that verification
 * here would mean reimplementing it — which this batch exists to avoid. Those
 * routes keep their own verification until a body-aware policy is designed.
 */

export const ACTOR_KINDS = ['anonymous', 'learner', 'admin', 'cron'] as const

export type ActorKind = (typeof ACTOR_KINDS)[number]

/**
 * The resolved caller. A discriminated union so a handler that has narrowed to
 * `admin` can reach `userId` without a cast, and one that has not cannot.
 */
export type Actor =
  | { kind: 'anonymous' }
  | { kind: 'learner'; userId: string; email: string | null }
  | { kind: 'admin'; userId: string; email: string }
  | { kind: 'cron' }

export interface ActorPolicy {
  /**
   * Kinds this route accepts. Mandatory and non-empty: there is no default,
   * because a default would silently make an unannotated route public.
   *
   * The non-empty tuple type rejects `allow: []` at compile time. The runtime
   * guard in `resolveActor` stays regardless, for a policy built dynamically or
   * reached from untyped JavaScript.
   */
  allow: readonly [ActorKind, ...ActorKind[]]
}

export type ActorDenial = {
  ok: false
  /** 401 when no credential identified the caller, 403 when one did but it was insufficient. */
  status: 401 | 403
  code: 'UNAUTHORIZED' | 'FORBIDDEN'
  /**
   * Internal-only explanation. Never returned to a client — the enumeration fix
   * in I-03-B6 means a refusal must not say which check refused it.
   */
  reason: string
}

export type ActorResolution = { ok: true; actor: Actor } | ActorDenial

/** Extracts a bearer token, accepting either header casing as the cron routes do. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.*)$/i.exec(header)
  return match ? match[1].trim() : null
}

/**
 * True only when a cron secret is configured AND the request presents it.
 *
 * The configured-secret check comes first and is absolute: an unset or empty
 * `CRON_SECRET` must never authenticate anyone. Treating "no secret configured"
 * as "no check required" is the classic way a scheduled-job endpoint becomes an
 * unauthenticated one.
 */
function isCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false

  const provided = bearerToken(request)
  if (!provided) return false

  return secretsMatch(provided, expected)
}

function deny(status: 401 | 403, reason: string): ActorDenial {
  return {
    ok: false,
    status,
    code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
    reason,
  }
}

async function resolve(request: Request, allow: ReadonlySet<ActorKind>): Promise<ActorResolution> {
  // Strongest credential first, but each step is gated on the policy actually
  // accepting that kind — a route that does not accept cron never has its
  // Authorization header compared against the cron secret.
  if (allow.has('cron') && isCron(request)) {
    return { ok: true, actor: { kind: 'cron' } }
  }

  if (allow.has('admin')) {
    // If the route strictly requires admin (neither learner nor anonymous is allowed),
    // an unauthorized attempt is a genuine access denial on an admin endpoint and must be audited.
    // If the route allows other roles (dual-role: learner + admin), testing for admin is merely
    // role discovery; non-admins are permitted and must not produce false-positive access_denied audit logs.
    const isStrictlyAdminRoute = !allow.has('learner') && !allow.has('anonymous')
    const admin = await requireAdminUser(request, { silent: !isStrictlyAdminRoute })
    if (admin.authorized && admin.userId) {
      return { ok: true, actor: { kind: 'admin', userId: admin.userId, email: admin.email ?? '' } }
    }

    // Only refuse here if there is nothing weaker left to try. A policy of
    // `['admin', 'learner']` must still resolve an authenticated non-admin as a
    // learner rather than rejecting them.
    if (!allow.has('learner') && !allow.has('anonymous')) {
      return deny(admin.statusCode === 403 ? 403 : 401, admin.error ?? 'admin check failed')
    }
  }

  if (allow.has('learner')) {
    const user = await getAuthenticatedUserFromRequest(request)
    if (user?.id) {
      return { ok: true, actor: { kind: 'learner', userId: user.id, email: user.email ?? null } }
    }
  }

  if (allow.has('anonymous')) {
    return { ok: true, actor: { kind: 'anonymous' } }
  }

  return deny(401, 'no allowed actor kind matched')
}

/**
 * Per-request, per-policy memoization.
 *
 * `getAuthenticatedUserFromRequest` and `requireAdminUser` already memoize on the
 * `Request` instance; this keeps that property at the layer above, so a route and
 * its wrapper asking the same question twice costs one resolution. Keyed on the
 * Request object, so it is collected with the request.
 */
const resolutionCache = new WeakMap<Request, Map<string, Promise<ActorResolution>>>()

function policyKey(allow: ReadonlySet<ActorKind>): string {
  return ACTOR_KINDS.filter((kind) => allow.has(kind)).join(',')
}

/**
 * Resolves the actor behind a request against a policy.
 *
 * Fail-closed by design: an unrecognised credential resolves to `anonymous` when
 * the policy permits it and is refused otherwise — it is never escalated. The
 * policy is mandatory; there is no public default.
 *
 * @throws if `policy.allow` is empty, which is a programming error rather than an
 *         authorization outcome — an empty policy can accept nobody.
 */
export function resolveActor(request: Request, policy: ActorPolicy): Promise<ActorResolution> {
  if (!policy?.allow?.length) {
    throw new Error('resolveActor: policy.allow must list at least one actor kind')
  }

  const allow = new Set<ActorKind>(policy.allow)
  const key = policyKey(allow)

  let byPolicy = resolutionCache.get(request)
  if (!byPolicy) {
    byPolicy = new Map()
    resolutionCache.set(request, byPolicy)
  }

  const cached = byPolicy.get(key)
  if (cached) return cached

  const promise = resolve(request, allow)
  byPolicy.set(key, promise)
  return promise
}

/**
 * The user id behind a `learner` or `admin` actor.
 *
 * Every route whose policy is learner- or admin-only needs this id, and the
 * discriminated union means reading `actor.userId` requires narrowing at each
 * call site. This does the narrowing once.
 *
 * It throws for `anonymous` and `cron`, which is unreachable under such a policy.
 * The throw exists so that a route which later widens its policy without updating
 * its handler fails loudly, rather than silently querying the database for an
 * empty id.
 */
export function requireUserId(actor: Actor): string {
  if (actor.kind === 'learner' || actor.kind === 'admin') return actor.userId
  throw new Error(`requireUserId: actor kind '${actor.kind}' carries no user id`)
}

/**
 * The identity behind an `admin` actor.
 *
 * The admin routes need both fields — `userId` and `email` are what
 * `logAdminAction` records in `admin_audit_logs` — and reading them off the union
 * requires narrowing at every call site.
 *
 * It throws for any other kind, which is unreachable under an admin-only policy.
 * The throw is what stops a widened policy from silently writing an audit row
 * attributed to the wrong actor.
 */
export function requireAdmin(actor: Actor): { userId: string; email: string } {
  if (actor.kind !== 'admin') {
    throw new Error(`requireAdmin: actor kind '${actor.kind}' is not an admin`)
  }
  return { userId: actor.userId, email: actor.email }
}
