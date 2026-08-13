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
  if (process.env.NODE_ENV === 'development') {
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
  const now = Date.now()

  try {
    const { createServiceRoleClient } = await import('@/lib/supabase')
    const supabase = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: selectError } = await (supabase.from('rate_limits' as any) as any)
      .select('key, last_requested_at, count')
      .eq('key', key)
      .maybeSingle()

    if (selectError) {
      throw selectError
    }

    if (existing) {
      const lastTime = new Date(existing.last_requested_at).getTime()
      const elapsed = now - lastTime

      if (elapsed < windowMs) {
        if (existing.count >= limit) {
          return {
            success: false,
            remaining: 0,
            resetInMs: Math.max(0, windowMs - elapsed),
          }
        }
        
        const newCount = existing.count + 1
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('rate_limits' as any) as any)
          .update({ count: newCount, updated_at: new Date().toISOString() })
          .eq('key', key)

        return {
          success: true,
          remaining: limit - newCount,
          resetInMs: Math.max(0, windowMs - elapsed),
        }
      }
    }

    // Upsert fresh record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('rate_limits' as any) as any).upsert({
      key,
      last_requested_at: new Date(now).toISOString(),
      count: 1,
      updated_at: new Date(now).toISOString(),
    })

    return {
      success: true,
      remaining: limit - 1,
      resetInMs: windowMs,
    }
  } catch (err) {
    console.warn('[rate-limit] Persistent rate limit DB query failed, falling back to memory:', err)
    return evaluateRateLimit(key, { limit, windowMs })
  }
}
