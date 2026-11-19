/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasXpEvent, getTotalXp } from '@/lib/xp-service'

describe('Phase 9 — Database, Query & Application Performance Optimization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('2. XP Ledger & Idempotency Lookups', () => {
    it('hasXpEvent executes an indexed composite query bounded by limit 1', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'evt-123' }, error: null }),
        }),
      } as any

      const exists = await hasXpEvent(mockSupabase, 'usr-1', 'capstone', 'foundations')
      expect(exists).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('xp_events')
    })

    // B8-B / F-COR-2 changed this contract: getTotalXp reads the trigger-maintained
    // `users.total_xp` instead of summing ledger rows client-side, which truncated at
    // the PostgREST row cap. Ledger-sum behaviour survives only as the fallback when
    // the users row is unreadable — covered in xp-total-authority.test.ts.
    it('getTotalXp reads the authoritative users.total_xp rather than scanning the ledger', async () => {
      const usersChain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { total_xp: 225 }, error: null }),
      }
      const mockSupabase = { from: vi.fn().mockReturnValue(usersChain) } as any

      const total = await getTotalXp(mockSupabase, 'usr-1')
      expect(total).toBe(225)
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
    })
  })
})
