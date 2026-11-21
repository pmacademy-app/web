import { log } from '@/lib/monitoring/log'

type Result = { error: unknown }

/**
 * A database refusal that means "this client may not do that": an RLS or grant
 * denial (42501) or an expired/invalid token (PostgREST PGRST301 / PGRST303).
 */
export function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === '42501' || code === 'PGRST301' || code === 'PGRST303'
}

/**
 * Runs a learner-owned write with the learner's own client first, so Row Level
 * Security checks it, and falls back to the service-role client only when the
 * database refuses it on permissions.
 *
 * The fallback is for the RLS rollout (docs/ops/backend-phase3-plan.md): the
 * policies were read from the migrations, not tested against production. If one
 * is missing, the learner's action still works exactly as before (every caller
 * still filters by the session user id) and `db.learner_write_fallback` in the
 * logs names the operation to fix. Once those logs stay empty the fallback can go.
 */
export async function learnerFirst<T extends Result>(
  operation: string,
  learnerDb: unknown,
  serviceDb: unknown,
  run: (db: never) => PromiseLike<T>
): Promise<T> {
  const first = await run(learnerDb as never)
  if (learnerDb === serviceDb || !first.error || !isPermissionDenied(first.error)) return first

  log.warn('db.learner_write_fallback', {
    operation,
    code: String((first.error as { code?: unknown }).code ?? ''),
  })
  return run(serviceDb as never)
}
