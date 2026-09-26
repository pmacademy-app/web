import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

import * as supabaseModule from '@/lib/supabase'
import {
  AUTOMATION_METADATA,
  DEFAULT_AUTOMATION_TOGGLES,
  EmailAutomationsService,
} from '../notifications/automations/service'
import { CommunicationsService } from '../admin/communications-service'
import { DEFAULT_LIFECYCLE_HOLDOUT_PERCENT } from '../notifications/lifecycle/holdout'

const LIFECYCLE_KEYS = [
  'lifecycle.d1_never_started',
  'lifecycle.d3_started_not_finished',
  'lifecycle.streak_broken',
] as const

/** Count-query mock: records .eq()/.in() filters, resolves to the matched row count. */
function countBuilder(rows: Array<Record<string, unknown>>, filters: Record<string, unknown> = {}) {
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (col: string, val: unknown) => countBuilder(rows, { ...filters, [col]: val })
  b.in = (col: string, vals: unknown[]) => countBuilder(rows, { ...filters, [`${col}__in`]: vals })
  b.then = (resolve: (v: { count: number; error: null }) => unknown) => {
    const matched = rows.filter((r) =>
      Object.entries(filters).every(([k, v]) => {
        if (k.endsWith('__in')) {
          const col = k.slice(0, -4)
          return (v as unknown[]).includes(r[col])
        }
        return r[k] === v
      })
    )
    return resolve({ count: matched.length, error: null })
  }
  return b
}

/** Permissive chainable mock; every query resolves to the same result. */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lte', 'not', 'or', 'single', 'maybeSingle']) {
    chain[m] = () => chain
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return chain
}

describe('Phase 1 Admin Panel — lifecycle automation controls', () => {
  it('AUTOMATION_METADATA exposes the three lifecycle sequences as non-critical, non-deferred toggles', () => {
    for (const key of LIFECYCLE_KEYS) {
      const meta = AUTOMATION_METADATA.find((a) => a.key === key)
      expect(meta, `metadata for ${key}`).toBeDefined()
      expect(meta!.isCritical).toBe(false)
      expect(meta!.isDeferred).toBeFalsy()
      expect(meta!.category).toBe('Scheduled')
      // Enabled by default so the sequences actually run once shipped.
      expect(DEFAULT_AUTOMATION_TOGGLES[key]).toBe(true)
    }
  })

  describe('EmailAutomationsService.getState / updateSetting', () => {
    const upserts: Array<Record<string, unknown>> = []

    beforeEach(() => {
      upserts.length = 0
      process.env.RESEND_API_KEY = '' // skip the outbound Resend usage fetch
      const mock = {
        from: (table: string) => {
          if (table === 'system_settings') {
            return {
              select: () => ({ in: async () => ({ data: [], error: null }) }),
              upsert: async (payload: Record<string, unknown>) => {
                upserts.push(payload)
                return { error: null }
              },
            }
          }
          return { select: () => ({ in: async () => ({ data: [], error: null }) }) }
        },
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mock as never)
    })

    afterEach(() => vi.restoreAllMocks())

    it('surfaces the lifecycle automations as enabled + toggleable in getState()', async () => {
      const state = await EmailAutomationsService.getState()
      for (const key of LIFECYCLE_KEYS) {
        const automation = state.automations.find((a) => a.key === key)
        expect(automation, `state automation ${key}`).toBeDefined()
        expect(automation!.isCritical).toBe(false)
        expect(automation!.enabled).toBe(true)
      }
    })

    it('toggling a lifecycle automation persists the change through the existing mechanism', async () => {
      const result = await EmailAutomationsService.updateSetting('toggle', {
        automationKey: 'lifecycle.d1_never_started',
        enabled: false,
      })
      expect(result.success).toBe(true)

      const automationUpsert = upserts.find((u) => u.key === 'email_automations')
      expect(automationUpsert).toBeDefined()
      const toggles = automationUpsert!.value as Record<string, boolean>
      // The toggled sequence is now off; the others remain at their default (on).
      expect(toggles['lifecycle.d1_never_started']).toBe(false)
      expect(toggles['lifecycle.d3_started_not_finished']).toBe(true)
      expect(toggles['lifecycle.streak_broken']).toBe(true)
    })
  })
})

describe('Phase 1 Admin Panel — lifecycle metrics data sources', () => {
  afterEach(() => vi.restoreAllMocks())

  it('derives treated/delivered/failed from email_queue and holdout from notification_events', async () => {
    const emailRows = [
      // d1: 5 treated (3 delivered, 1 dead_letter, 1 pending)
      { template_key: 'lifecycle.d1_never_started', status: 'delivered' },
      { template_key: 'lifecycle.d1_never_started', status: 'delivered' },
      { template_key: 'lifecycle.d1_never_started', status: 'delivered' },
      { template_key: 'lifecycle.d1_never_started', status: 'dead_letter' },
      { template_key: 'lifecycle.d1_never_started', status: 'pending' },
      // d3: 2 treated (2 delivered)
      { template_key: 'lifecycle.d3_started_not_finished', status: 'delivered' },
      { template_key: 'lifecycle.d3_started_not_finished', status: 'delivered' },
      // unrelated template must never be counted
      { template_key: 'learning.daily_reminder', status: 'delivered' },
    ]
    const eventRows = [
      { skipped_reason: 'lifecycle_holdout:lifecycle.d1_never_started' },
      { skipped_reason: 'lifecycle_holdout:lifecycle.d1_never_started' },
      { skipped_reason: 'lifecycle_holdout:lifecycle.streak_broken' },
      { skipped_reason: 'user_preference_disabled:learning' }, // must not count
    ]
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue({
      from: (table: string) =>
        table === 'notification_events' ? countBuilder(eventRows) : countBuilder(emailRows),
    } as never)

    const metrics = await CommunicationsService.getLifecycleMetrics()
    expect(metrics.holdoutPercent).toBe(DEFAULT_LIFECYCLE_HOLDOUT_PERCENT)

    const byKey = new Map(metrics.sequences.map((s) => [s.key, s]))
    expect(byKey.get('lifecycle.d1_never_started')).toMatchObject({ treated: 5, delivered: 3, failed: 1, holdout: 2 })
    expect(byKey.get('lifecycle.d3_started_not_finished')).toMatchObject({ treated: 2, delivered: 2, failed: 0, holdout: 0 })
    expect(byKey.get('lifecycle.streak_broken')).toMatchObject({ treated: 0, delivered: 0, failed: 0, holdout: 1 })
  })

  it('renders a clean zero/empty state when there is no lifecycle data yet', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue({
      from: () => countBuilder([]),
    } as never)

    const metrics = await CommunicationsService.getLifecycleMetrics()
    expect(metrics.holdoutPercent).toBe(DEFAULT_LIFECYCLE_HOLDOUT_PERCENT)
    expect(metrics.sequences).toHaveLength(3)
    for (const s of metrics.sequences) {
      expect(s).toMatchObject({ treated: 0, delivered: 0, failed: 0, holdout: 0 })
    }
  })

  it('holdout information reflects the actual code constant (30%)', () => {
    expect(DEFAULT_LIFECYCLE_HOLDOUT_PERCENT).toBe(30)
  })
})

describe('Phase 1 Admin Panel — global pause visibility on the communications overview', () => {
  afterEach(() => vi.restoreAllMocks())

  it('surfaces globalPause=true when the master switch is paused', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue({
      from: () => makeChain({ count: 0, data: [], error: null }),
    } as never)
    vi.spyOn(EmailAutomationsService, 'isGlobalPauseActive').mockResolvedValue(true)

    const overview = await CommunicationsService.getCommunicationsOverview()
    expect(overview.globalPause).toBe(true)
  })

  it('surfaces globalPause=false when delivery is active', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue({
      from: () => makeChain({ count: 0, data: [], error: null }),
    } as never)
    vi.spyOn(EmailAutomationsService, 'isGlobalPauseActive').mockResolvedValue(false)

    const overview = await CommunicationsService.getCommunicationsOverview()
    expect(overview.globalPause).toBe(false)
  })
})

describe('Phase 1 Admin Panel — authorization is preserved for the new surfaces', () => {
  const repoFile = (rel: string) => readFileSync(path.resolve(import.meta.dirname, rel), 'utf8')

  it('the automations toggle API (used by lifecycle controls) is admin-only on GET and POST', () => {
    const src = repoFile('../../app/api/admin/emails/automations/route.ts')
    const adminGuards = src.match(/actor:\s*\{\s*allow:\s*\['admin'\]\s*\}/g) || []
    expect(adminGuards.length).toBeGreaterThanOrEqual(2)
  })

  it('the admin console layout guards every rendered page (including the lifecycle UI) server-side', () => {
    const src = repoFile('../../app/admin/(console)/layout.tsx')
    expect(src).toContain('isAdminUser')
    expect(src).toContain("redirect('/admin/access-denied')")
  })
})
