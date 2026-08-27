/**
 * PM Academy — Phase 7 Referral & Organic Growth Test Suite
 *
 * Tests:
 * 1. Referral code resolution (username, UUID, case-insensitivity)
 * 2. Referral attribution on signup & edge-case prevention
 * 3. Self-referral prevention
 * 4. 1-to-1 attribution constraint
 * 5. 24-hour rate limiting (anti-abuse)
 * 6. First-lesson completion reward activation & XP ledger update
 * 7. Reward idempotency
 * 8. User referral statistics aggregation
 * 9. Zero-PII analytics compliance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveReferralCode,
  createReferralAttribution,
  onFirstLessonCompletedReferralCheck,
  getUserReferralStats,
  REFERRAL_ACTIVATION_XP,
} from '../referral/referral-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

describe('Phase 7: Referral & Organic Growth System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── 1. Referral Code Resolution ───────────────────────────────────────────
  describe('1. Referral Code Resolution', () => {
    it('resolves referrer by username case-insensitively', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'usr-123', username: 'adityag', name: 'Aditya' },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>

      const result = await resolveReferralCode(mockSupabase, 'ADITYAG')
      expect(result).not.toBeNull()
      expect(result?.id).toBe('usr-123')
      expect(result?.username).toBe('adityag')
    })

    it('strips leading @ symbol from handles', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            ilike: vi.fn().mockImplementation((col: string, val: string) => {
              expect(val).toBe('sarahpm')
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'usr-456', username: 'sarahpm', name: 'Sarah' },
                  error: null,
                }),
              }
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>

      const result = await resolveReferralCode(mockSupabase, '@sarahpm')
      expect(result?.id).toBe('usr-456')
    })

    it('resolves referrer by valid UUID when username is not found', async () => {
      const validUuid = '11111111-2222-3333-4444-555555555555'
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: validUuid, username: null, name: 'Anonymous PM' },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>

      const result = await resolveReferralCode(mockSupabase, validUuid)
      expect(result?.id).toBe(validUuid)
    })

    it('returns null for empty or invalid code', async () => {
      const mockSupabase = {} as unknown as SupabaseClient<Database>
      const result = await resolveReferralCode(mockSupabase, '')
      expect(result).toBeNull()
    })
  })

  // ─── 2. Referral Attribution on Signup ──────────────────────────────────────
  describe('2. Referral Attribution Creation & Anti-Abuse', () => {
    it('successfully attributes new user to valid referrer', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'referrer-1', username: 'toprefer', name: 'Top Referrer' },
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'ref-row-1' },
                    error: null,
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const result = await createReferralAttribution(mockSupabase, {
        referrerCodeOrId: 'toprefer',
        newUserId: 'new-user-1',
      })

      expect(result.created).toBe(true)
      expect(result.referralId).toBe('ref-row-1')
      expect(result.referrerId).toBe('referrer-1')
    })

    // TEST 3: Self-referral prevention
    it('prevents self-referrals when new user id matches referrer id', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'same-user-id', username: 'sameuser', name: 'Same' },
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>

      const result = await createReferralAttribution(mockSupabase, {
        referrerCodeOrId: 'sameuser',
        newUserId: 'same-user-id',
      })

      expect(result.created).toBe(false)
      expect(result.reason).toBe('self_referral_prevented')
    })

    // TEST 4: 1-to-1 attribution constraint
    it('prevents duplicate referral attribution for already attributed user', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'referrer-1', username: 'ref1', name: 'R1' },
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'existing-ref-id' }, // Already exists
                    error: null,
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const result = await createReferralAttribution(mockSupabase, {
        referrerCodeOrId: 'ref1',
        newUserId: 'already-attributed-user',
      })

      expect(result.created).toBe(false)
      expect(result.reason).toBe('already_attributed')
    })

    // TEST 5: 24h Rate Limiting
    it('enforces 24h limit of 10 signups per referrer', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'spammer-1', username: 'spammer', name: 'Spam' },
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  gte: vi.fn().mockResolvedValue({
                    data: Array(10).fill({ id: 'some-id' }), // 10 signups in last 24h
                    error: null,
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const result = await createReferralAttribution(mockSupabase, {
        referrerCodeOrId: 'spammer',
        newUserId: 'eleventh-user',
      })

      expect(result.created).toBe(false)
      expect(result.reason).toBe('rate_limit_exceeded')
    })
  })

  // ─── 3. Reward Activation Upon First Lesson Completion ─────────────────────
  describe('3. First Lesson Completion Reward Activation', () => {
    it('activates referral reward and sets status to rewarded', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })

      const createQueryChain = (data: unknown = null) => {
        const chain: Record<string, unknown> = {}
        const fn = vi.fn().mockReturnValue(chain)
        chain.select = fn
        chain.eq = fn
        chain.ilike = fn
        chain.in = fn
        chain.gte = fn
        chain.order = fn
        chain.limit = fn
        chain.single = vi.fn().mockResolvedValue({ data, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
        chain.insert = vi.fn().mockResolvedValue({ error: null })
        chain.update = updateMock
        return chain
      }

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'ref-act-1', referrer_id: 'referrer-owner', status: 'signed_up' },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: updateMock,
            }
          }
          if (table === 'xp_events') {
            return createQueryChain(null)
          }
          if (table === 'users') {
            return createQueryChain({ username: 'newlearner', name: 'New Learner' })
          }
          return createQueryChain(null)
        }),
      } as unknown as SupabaseClient<Database>

      const result = await onFirstLessonCompletedReferralCheck(mockSupabase, 'learner-uid-1')

      expect(result.rewarded).toBe(true)
      expect(result.referrerId).toBe('referrer-owner')
      expect(result.xpAwarded).toBe(REFERRAL_ACTIVATION_XP)
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rewarded' })
      )
    })

    it('no-ops idempotently if user has no pending referral record', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>

      const result = await onFirstLessonCompletedReferralCheck(mockSupabase, 'unreferred-user')
      expect(result.rewarded).toBe(false)
      expect(result.reason).toBe('no_pending_referral')
    })

    it('confirms referred user receives 0 referral XP and only referrer receives +50 XP', async () => {
      const insertedXpEvents: Array<{ user_id: string; source_type: string; xp_amount: number; source_id: string }> = []
      
      const createChain = (data: unknown = null) => {
        const chain: Record<string, unknown> = {}
        const fn = vi.fn().mockReturnValue(chain)
        chain.select = fn
        chain.eq = fn
        chain.ilike = fn
        chain.in = fn
        chain.gte = fn
        chain.order = fn
        chain.limit = fn
        chain.single = vi.fn().mockResolvedValue({ data, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
        chain.insert = vi.fn().mockImplementation((payload) => {
          insertedXpEvents.push(payload)
          return Promise.resolve({ error: null })
        })
        chain.update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })
        return chain
      }

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'ref-row-unique-99', referrer_id: 'legitimate-referrer', status: 'signed_up' },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }
          }
          if (table === 'xp_events') {
            return createChain(null)
          }
          if (table === 'users') {
            return createChain({ username: 'completing-learner', name: 'Learner' })
          }
          return createChain(null)
        }),
      } as unknown as SupabaseClient<Database>

      const result = await onFirstLessonCompletedReferralCheck(mockSupabase, 'completing-learner-id')

      expect(result.rewarded).toBe(true)
      expect(result.referrerId).toBe('legitimate-referrer')
      expect(result.referrerId).not.toBe('completing-learner-id')
      expect(result.xpAwarded).toBe(50)
      expect(insertedXpEvents.length).toBe(1)
      expect(insertedXpEvents[0].user_id).toBe('legitimate-referrer')
      expect(insertedXpEvents[0].source_type).toBe('referral')
      expect(insertedXpEvents[0].xp_amount).toBe(50)
      expect(insertedXpEvents[0].source_id).toBe('ref-row-unique-99')
    })
  })

  // ─── 4. User Referral Stats Aggregation ───────────────────────────────────
  describe('4. User Referral Stats Aggregation', () => {
    it('aggregates total invited, activated count, and earned XP accurately', async () => {
      const mockReferrals = [
        { id: 'r1', referred_user_id: 'u1', status: 'rewarded', rewarded_at: '2026-08-01', created_at: '2026-08-01' },
        { id: 'r2', referred_user_id: 'u2', status: 'signed_up', rewarded_at: null, created_at: '2026-08-02' },
        { id: 'r3', referred_user_id: 'u3', status: 'activated', rewarded_at: '2026-08-03', created_at: '2026-08-03' },
      ]

      const mockUsers = [
        { id: 'u1', name: 'Alice Smith', username: 'alice' },
        { id: 'u2', name: 'Bob Jones', username: 'bob' },
        { id: 'u3', name: 'Charlie', username: null },
      ]

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'me', username: 'myhandle', name: 'My Name' },
                    error: null,
                  }),
                }),
                in: vi.fn().mockResolvedValue({
                  data: mockUsers,
                  error: null,
                }),
              }),
            }
          }
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: mockReferrals,
                    error: null,
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const stats = await getUserReferralStats(mockSupabase, 'me', 'https://prodily.com')

      expect(stats.referralCode).toBe('myhandle')
      expect(stats.referralLink).toBe('https://prodily.com/signup?ref=myhandle')
      expect(stats.totalInvited).toBe(3)
      expect(stats.activatedCount).toBe(2) // r1 & r3
      expect(stats.totalXpEarned).toBe(100) // 2 * 50 XP
      expect(stats.referrals[0].displayName).toBe('@alice')
      expect(stats.referrals[2].displayName).toBe('Charlie...')
    })
  })

  // ─── 5. Privacy & Zero-PII Invariant Verification ──────────────────────────
  describe('5. Privacy & Zero-PII Invariants', () => {
    it('ensures formatted referral summaries never contain emails or full user IDs', async () => {
      const mockReferrals = [
        { id: 'ref-1', referred_user_id: 'secret-uuid-1', status: 'signed_up', rewarded_at: null, created_at: '2026-08-01' },
      ]
      const mockUsers = [
        { id: 'secret-uuid-1', name: 'John Doe Longname', username: null },
      ]

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'referrer-uid', username: 'johnny', name: 'Johnny' },
                    error: null,
                  }),
                }),
                in: vi.fn().mockResolvedValue({
                  data: mockUsers,
                  error: null,
                }),
              }),
            }
          }
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: mockReferrals,
                    error: null,
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const stats = await getUserReferralStats(mockSupabase, 'referrer-uid')
      const item = stats.referrals[0]

      // Confirm displayName is truncated without exposing full name or email
      expect(item.displayName).toBe('John Doe L...')
      expect(item).not.toHaveProperty('email')
      expect(item).not.toHaveProperty('referred_user_id')
    })
  })
})
