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
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) {
        rateLimitMap.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

export interface RateLimitOptions {
  limit?: number
  windowMs?: number
}

/**
 * Evaluates rate limit for a key (e.g. user_id or IP).
 * Returns { success: true } if under limit, or { success: false, remaining, resetInMs } if exceeded.
 */
export function evaluateRateLimit(
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
