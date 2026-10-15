/**
 * Prodily — Phase 7 Referral & Organic Growth Test Suite
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const notify = vi.hoisted(() => ({ createInApp: vi.fn() }))
vi.mock('@/lib/notifications/in-app/service', () => ({ createInAppNotification: notify.createInApp }))

import {
  resolveReferralCode,
  createReferralAttribution,
  onFirstLessonCompletedReferralCheck,
  getUserReferralStats,
  REFERRAL_ACTIVATION_XP,
} from '../referral/referral-service'
import { SettingsService } from '../admin/settings-service'
import type { LearningSettings } from '../admin/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

describe('Phase 7: Referral & Organic Growth System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notify.createInApp.mockResolvedValue({ success: true })
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
          if (table === 'xp_events') {
            // Two referral awards of the standard 50 XP.
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [{ xp_amount: 50 }, { xp_amount: 50 }], error: null }),
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
          if (table === 'xp_events') {
            // Two referral awards of the standard 50 XP.
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [{ xp_amount: 50 }, { xp_amount: 50 }], error: null }),
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
          if (table === 'xp_events') {
            // Two referral awards of the standard 50 XP.
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [{ xp_amount: 50 }, { xp_amount: 50 }], error: null }),
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
    beforeEach(() => {
      vi.spyOn(SettingsService, 'getLearningSettings').mockResolvedValue({ xpReferralReward: 50 } as unknown as LearningSettings)
    })
    afterEach(() => vi.restoreAllMocks())

    /** A pending referral whose XP insert and status update are recorded in call order. */
    const pendingReferral = (opts: { xpInsertError?: { code?: string; message: string } } = {}) => {
      const calls: string[] = []
      const updateChain = {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: [{ id: 'ref-order-1' }], error: null }),
      }
      const update = vi.fn().mockImplementation(() => {
        calls.push('status')
        return updateChain
      })
      const chainFor = (table: string, data: unknown = null) => {
        const chain: Record<string, unknown> = {}
        const fn = vi.fn().mockReturnValue(chain)
        for (const method of ['select', 'eq', 'ilike', 'in', 'gte', 'order', 'limit']) chain[method] = fn
        chain.single = vi.fn().mockResolvedValue({ data, error: null })
        chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
        chain.insert = vi.fn().mockImplementation(() => {
          if (table === 'xp_events') calls.push('xp')
          return Promise.resolve({ error: table === 'xp_events' ? opts.xpInsertError ?? null : null })
        })
        chain.update = update
        return chain
      }
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'ref-order-1', referrer_id: 'referrer-owner', status: 'signed_up' },
                      error: null,
                    }),
                  }),
                }),
              }),
              update,
            }
          }
          return chainFor(table, table === 'users' ? { username: 'newlearner', name: 'New Learner' } : null)
        }),
      } as unknown as SupabaseClient<Database>
      return { supabase, calls, update }
    }

    it('pays the XP before marking the referral rewarded', async () => {
      const { supabase, calls } = pendingReferral()

      const result = await onFirstLessonCompletedReferralCheck(supabase, 'learner-uid-1')

      expect(result).toMatchObject({ rewarded: true, xpAwarded: 50 })
      expect(calls).toEqual(['xp', 'status'])
    })

    it('leaves the referral pending when the reward setting cannot be read', async () => {
      const settings = vi.spyOn(SettingsService, 'getLearningSettings').mockRejectedValue(new Error('settings down'))
      const { supabase, calls } = pendingReferral()

      const result = await onFirstLessonCompletedReferralCheck(supabase, 'learner-uid-1')

      expect(settings).toHaveBeenCalledWith({ strict: true })
      expect(result).toEqual({ rewarded: false, reason: 'reward_unavailable' })
      // Nothing paid at a guessed amount, and the row is still `signed_up` for a later retry.
      expect(calls).toEqual([])
    })

    it('leaves the referral pending when the XP award fails', async () => {
      const { supabase, calls } = pendingReferral({ xpInsertError: { code: 'XX000', message: 'ledger down' } })

      const result = await onFirstLessonCompletedReferralCheck(supabase, 'learner-uid-1')

      expect(result).toEqual({ rewarded: false, reason: 'xp_award_failed' })
      expect(calls).toEqual(['xp'])
    })

    it('still marks the referral rewarded when the XP was already paid (a concurrent or earlier run)', async () => {
      const { supabase, calls } = pendingReferral({ xpInsertError: { code: '23505', message: 'duplicate key value' } })

      const result = await onFirstLessonCompletedReferralCheck(supabase, 'learner-uid-1')

      expect(result.rewarded).toBe(true)
      expect(calls).toEqual(['xp', 'status'])
    })

    it('activates referral reward and sets status to rewarded', async () => {
      const updateChain = {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: [{ id: 'ref-act-1' }], error: null }),
      }
      const updateMock = vi.fn().mockReturnValue(updateChain)

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
        const updateChain = {
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: [{ id: 'ref-row-unique-99' }], error: null }),
        }
        chain.update = vi.fn().mockReturnValue(updateChain)
        return chain
      }

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'referrals') {
            const updateChain = {
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockResolvedValue({ data: [{ id: 'ref-row-unique-99' }], error: null }),
            }
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
              update: vi.fn().mockReturnValue(updateChain),
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

  // ─── 3b. A failed activation is completed on a later lesson ───────────────
  // The caller runs the check on every lesson completion while the referral is still `signed_up`
  // (lib/academy/lessons-db.ts), so whatever stopped the first attempt is retried. However often
  // it runs, the referrer is paid once, the status flips once and one notification goes out.
  describe('3b. Activation retried on a later lesson', () => {
    const REFERRAL = 'ref-retry-1'
    const REFERRER = 'referrer-owner'
    const LEARNER = 'learner-uid-1'

    /** A referral row and an XP ledger that keep their state across calls, with failure switches. */
    const referralDb = (opts: { referral?: boolean } = {}) => {
      const state = {
        status: 'signed_up',
        hasReferral: opts.referral ?? true,
        xpEvents: [] as Array<{ user_id: string; source_type: string; source_id: string; xp_amount: number }>,
        xpInsertError: null as { code?: string; message: string } | null,
        statusUpdateError: null as { message: string } | null,
        statusUpdates: 0,
        reads: [] as string[],
      }
      const supabase = {
        from: vi.fn().mockImplementation((table: string) => {
          const filters: Record<string, unknown> = {}
          let update: Record<string, unknown> | null = null
          const runUpdate = () => {
            if (state.statusUpdateError) return { data: null, error: state.statusUpdateError }
            // Compare-and-set, as the real statement: only a row still `signed_up` is updated.
            if (filters.id !== REFERRAL || filters.status !== state.status) return { data: [], error: null }
            state.status = String(update?.status)
            state.statusUpdates += 1
            return { data: [{ id: REFERRAL }], error: null }
          }
          const chain: Record<string, unknown> = {}
          chain.select = () => {
            if (update) return Promise.resolve(runUpdate())
            state.reads.push(table)
            return chain
          }
          chain.eq = (col: string, value: unknown) => {
            filters[col] = value
            return chain
          }
          chain.limit = () => chain
          chain.maybeSingle = async () => {
            if (table === 'referrals') {
              const pending = state.hasReferral && filters.referred_user_id === LEARNER && filters.status === state.status
              return { data: pending ? { id: REFERRAL, referrer_id: REFERRER, status: state.status } : null, error: null }
            }
            if (table === 'xp_events') {
              const found = state.xpEvents.find(
                (e) => e.user_id === filters.user_id && e.source_type === filters.source_type && e.source_id === filters.source_id
              )
              return { data: found ? { id: 'xp-1' } : null, error: null }
            }
            if (table === 'users') return { data: { username: 'newlearner', name: 'New Learner', total_xp: 0 }, error: null }
            return { data: null, error: null }
          }
          chain.insert = async (row: (typeof state.xpEvents)[number]) => {
            if (table !== 'xp_events') return { error: null }
            if (state.xpInsertError) return { error: state.xpInsertError }
            state.xpEvents.push(row)
            return { error: null }
          }
          chain.update = (values: Record<string, unknown>) => {
            update = values
            return chain
          }
          return chain
        }),
      } as unknown as SupabaseClient<Database>
      return { supabase, state }
    }

    beforeEach(() => {
      vi.spyOn(SettingsService, 'getLearningSettings').mockResolvedValue({ xpReferralReward: 50 } as unknown as LearningSettings)
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => vi.restoreAllMocks())

    it('pays once and notifies once when lesson 1 failed on the reward setting and lesson 2 succeeds', async () => {
      const { supabase, state } = referralDb()
      vi.spyOn(SettingsService, 'getLearningSettings').mockRejectedValueOnce(new Error('settings down'))

      const first = await onFirstLessonCompletedReferralCheck(supabase, LEARNER)
      expect(first).toEqual({ rewarded: false, reason: 'reward_unavailable' })
      expect(state).toMatchObject({ status: 'signed_up', xpEvents: [] })
      expect(notify.createInApp).not.toHaveBeenCalled()

      const second = await onFirstLessonCompletedReferralCheck(supabase, LEARNER)
      expect(second).toEqual({ rewarded: true, referrerId: REFERRER, xpAwarded: 50 })

      // A third completion finds nothing pending.
      expect(await onFirstLessonCompletedReferralCheck(supabase, LEARNER)).toEqual({ rewarded: false, reason: 'no_pending_referral' })

      expect(state.xpEvents).toEqual([{ user_id: REFERRER, source_type: 'referral', xp_amount: 50, source_id: REFERRAL }])
      expect(state).toMatchObject({ status: 'rewarded', statusUpdates: 1 })
      expect(notify.createInApp).toHaveBeenCalledTimes(1)
      expect(notify.createInApp).toHaveBeenCalledWith(
        expect.objectContaining({ userId: REFERRER, idempotencyKey: `referral-reward-${REFERRAL}` })
      )
    })

    it('pays once when lesson 1 failed on the XP insert and lesson 2 succeeds', async () => {
      const { supabase, state } = referralDb()
      state.xpInsertError = { code: 'XX000', message: 'ledger down' }

      expect(await onFirstLessonCompletedReferralCheck(supabase, LEARNER)).toEqual({ rewarded: false, reason: 'xp_award_failed' })
      expect(state).toMatchObject({ status: 'signed_up', xpEvents: [], statusUpdates: 0 })

      state.xpInsertError = null
      expect((await onFirstLessonCompletedReferralCheck(supabase, LEARNER)).rewarded).toBe(true)

      expect(state.xpEvents).toHaveLength(1)
      expect(state).toMatchObject({ status: 'rewarded', statusUpdates: 1 })
      expect(notify.createInApp).toHaveBeenCalledTimes(1)
    })

    it('completes a referral whose XP was paid but whose status update failed, without a second award', async () => {
      const { supabase, state } = referralDb()
      state.statusUpdateError = { message: 'update timed out' }

      expect(await onFirstLessonCompletedReferralCheck(supabase, LEARNER)).toEqual({ rewarded: false, reason: 'update_failed' })
      // Paid, but not shown as rewarded and nobody told yet.
      expect(state.xpEvents).toHaveLength(1)
      expect(state.status).toBe('signed_up')
      expect(notify.createInApp).not.toHaveBeenCalled()

      state.statusUpdateError = null
      // Any insert now would be a second award: make one fail loudly instead of passing unnoticed.
      state.xpInsertError = { code: 'XX000', message: 'a second award was attempted' }
      const retry = await onFirstLessonCompletedReferralCheck(supabase, LEARNER)

      expect(retry).toEqual({ rewarded: true, referrerId: REFERRER, xpAwarded: 50 })
      expect(state.xpEvents).toHaveLength(1)
      expect(state).toMatchObject({ status: 'rewarded', statusUpdates: 1 })
      expect(notify.createInApp).toHaveBeenCalledTimes(1)
    })

    it('costs one read and awards nothing when there is no pending referral', async () => {
      const { supabase, state } = referralDb({ referral: false })
      const settings = vi.spyOn(SettingsService, 'getLearningSettings')

      expect(await onFirstLessonCompletedReferralCheck(supabase, LEARNER)).toEqual({ rewarded: false, reason: 'no_pending_referral' })

      expect(state.reads).toEqual(['referrals'])
      expect(supabase.from).toHaveBeenCalledTimes(1)
      expect(settings).not.toHaveBeenCalled()
      expect(state.xpEvents).toEqual([])
      expect(notify.createInApp).not.toHaveBeenCalled()
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
          if (table === 'xp_events') {
            // Two referral awards of the standard 50 XP.
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [{ xp_amount: 50 }, { xp_amount: 50 }], error: null }),
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
          if (table === 'xp_events') {
            // Two referral awards of the standard 50 XP.
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [{ xp_amount: 50 }, { xp_amount: 50 }], error: null }),
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
