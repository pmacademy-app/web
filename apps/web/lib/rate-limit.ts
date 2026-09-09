/**
 * Memory-efficient, sliding-window rate limiter utility for Next.js API Routes.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

// Periodic garbage collection every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  const gc = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(key)
      }
    }
  }, 5 * 60 * 1000)
  if (gc.unref) {
    gc.unref()
  }
}

export interface RateLimitOptions {
  limit?: number
  windowMs?: number
  /**
   * What to do when the persistent limiter cannot reach the database.
   *
   * The default (`false`) degrades to the process-local in-memory counter, which is
   * the right trade for cheap read endpoints. It is the WRONG trade for anything that
   * spends money: on serverless every cold instance starts with an empty map, so
   * "fall back to memory" is effectively "no limit at all" — an attacker who can make
   * the limiter fail gets an unmetered email-sending path.
   *
   * Pass `true` on every path that can cause an outbound provider send. A limiter
   * outage then rejects the request instead of granting unlimited budget.
   */
  failClosed?: boolean
}

/**
 * Evaluates rate limit for a key (e.g. user_id or IP).
 * Returns { success: true } if under limit, or { success: false, remaining, resetInMs } if exceeded.
 */
export function evaluateInMemoryRateLimit(
  key: string,
  options: RateLimitOptions = {}
): { success: boolean; remaining: number; resetInMs: number } {
  const limit = options.limit ?? 30 // default 30 requests
  const windowMs = options.windowMs ?? 60 * 1000 // default 1 minute window

  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1, resetInMs: windowMs }
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetInMs: Math.max(0, entry.resetAt - now) }
  }

  entry.count++
  return { success: true, remaining: limit - entry.count, resetInMs: Math.max(0, entry.resetAt - now) }
}

/**
 * Hybrid Rate Limiter:
 * Uses in-memory Map in development for speed.
 * Uses persistent DB in production for durability across Vercel serverless functions.
 */
export async function evaluateRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<{ success: boolean; remaining: number; resetInMs: number }> {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return evaluateInMemoryRateLimit(key, options)
  }
  return evaluatePersistentRateLimit(key, options)
}


/**
 * Evaluates rate limit against the persistent PostgreSQL public.rate_limits table.
 * Fallback to in-memory evaluation if database is unreachable.
 */
export async function evaluatePersistentRateLimit(
  key: string,
  options: RateLimitOptions = {}
): Promise<{ success: boolean; remaining: number; resetInMs: number }> {
  const limit = options.limit ?? 1
  const windowMs = options.windowMs ?? 60 * 1000

  // Never touch the real `rate_limits` table from a test run. This is a hard
  // guard, not just a warning: a 2026-09-07 test run leaked real rows into
  // production here because a test's Supabase mock didn't happen to implement
  // `.upsert()` for this table, so the failure fell through to the in-memory
  // fallback via the try/catch below in that case — but nothing actually
  // prevented a differently-shaped mock (or a missing one) from succeeding
  // against live credentials instead. Route straight to the in-memory
  // limiter in test envs so correctness here never depends on every caller's
  // mock being complete.
  if (
    (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') &&
    process.env.ALLOW_TEST_DB_ACCESS !== 'true'
  ) {
    return evaluateInMemoryRateLimit(key, { limit, windowMs })
  }

  try {
    const { createServiceRoleClient } = await import('@/lib/supabase')
    const supabase = createServiceRoleClient()

    // Single-statement increment-and-check. The previous SELECT-then-UPDATE pair let
    // N concurrent requests all read the same count and all pass, so a burst could
    // exceed the limit by however many requests were in flight — precisely the shape
    // of a scripted signup flood.
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    })

    if (error) throw error

    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed?: boolean; remaining?: number; reset_in_ms?: number }
      | null
      | undefined

    if (!row || typeof row.allowed !== 'boolean') {
      // The RPC is the supported path; a missing/misshaped result means the migration
      // has not been applied. Treat it as a limiter outage rather than a pass.
      throw new Error('consume_rate_limit returned no decision (migration not applied?)')
    }

    return {
      success: row.allowed,
      remaining: Math.max(0, Number(row.remaining ?? 0)),
      resetInMs: Math.max(0, Number(row.reset_in_ms ?? windowMs)),
    }
  } catch (err) {
    if (options.failClosed) {
      // Deliberately NOT falling back to the in-memory counter. On serverless that
      // counter is per-instance and empty on every cold start, so for a path that can
      // spend provider credit it is indistinguishable from having no limit.
      console.error('[rate-limit] Persistent limiter unavailable on a fail-closed path — rejecting:', err)
      try {
        const { logErrorReport } = await import('@/lib/monitoring/logger')
        void logErrorReport({
          domain: 'db',
          kind: 'db_unavailable',
          operation: 'rate_limit.unavailable',
          summary: 'Persistent rate limiter unavailable; fail-closed path rejected the request',
          nextAction:
            'Requests that can send email are being refused until the rate_limits table and consume_rate_limit RPC are reachable. Check Supabase availability and that the latest migration is applied.',
          details: { detail: err instanceof Error ? err.message : String(err) },
        })
      } catch {
        // Never let instrumentation change the limiter decision.
      }
      return { success: false, remaining: 0, resetInMs: windowMs }
    }

    console.warn('[rate-limit] Persistent rate limit DB query failed, falling back to memory:', err)
    return evaluateInMemoryRateLimit(key, { limit, windowMs })
  }
}
