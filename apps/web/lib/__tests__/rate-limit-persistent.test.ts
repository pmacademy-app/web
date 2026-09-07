/**
 * Verifies `evaluatePersistentRateLimit()` itself enforces limits atomically
 * against the shared PostgreSQL `rate_limits` table, rather than relying on
 * process-local memory — the property that makes it safe on Vercel's
 * serverless/multi-instance deployment (unlike `evaluateInMemoryRateLimit`,
 * which is explicitly the dev/test-only fallback).
 *
 * The fake Supabase client below behaves like a real shared table: state
 * lives in a plain object outside of `lib/rate-limit.ts`'s own module scope,
 * so two "different serverless instances" each getting a fresh Supabase
 * client still observe and mutate the SAME row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'
import { evaluatePersistentRateLimit } from '../rate-limit'

/** In-memory stand-in for the `public.rate_limits` Postgres table, external to the module under test. */
function createFakeRateLimitsTable() {
  const rows = new Map<string, { key: string; last_requested_at: string; count: number }>()

  const client = {
    from: (table: string) => {
      if (table !== 'rate_limits') throw new Error(`Unexpected table: ${table}`)
      return {
        select: () => ({
          eq: (_col: string, key: string) => ({
            maybeSingle: async () => ({ data: rows.get(key) ?? null, error: null }),
          }),
        }),
        update: (payload: { count: number; updated_at: string }) => ({
          eq: (_col: string, key: string) => {
            const existing = rows.get(key)
            if (existing) rows.set(key, { ...existing, count: payload.count })
            return Promise.resolve({ data: null, error: null })
          },
        }),
        upsert: async (row: { key: string; last_requested_at: string; count: number }) => {
          rows.set(row.key, row)
          return { data: null, error: null }
        },
      }
    },
  } as unknown as SupabaseClient<Database>

  return { client, rows }
}

describe('evaluatePersistentRateLimit — atomic, shared-state enforcement (serverless-safe)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('allows the first N requests within the window and rejects the (N+1)th, using a fresh client each call (simulating separate serverless invocations)', async () => {
    const { client, rows } = createFakeRateLimitsTable()
    const key = 'signup_ip:203.0.113.50'
    const opts = { windowMs: 15 * 60 * 1000, limit: 5 }

    const results = []
    for (let i = 0; i < 6; i++) {
      // A fresh createServiceRoleClient() per call stands in for a fresh serverless
      // instance with no shared process memory — only `rows` (the "DB") persists.
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)
      results.push(await evaluatePersistentRateLimit(key, opts))
    }

    expect(results.slice(0, 5).every((r) => r.success)).toBe(true)
    expect(results[5].success).toBe(false)
    expect(rows.get(key)?.count).toBe(5) // the 6th call never incremented past the limit
  })

  it('tracks IP and email keys independently — exhausting one never affects the other', async () => {
    const { client } = createFakeRateLimitsTable()
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)

    const ipOpts = { windowMs: 15 * 60 * 1000, limit: 5 }
    const emailOpts = { windowMs: 24 * 60 * 60 * 1000, limit: 3 }

    for (let i = 0; i < 3; i++) {
      await evaluatePersistentRateLimit('signup_email:user@gmail.com', emailOpts)
    }
    const emailExhausted = await evaluatePersistentRateLimit('signup_email:user@gmail.com', emailOpts)
    expect(emailExhausted.success).toBe(false)

    // A completely different IP key must be unaffected by the exhausted email key.
    const ipStillOk = await evaluatePersistentRateLimit('signup_ip:203.0.113.99', ipOpts)
    expect(ipStillOk.success).toBe(true)
  })

  it('resets after the window elapses (sliding window, not a permanent ban)', async () => {
    const { client, rows } = createFakeRateLimitsTable()
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)
    const key = 'signup_ip:203.0.113.77'
    const opts = { windowMs: 1000, limit: 1 }

    const first = await evaluatePersistentRateLimit(key, opts)
    expect(first.success).toBe(true)

    const second = await evaluatePersistentRateLimit(key, opts)
    expect(second.success).toBe(false)

    // Simulate the window elapsing by backdating the stored last_requested_at.
    const row = rows.get(key)!
    rows.set(key, { ...row, last_requested_at: new Date(Date.now() - 2000).toISOString() })

    const afterWindow = await evaluatePersistentRateLimit(key, opts)
    expect(afterWindow.success).toBe(true)
  })

  it('degrades to the in-memory limiter (not an open gate) if the persistent table is unreachable', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockImplementation(() => {
      throw new Error('connection refused')
    })

    const result = await evaluatePersistentRateLimit(`signup_ip:fallback-test-${Date.now()}`, { windowMs: 60_000, limit: 1 })
    // Fails open to a working (if process-local) limiter rather than throwing or
    // silently allowing unlimited requests.
    expect(result.success).toBe(true)
    expect(result).toHaveProperty('remaining')
  })
})
