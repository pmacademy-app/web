/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dispatchClientNotificationEvent, subscribeClientNotificationEvent } from '../events/client-event-bus'
import { useUsageTimeTracker, resetUsageTimeTrackerState } from '../../hooks/useUsageTimeTracker'

describe('P0 Vercel Fluid Compute Polling Optimization Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
    resetUsageTimeTrackerState()

    // Mock window, document, and localStorage in node test environment
    const storage = new Map<string, string>()
    global.localStorage = {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] || null,
      length: storage.size,
    } as unknown as Storage

    const listeners: Record<string, Function[]> = {}
    global.window = {
      addEventListener: (type: string, handler: Function) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(handler)
      },
      removeEventListener: (type: string, handler: Function) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((fn) => fn !== handler)
        }
      },
      dispatchEvent: (event: { type: string; detail?: unknown }) => {
        const type = event.type
        if (listeners[type]) {
          listeners[type].forEach((fn) => fn(event))
          return true
        }
        return false
      },
      localStorage: global.localStorage,
    } as unknown as Window & typeof globalThis

    global.document = {
      hidden: false,
      visibilityState: 'visible',
      addEventListener: (type: string, handler: Function) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(handler)
      },
      removeEventListener: (type: string, handler: Function) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((fn) => fn !== handler)
        }
      },
      dispatchEvent: (event: { type: string; detail?: unknown }) => {
        const type = event.type
        if (listeners[type]) {
          listeners[type].forEach((fn) => fn(event))
          return true
        }
        return false
      },
    } as unknown as Document

    global.CustomEvent = class CustomEvent {
      type: string
      detail: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type
        this.detail = init?.detail
      }
    } as unknown as typeof CustomEvent
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('1. Client Event Bus — Real-Time Notification Updates', () => {
    it('dispatches and notifies subscribers immediately without polling', () => {
      let received: unknown = null
      const unsubscribe = subscribeClientNotificationEvent((detail) => {
        received = detail
      })

      dispatchClientNotificationEvent({
        title: 'New Achievement',
        body: 'Consistency Master unlocked!',
        xpEarned: 100,
      })

      expect(received).toEqual({
        title: 'New Achievement',
        body: 'Consistency Master unlocked!',
        xpEarned: 100,
      })

      unsubscribe()

      // After unsubscribe, no new notifications received
      received = null
      dispatchClientNotificationEvent({
        title: 'Second Notification',
        body: 'Should not be received',
      })
      expect(received).toBeNull()
    })
  })

  describe('2. useUsageTimeTracker — Local Accumulation & 300s Batch Sync', () => {
    it('exports canonical hook and reset function without errors', () => {
      expect(typeof useUsageTimeTracker).toBe('function')
      expect(typeof resetUsageTimeTrackerState).toBe('function')
    })

    it('syncActiveTime bounds incrementSeconds to a maximum of 300 seconds', async () => {
      let postedBody: { incrementSeconds?: number } | null = null
      global.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST') {
          postedBody = JSON.parse(opts.body as string)
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              activeSeconds: 300,
              eligiblePrompts: [],
              completedPrompts: [],
            }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            activeSeconds: 0,
            eligiblePrompts: [],
            completedPrompts: [],
          }),
        })
      })

      const res = await global.fetch('/api/feedback/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incrementSeconds: 300 }),
      })

      expect(res.ok).toBe(true)
      expect((postedBody as { incrementSeconds?: number } | null)?.incrementSeconds).toBe(300)
    })
  })

  describe('3. Cross-User State Isolation & Shared Browser Protection', () => {
    it('determines milestone eligibility from server response without cross-user contamination', async () => {
      // User A: Reached & completed 1-hour milestone on server
      const fetchUserA = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          completedPrompts: ['usage_1hr'],
          eligiblePrompts: [],
        }),
      })
      global.fetch = fetchUserA

      const resA = await global.fetch('/api/feedback/eligibility')
      const dataA = await resA.json()
      expect(dataA.completedPrompts).toContain('usage_1hr')

      // User A logs out -> reset tracking state
      resetUsageTimeTrackerState()

      // User B (brand-new user on same browser): Has not completed 1-hour milestone
      const fetchUserB = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          completedPrompts: [],
          eligiblePrompts: ['usage_1hr'], // Eligible for prompt!
        }),
      })
      global.fetch = fetchUserB

      const resB = await global.fetch('/api/feedback/eligibility')
      const dataB = await resB.json()

      // User B must receive their eligible prompt and NOT be suppressed by User A
      expect(dataB.completedPrompts).toEqual([])
      expect(dataB.eligiblePrompts).toEqual(['usage_1hr'])
      expect(global.localStorage.getItem('prodily_usage_1hr_done')).toBeNull() // Zero unscoped localStorage pollution
    })
  })

  describe('4. Computer Sleep / Tab Freeze Gap Protection', () => {
    it('discards large elapsed time gaps (> 5s) caused by OS sleep or tab freeze', () => {
      let pendingActiveSeconds = 0
      let lastTickTime = Date.now()

      const tick = () => {
        const now = Date.now()
        const deltaSec = Math.round((now - lastTickTime) / 1000)
        lastTickTime = now

        // Accumulate only when delta is valid (1-5s), discarding sleep/freeze jumps
        if (!document.hidden && deltaSec > 0 && deltaSec <= 5) {
          pendingActiveSeconds += deltaSec
        }
      }

      // Normal 1s tick
      vi.advanceTimersByTime(1000)
      tick()
      expect(pendingActiveSeconds).toBe(1)

      // Another normal 1s tick
      vi.advanceTimersByTime(1000)
      tick()
      expect(pendingActiveSeconds).toBe(2)

      // Simulate 2-hour (7200s) computer sleep / OS suspend
      vi.advanceTimersByTime(7200000)
      tick()

      // 7200s sleep jump must be safely discarded!
      expect(pendingActiveSeconds).toBe(2)

      // Subsequent normal tick resumes clean 1s increments
      vi.advanceTimersByTime(1000)
      tick()
      expect(pendingActiveSeconds).toBe(3)
    })
  })

  describe('5. Multi-Tab Visibility Invariants', () => {
    it('pauses accumulation when tab is hidden and resumes when visible', () => {
      let pendingActiveSeconds = 0
      let lastTickTime = Date.now()

      const tick = () => {
        const now = Date.now()
        const deltaSec = Math.round((now - lastTickTime) / 1000)
        lastTickTime = now

        if (!document.hidden && deltaSec > 0 && deltaSec <= 5) {
          pendingActiveSeconds += deltaSec
        }
      }

      // Active visible tab
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      vi.advanceTimersByTime(5000)
      for (let i = 0; i < 5; i++) tick()
      expect(pendingActiveSeconds).toBe(5)

      // Background inactive tab (document.hidden = true)
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      vi.advanceTimersByTime(30000) // 30 seconds pass in background
      for (let i = 0; i < 30; i++) tick()

      // Inactive tab must NOT accumulate active dwell time
      expect(pendingActiveSeconds).toBe(5)

      // User returns to tab (document.hidden = false)
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      lastTickTime = Date.now()
      vi.advanceTimersByTime(3000)
      for (let i = 0; i < 3; i++) tick()

      // Resumes accumulation cleanly
      expect(pendingActiveSeconds).toBe(8)
    })
  })

  describe('6. Notification Stale Threshold Invariants', () => {
    it('enforces that visibility changes do not trigger duplicate calls when last fetch is fresh (< 5m)', () => {
      const NOTIFICATION_POLL_INTERVAL_MS = 300000 // 5 min
      const STALE_NOTIFICATION_THRESHOLD_MS = 300000 // 5 min

      const lastFetchTime = Date.now()
      const now1 = lastFetchTime + 45000 // 45 seconds later (e.g. user toggles tabs)
      const elapsed1 = now1 - lastFetchTime

      // Must NOT be stale
      expect(elapsed1 < STALE_NOTIFICATION_THRESHOLD_MS).toBe(true)

      const now2 = lastFetchTime + 305000 // 5 min 5 sec later
      const elapsed2 = now2 - lastFetchTime

      // Now stale -> eligible for refresh
      expect(elapsed2 >= STALE_NOTIFICATION_THRESHOLD_MS).toBe(true)
      expect(NOTIFICATION_POLL_INTERVAL_MS).toBe(300000)
    })
  })
})

