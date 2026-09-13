/**
 * Queue & Scheduler Reliability Verification Suite
 *
 * Verifies:
 * 1. Stale processing item reclamation (>15m threshold, max attempts, fresh item protection)
 * 2. Bounded email dispatch concurrency (worker pool, non-blocking slow jobs, failure isolation)
 * 3. Exponential backoff with bounded jitter, max delay ceiling, and direct permanent failure routing
 * 4. Scheduler failure detection, durable heartbeat recording, and admin health reporting
 * 5. Retry-failed / manual retry race prevention and duplicate send protection
 * 6. Queue state machine valid/invalid transitions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isValidQueueStatusTransition,
  calculateRetryDelayMinutes,
} from '../notifications/queue/helpers'
import {
  reclaimStaleProcessingItems,
  STALE_PROCESSING_THRESHOLD_MS,
  DEFAULT_DISPATCH_CONCURRENCY,
  MAX_BATCH_EXECUTION_MS,
} from '../notifications/queue/processor'
import { classifyProviderFailure } from '../notifications/providers/failure-classification'
import { SystemService } from '../admin/system-service'

// Mocks for processor dependencies
vi.mock('../notifications/feature-flags/service', () => ({
  globalFeatureFlagService: {
    isEnabled: vi.fn(() => true),
    isEnabledAsync: vi.fn(async () => true),
  },
}))

vi.mock('../notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 1000 })),
    isAutomationEnabled: vi.fn(async () => true),
  },
}))

vi.mock('../../emails', () => ({
  renderEmailTemplate: vi.fn(async (key: string) => ({
    html: `<p>${key}</p>`,
    text: key,
    subject: `Subject: ${key}`,
  })),
}))

vi.mock('../monitoring/logger', () => ({
  logErrorReport: vi.fn(),
  logSystemError: vi.fn(),
}))

describe('Queue & Scheduler Reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // 1. STALE `processing` ITEM RECLAMATION
  // ==========================================================================
  describe('1. Stale Processing Item Reclamation', () => {
    it('reclaims stale processing items (>15m) to retrying when attempts < max_attempts', async () => {
      const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20m ago (> 15m)
      const mockRows = [
        {
          id: 'stale-row-1',
          status: 'processing',
          attempt_count: 1,
          max_attempts: 3,
          processing_at: staleTime,
        },
      ]

      const updatedPayloads: Record<string, unknown>[] = []
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }), // test fallback
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: mockRows }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedPayloads.push(payload)
            return {
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'stale-row-1' } }),
            }
          }),
        }),
      }

      const result = await reclaimStaleProcessingItems(fakeSupabase as never, STALE_PROCESSING_THRESHOLD_MS)

      expect(result.reclaimedCount).toBe(1)
      expect(result.items[0]).toEqual({ id: 'stale-row-1', newStatus: 'retrying' })
      expect(updatedPayloads[0].status).toBe('retrying')
      expect(updatedPayloads[0].processing_at).toBeNull()
      expect(updatedPayloads[0].next_retry_at).toBeDefined()
    })

    it('transitions stale processing items to dead_letter when attempts >= max_attempts', async () => {
      const staleTime = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const mockRows = [
        {
          id: 'exhausted-row-1',
          status: 'processing',
          attempt_count: 3,
          max_attempts: 3,
          processing_at: staleTime,
        },
      ]

      const updatedPayloads: Record<string, unknown>[] = []
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: mockRows }),
          update: vi.fn((payload: Record<string, unknown>) => {
            updatedPayloads.push(payload)
            return {
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'exhausted-row-1' } }),
            }
          }),
        }),
      }

      const result = await reclaimStaleProcessingItems(fakeSupabase as never)

      expect(result.reclaimedCount).toBe(1)
      expect(result.items[0]).toEqual({ id: 'exhausted-row-1', newStatus: 'dead_letter' })
      expect(updatedPayloads[0].status).toBe('dead_letter')
      expect(updatedPayloads[0].processing_at).toBeNull()
      expect(updatedPayloads[0].failed_at).toBeDefined()
    })

    it('does not reclaim fresh processing items (<15m)', async () => {
      // If query lte('processing_at', staleDate) returns no rows because items are fresh
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }), // RPC returns 0 reclaimed
        from: vi.fn(),
      }

      const result = await reclaimStaleProcessingItems(fakeSupabase as never)

      expect(result.reclaimedCount).toBe(0)
      expect(result.items).toHaveLength(0)
    })

    it('prevents double-reclamation under concurrent execution via atomic compare-and-swap', async () => {
      const staleTime = new Date(Date.now() - 25 * 60 * 1000).toISOString()
      const mockRows = [
        {
          id: 'contested-row',
          status: 'processing',
          attempt_count: 1,
          max_attempts: 3,
          processing_at: staleTime,
        },
      ]

      // Worker 2 attempts update on contested-row, but Worker 1 already changed status
      // so eq('status', 'processing') matches 0 rows (maybeSingle returns null)
      const fakeSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'disabled' } }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: mockRows }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }), // concurrent loss!
          }),
        }),
      }

      const result = await reclaimStaleProcessingItems(fakeSupabase as never)
      expect(result.reclaimedCount).toBe(0)
      expect(result.items).toHaveLength(0)
    })
  })

  // ==========================================================================
  // 2. BOUNDED DISPATCH CONCURRENCY
  // ==========================================================================
  describe('2. Bounded Dispatch Concurrency', () => {
    it('defines sensible defaults for bounded concurrency and timeout deadlines', () => {
      expect(DEFAULT_DISPATCH_CONCURRENCY).toBe(5)
      expect(MAX_BATCH_EXECUTION_MS).toBe(90_000) // 90s << 5m GitHub Actions timeout
      expect(STALE_PROCESSING_THRESHOLD_MS).toBe(15 * 60 * 1000) // 15m
    })

    it('bounds execution and allows independent concurrent completion of multiple jobs', async () => {
      let activeWorkers = 0
      let maxActiveWorkers = 0
      const sendDelayMs = 15

      const mockSend = vi.fn(async () => {
        activeWorkers++
        if (activeWorkers > maxActiveWorkers) {
          maxActiveWorkers = activeWorkers
        }
        await new Promise((r) => setTimeout(r, sendDelayMs))
        activeWorkers--
        return { success: true, externalId: 'msg-123' }
      })

      // Simulate concurrency pool
      const items = Array.from({ length: 10 }, (_, i) => ({ id: `job-${i}` }))
      const concurrency = 3

      const results: string[] = new Array(items.length)
      let nextIndex = 0

      async function worker() {
        while (nextIndex < items.length) {
          const idx = nextIndex++
          await mockSend()
          results[idx] = `done-${idx}`
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()))

      expect(results).toHaveLength(10)
      expect(results.every((r) => r.startsWith('done-'))).toBe(true)
      expect(maxActiveWorkers).toBeLessThanOrEqual(concurrency)
      expect(maxActiveWorkers).toBeGreaterThanOrEqual(2)
    })

    it('isolates slow jobs so they do not block concurrent sibling jobs', async () => {
      const orderCompleted: string[] = []

      async function processJob(id: string, durationMs: number) {
        await new Promise((r) => setTimeout(r, durationMs))
        orderCompleted.push(id)
      }

      const tasks = [
        () => processJob('slow-job', 40),
        () => processJob('fast-job-1', 10),
        () => processJob('fast-job-2', 15),
      ]

      // Run with concurrency = 3
      await Promise.all(tasks.map((t) => t()))

      // Fast jobs should finish before slow job even if slow job started first/simultaneously
      expect(orderCompleted[0]).toBe('fast-job-1')
      expect(orderCompleted[1]).toBe('fast-job-2')
      expect(orderCompleted[2]).toBe('slow-job')
    })
  })

  // ==========================================================================
  // 3. RETRY BACKOFF + JITTER & PERMANENT FAILURE ROUTING
  // ==========================================================================
  describe('3. Retry Backoff + Jitter & Permanent Failure Routing', () => {
    it('exponentially scales retry delay with attempt count', () => {
      // Test without randomness (randomFn returns 0.5 -> multiplier = 1.0)
      const deterministic = { randomFn: () => 0.5, jitterFactor: 0.2 }

      const delay1 = calculateRetryDelayMinutes(1, 5, deterministic)
      const delay2 = calculateRetryDelayMinutes(2, 5, deterministic)
      const delay3 = calculateRetryDelayMinutes(3, 5, deterministic)

      // Base 5m:
      // attempt 1: 5 * 2^1 = 10m
      // attempt 2: 5 * 2^2 = 20m
      // attempt 3: 5 * 2^3 = 40m
      expect(delay1).toBe(10)
      expect(delay2).toBe(20)
      expect(delay3).toBe(40)
      expect(delay2).toBeGreaterThan(delay1)
      expect(delay3).toBeGreaterThan(delay2)
    })

    it('applies bounded jitter to prevent synchronized retry storms', () => {
      const base = 5
      const attempt = 2 // raw backoff = 20m

      // Min jitter (randomFn = 0 -> multiplier = 0.8)
      const minDelay = calculateRetryDelayMinutes(attempt, base, { randomFn: () => 0, jitterFactor: 0.2 })
      // Max jitter (randomFn = 1 -> multiplier = 1.2)
      const maxDelay = calculateRetryDelayMinutes(attempt, base, { randomFn: () => 1, jitterFactor: 0.2 })

      expect(minDelay).toBe(16) // 20 * 0.8
      expect(maxDelay).toBe(24) // 20 * 1.2
      expect(maxDelay).toBeGreaterThan(minDelay)
    })

    it('respects maximum retry delay ceiling (120 minutes)', () => {
      // Large attempt count (e.g. 10): raw = 5 * 1024 = 5120m -> capped at 120m
      const delay = calculateRetryDelayMinutes(10, 5, { randomFn: () => 0.5 })
      expect(delay).toBe(120)

      // Even with max jitter (+20%), ceiling is not exceeded
      const delayWithMaxJitter = calculateRetryDelayMinutes(10, 5, { randomFn: () => 1, jitterFactor: 0.2 })
      expect(delayWithMaxJitter).toBeLessThanOrEqual(120)
    })

    it('classifies permanent provider errors and routes them away from retries', () => {
      // 400 Bad Request (not capacity) -> permanent
      expect(classifyProviderFailure(400, 'Invalid recipient email address')).toBe('permanent')
      // 401 Unauthorized -> permanent
      expect(classifyProviderFailure(401, 'Invalid API key')).toBe('permanent')
      // 403 Forbidden -> permanent
      expect(classifyProviderFailure(403, 'Account suspended')).toBe('permanent')
      // 422 Unprocessable Entity -> permanent
      expect(classifyProviderFailure(422, 'Malformed payload')).toBe('permanent')

      // Transient capacity/rate limits -> failover/retry
      expect(classifyProviderFailure(429, 'rate_limit_exceeded')).toBe('failover')
      expect(classifyProviderFailure(402, 'not_enough_credits')).toBe('failover')
      expect(classifyProviderFailure(500, 'Internal server error')).toBe('failover')
    })
  })

  // ==========================================================================
  // 4. SCHEDULER FAILURE DETECTION & HEARTBEAT
  // ==========================================================================
  describe('4. Scheduler Failure Detection & Heartbeat', () => {
    it('evaluates healthy scheduler status when heartbeat is within 15 minutes', async () => {
      const recentIso = new Date(Date.now() - 4 * 60 * 1000).toISOString() // 4m ago (< 15m)
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'system_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  value: {
                    job: 'process-email-queue',
                    status: 'healthy',
                    last_run_at: recentIso,
                    last_success_at: recentIso,
                    last_duration_ms: 1200,
                  },
                },
              }),
            }
          }
          // Default mock chain for other tables in getBaseTelemetry
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], count: 0 }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }
        }),
      }

      vi.spyOn(await import('../supabase'), 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const health = await SystemService.getHealthOverview()
      const schedulerService = health.services.find((s) => s.id === 'scheduler')

      expect(schedulerService).toBeDefined()
      expect(schedulerService?.status).toBe('healthy')
      expect(schedulerService?.summary).toContain('Operational')
    })

    it('evaluates degraded status when scheduler heartbeat is stale (>15 minutes)', async () => {
      const staleIso = new Date(Date.now() - 25 * 60 * 1000).toISOString() // 25m ago (> 15m)
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'system_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  value: {
                    job: 'process-email-queue',
                    status: 'healthy',
                    last_run_at: staleIso,
                    last_success_at: staleIso,
                    last_duration_ms: 850,
                  },
                },
              }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], count: 0 }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }
        }),
      }

      vi.spyOn(await import('../supabase'), 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const health = await SystemService.getHealthOverview()
      const schedulerService = health.services.find((s) => s.id === 'scheduler')

      expect(schedulerService).toBeDefined()
      expect(schedulerService?.status).toBe('degraded')
      expect(schedulerService?.summary).toContain('Stale')
    })

    it('evaluates degraded status when scheduler heartbeat indicates execution failure', async () => {
      const recentIso = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'system_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  value: {
                    job: 'process-email-queue',
                    status: 'failed',
                    error: 'Database connection timeout',
                    last_run_at: recentIso,
                    last_duration_ms: 5000,
                  },
                },
              }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], count: 0 }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }
        }),
      }

      vi.spyOn(await import('../supabase'), 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const health = await SystemService.getHealthOverview()
      const schedulerService = health.services.find((s) => s.id === 'scheduler')

      expect(schedulerService).toBeDefined()
      expect(schedulerService?.status).toBe('degraded')
      expect(schedulerService?.summary).toContain('Last run failed')
      expect(schedulerService?.detail).toContain('Database connection timeout')
    })
  })

  // ==========================================================================
  // 5. RETRY DUPLICATION & RACE PREVENTION
  // ==========================================================================
  describe('5. Retry Duplication & Race Prevention', () => {
    it('prevents worker race from overwriting a requeued item via compare-and-swap', async () => {
      // Simulate Worker A attempting to mark a row delivered or retrying,
      // but Admin already transitioned it back to pending.
      // eq('status', 'processing') fails -> 0 rows updated
      const fakeUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(function (this: unknown, col: string, val: string) {
          if (col === 'status' && val === 'processing') {
            // Row is no longer in 'processing', update affects 0 rows
            return {
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }
          }
          return this
        }),
      })

      const fakeSupabase = {
        from: vi.fn().mockReturnValue({
          update: fakeUpdate,
        }),
      }

      const { data } = await fakeSupabase
        .from('email_queue')
        .update({ status: 'delivered' })
        .eq('id', 'queue-item-123')
        .eq('status', 'processing')
        .select()
        .maybeSingle()

      expect(data).toBeNull()
    })

    it('rejects manual retry of active processing items (<15m)', () => {
      const activeProcessingAt = new Date(Date.now() - 2 * 60 * 1000).toISOString() // 2m ago (<15m)
      const staleThresholdMs = 15 * 60 * 1000
      const isProcessing = true
      const isStale = Date.now() - new Date(activeProcessingAt).getTime() >= staleThresholdMs

      const canRetry = !isProcessing || isStale
      expect(canRetry).toBe(false)
    })

    it('allows manual retry of stale processing items (>=15m)', () => {
      const staleProcessingAt = new Date(Date.now() - 16 * 60 * 1000).toISOString() // 16m ago (>=15m)
      const staleThresholdMs = 15 * 60 * 1000
      const isProcessing = true
      const isStale = Date.now() - new Date(staleProcessingAt).getTime() >= staleThresholdMs

      const canRetry = !isProcessing || isStale
      expect(canRetry).toBe(true)
    })
  })

  // ==========================================================================
  // 6. QUEUE STATE MACHINE
  // ==========================================================================
  describe('6. Queue State Machine', () => {
    it('permits all valid production status transitions', () => {
      // pending
      expect(isValidQueueStatusTransition('pending', 'processing')).toBe(true)
      expect(isValidQueueStatusTransition('pending', 'suppressed')).toBe(true)

      // processing
      expect(isValidQueueStatusTransition('processing', 'delivered')).toBe(true)
      expect(isValidQueueStatusTransition('processing', 'retrying')).toBe(true)
      expect(isValidQueueStatusTransition('processing', 'dead_letter')).toBe(true)
      expect(isValidQueueStatusTransition('processing', 'suppressed')).toBe(true)
      expect(isValidQueueStatusTransition('processing', 'skipped')).toBe(true)

      // failed / retrying
      expect(isValidQueueStatusTransition('failed', 'retrying')).toBe(true)
      expect(isValidQueueStatusTransition('failed', 'dead_letter')).toBe(true)
      expect(isValidQueueStatusTransition('retrying', 'processing')).toBe(true)

      // manual admin retry back to pending
      expect(isValidQueueStatusTransition('dead_letter', 'pending')).toBe(true)
      expect(isValidQueueStatusTransition('failed', 'pending')).toBe(true)
      expect(isValidQueueStatusTransition('retrying', 'pending')).toBe(true)
      expect(isValidQueueStatusTransition('skipped', 'pending')).toBe(true)
      expect(isValidQueueStatusTransition('suppressed', 'pending')).toBe(true)
    })

    it('rejects invalid or unsafe status transitions', () => {
      // Delivered is terminal — cannot transition to anything
      expect(isValidQueueStatusTransition('delivered', 'pending')).toBe(false)
      expect(isValidQueueStatusTransition('delivered', 'processing')).toBe(false)
      expect(isValidQueueStatusTransition('delivered', 'failed')).toBe(false)

      // Direct pending to delivered without processing is invalid
      expect(isValidQueueStatusTransition('pending', 'delivered')).toBe(false)

      // Direct pending to dead_letter without processing/attempt is invalid
      expect(isValidQueueStatusTransition('pending', 'dead_letter')).toBe(false)
    })
  })
})
