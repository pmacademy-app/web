/**
 * TEST 16 — an unavailable rate limiter must not become an unlimited email path.
 *
 * `evaluatePersistentRateLimit()` caught every database error and fell back to
 * `evaluateInMemoryRateLimit()`. That is a reasonable trade for a cheap read endpoint,
 * and the wrong one for anything that spends money: on serverless each cold instance
 * starts with an empty Map, so "degrade to memory" is operationally identical to
 * having no limit at all. An attacker who can make the limiter fail — or who simply
 * arrives during a database incident — gets an unmetered path to a paid provider.
 *
 * Callers that can cause an outbound send now pass `failClosed: true` and are rejected
 * instead. This file lives on its own because the other incident tests mock
 * `@/lib/rate-limit` wholesale; here the real module is the thing under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Incident 2026-09-09 — rate limiter failure is not an unlimited email path', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    // This file exercises the real persistent code path against a fully in-process
    // fake; the guard that normally routes test runs to the in-memory limiter (added
    // after a 2026-09-07 leak into production's `rate_limits` table) has to be lifted
    // for that. No network call or real credential is involved in any test here.
    process.env.ALLOW_TEST_DB_ACCESS = 'true'
  })

  afterEach(() => {
    vi.doUnmock('@/lib/supabase')
    process.env = { ...originalEnv }
  })

  it('rejects a fail-closed caller when the persistent limiter is unreachable', async () => {
    vi.doMock('@/lib/supabase', () => ({
      createServiceRoleClient: () => {
        throw new Error('connection refused')
      },
    }))
    const { evaluatePersistentRateLimit } = await import('../rate-limit')

    const result = await evaluatePersistentRateLimit('signup_ip:203.0.113.4', {
      limit: 5,
      windowMs: 60_000,
      failClosed: true,
    })

    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('rejects a fail-closed caller when the RPC itself errors', async () => {
    vi.doMock('@/lib/supabase', () => ({
      createServiceRoleClient: () => ({
        rpc: async () => ({ data: null, error: { message: 'statement timeout' } }),
      }),
    }))
    const { evaluatePersistentRateLimit } = await import('../rate-limit')

    const result = await evaluatePersistentRateLimit('email_global:governed', {
      limit: 20,
      windowMs: 3_600_000,
      failClosed: true,
    })

    expect(result.success).toBe(false)
  })

  it('treats a missing consume_rate_limit RPC as an outage, not as a pass', async () => {
    vi.doMock('@/lib/supabase', () => ({
      createServiceRoleClient: () => ({
        // Migration not applied: no decision comes back at all. Reading that as
        // "allowed" would silently disable every limit in the platform.
        rpc: async () => ({ data: null, error: null }),
      }),
    }))
    const { evaluatePersistentRateLimit } = await import('../rate-limit')

    const result = await evaluatePersistentRateLimit('signup_global', {
      limit: 15,
      windowMs: 3_600_000,
      failClosed: true,
    })

    expect(result.success).toBe(false)
  })

  it('still degrades to the in-memory limiter for callers that do not spend money', async () => {
    vi.doMock('@/lib/supabase', () => ({
      createServiceRoleClient: () => {
        throw new Error('connection refused')
      },
    }))
    const { evaluatePersistentRateLimit } = await import('../rate-limit')

    const result = await evaluatePersistentRateLimit(`read_path:${Date.now()}`, {
      limit: 5,
      windowMs: 60_000,
    })

    expect(result.success).toBe(true)
    expect(result).toHaveProperty('remaining')
  })

  it('enforces the limit atomically through the RPC when the database is healthy', async () => {
    const rows = new Map<string, { count: number; last: number }>()
    vi.doMock('@/lib/supabase', () => ({
      createServiceRoleClient: () => ({
        rpc: async (_fn: string, args: { p_key: string; p_limit: number; p_window_ms: number }) => {
          const row = rows.get(args.p_key)
          const now = Date.now()
          if (!row || now - row.last >= args.p_window_ms) {
            rows.set(args.p_key, { count: 1, last: now })
            return { data: [{ allowed: true, remaining: args.p_limit - 1, reset_in_ms: args.p_window_ms }], error: null }
          }
          if (row.count >= args.p_limit) {
            return { data: [{ allowed: false, remaining: 0, reset_in_ms: 1000 }], error: null }
          }
          row.count++
          return { data: [{ allowed: true, remaining: args.p_limit - row.count, reset_in_ms: 1000 }], error: null }
        },
      }),
    }))
    const { evaluatePersistentRateLimit } = await import('../rate-limit')

    const opts = { limit: 3, windowMs: 60_000, failClosed: true }
    const results = []
    for (let i = 0; i < 5; i++) {
      results.push(await evaluatePersistentRateLimit('signup_ip:198.51.100.1', opts))
    }

    expect(results.slice(0, 3).every((r) => r.success)).toBe(true)
    expect(results.slice(3).every((r) => !r.success)).toBe(true)
  })
})
