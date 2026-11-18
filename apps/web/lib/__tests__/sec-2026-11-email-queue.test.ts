/**
 * Security review 2026-11 (M4, L1, L2, L3): the notification queue.
 *
 * M4: the queue now reserves per-provider quota the same way the governed gateway
 *     does, and gives it back when no provider accepted the message.
 * L1: enqueue attaches the recipient's unsubscribe token.
 * L2: the suppression check lowercases and fails closed.
 * L3: only an explicit allowlist of variables reaches the provider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'

vi.mock('../notifications/feature-flags/service', () => ({
  globalFeatureFlagService: {
    isEnabled: vi.fn(() => true),
    isEnabledAsync: vi.fn(async () => true),
    ensureHydrated: vi.fn(async () => undefined),
  },
}))

vi.mock('../notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 100 })),
    isAutomationEnabled: vi.fn(async () => true),
    isGlobalPauseActive: vi.fn(async () => false),
  },
}))

vi.mock('../../emails', () => ({
  renderEmailTemplate: vi.fn(async () => ({ html: '<p>Hi</p>', text: 'Hi', subject: 'Hi' })),
}))

const sendWithFailover = vi.fn()
vi.mock('../notifications/providers', () => ({
  globalProviderRegistry: {},
  sendEmailWithFailover: (...args: unknown[]) => sendWithFailover(...args),
}))

const reserve = vi.fn()
const release = vi.fn()
vi.mock('../notifications/providers/provider-quota', () => ({
  reserveProviderQuota: (...args: unknown[]) => reserve(...args),
  releaseProviderQuota: (...args: unknown[]) => release(...args),
}))

vi.mock('../notifications/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../notifications/config')>()),
  resolvePrimaryProvider: () => 'brevo',
  getSecondaryProvider: () => 'resend',
  isProviderConfigured: () => true,
}))

import { processEmailQueue, enqueueNotificationItem, buildQueueProviderVariables } from '../notifications/queue/processor'
import { createDefaultNotificationPreferences } from '../notifications/preferences/defaults'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-1',
    user_id: 'user-1',
    to_email: 'Learner@Example.COM',
    to_name: 'Learner',
    template_key: 'learning.weekly_recap',
    template_variables: {},
    attempt_count: 1,
    max_attempts: 3,
    ...overrides,
  }
}

function fakeSupabase(opts: {
  rows: Array<Record<string, unknown>>
  suppression?: { data: unknown; error: unknown } | 'throw'
  onUpdate?: (p: Record<string, unknown>) => void
  onSuppressionEmail?: (email: string) => void
  onInsert?: (p: Record<string, unknown>) => void
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_email_queue_items') return { data: opts.rows, error: null }
    if (name === 'increment_daily_email_quota') return { data: true, error: null }
    return { data: null, error: null }
  })
  const generic = (): Record<string, unknown> => ({
    select: () => generic(),
    eq: () => generic(),
    in: () => generic(),
    limit: () => generic(),
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    insert: () => generic(),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })
  const from = (table: string) => {
    if (table === 'email_suppressions') {
      return {
        select: () => ({
          eq: (_c: string, email: string) => {
            opts.onSuppressionEmail?.(email)
            return {
              maybeSingle: async () => {
                if (opts.suppression === 'throw') throw new Error('db down')
                return opts.suppression ?? { data: null, error: null }
              },
            }
          },
        }),
      }
    }
    if (table === 'email_queue') {
      return {
        ...generic(),
        update: (p: Record<string, unknown>) => ({
          eq: async () => {
            opts.onUpdate?.(p)
            return { data: null, error: null }
          },
        }),
        insert: (p: Record<string, unknown>) => {
          opts.onInsert?.(p)
          return { select: () => ({ single: async () => ({ data: { id: 'new-q' }, error: null }) }) }
        },
      }
    }
    return generic()
  }
  return { rpc, from } as unknown as SupabaseClient<Database>
}

beforeEach(() => {
  vi.clearAllMocks()
  sendWithFailover.mockResolvedValue({ success: true, provider: 'brevo', externalId: 'x', attempts: [], failedOver: false })
  reserve.mockResolvedValue(true)
  release.mockResolvedValue(undefined)
})

describe('L2: queue suppression check', () => {
  it('looks the address up lowercased', async () => {
    const emails: string[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({ rows: [row()], onSuppressionEmail: (e) => emails.push(e) })
    )
    await processEmailQueue(10)
    expect(emails).toEqual(['learner@example.com'])
  })

  for (const failure of [{ data: null, error: { message: 'timeout' } }, 'throw' as const]) {
    it(`fails closed on a suppression read ${failure === 'throw' ? 'exception' : 'error'}: no send, item left for retry`, async () => {
      const updates: Record<string, unknown>[] = []
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
        fakeSupabase({ rows: [row()], suppression: failure, onUpdate: (p) => updates.push(p) })
      )
      const result = await processEmailQueue(10)
      expect(sendWithFailover).not.toHaveBeenCalled()
      expect(result.skipped).toBe(1)
      expect(updates[0]).toMatchObject({ status: 'retrying', error_message: 'Suppression check unavailable', attempt_count: 0 })
    })
  }

  it('critical auth mail does not depend on the suppression read', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({ rows: [row({ template_key: 'auth.password_reset' })], suppression: 'throw' })
    )
    const result = await processEmailQueue(10)
    expect(result.delivered).toBe(1)
  })
})

describe('M4: per-provider quota reservation on the queue path', () => {
  it('reserves before dispatch and keeps the reservation on success', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ rows: [row()] }))
    await processEmailQueue(10)
    expect(reserve).toHaveBeenCalledWith('brevo', 100)
    expect(release).not.toHaveBeenCalled()
  })

  it('releases the reservation when no provider accepted the message', async () => {
    sendWithFailover.mockResolvedValue({ success: false, provider: 'brevo', error: 'HTTP 503', attempts: [{ providerName: 'brevo', success: false, statusCode: 503, timestamp: '' }], failedOver: false })
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ rows: [row()] }))
    await processEmailQueue(10)
    expect(release).toHaveBeenCalledWith('brevo')
  })

  it('starts on the secondary when the primary is spent', async () => {
    reserve.mockImplementation(async (provider: string) => provider === 'resend')
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ rows: [row()] }))
    await processEmailQueue(10)
    expect(sendWithFailover.mock.calls[0][2]).toBe('resend')
  })

  it('defers without sending when both providers are spent', async () => {
    reserve.mockResolvedValue(false)
    const updates: Record<string, unknown>[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ rows: [row()], onUpdate: (p) => updates.push(p) }))
    const result = await processEmailQueue(10)
    expect(sendWithFailover).not.toHaveBeenCalled()
    expect(result.skipped).toBe(1)
    expect(updates[0]).toMatchObject({ status: 'retrying', error_message: 'All provider quotas exhausted' })
  })
})

describe('L3: provider variables are an allowlist', () => {
  it('drops headers, tags, sender and reply-to from template variables', () => {
    const vars = buildQueueProviderVariables(
      {
        userName: 'A',
        unsubscribeToken: ' tok ',
        headers: { Bcc: 'spy@evil.example' },
        customHeaders: { X: '1' },
        tags: ['x'],
        fromEmail: 'ceo@evil.example',
        replyTo: 'spy@evil.example',
      },
      { subject: 'S', html: '<p>h</p>', text: 't' }
    )
    expect(Object.keys(vars).sort()).toEqual(['fromEmail', 'html', 'subject', 'text', 'unsubscribeToken'])
    expect(vars.fromEmail).not.toBe('ceo@evil.example')
    expect(vars.unsubscribeToken).toBe('tok')
  })

  it('is what the processor hands to the provider', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({ rows: [row({ template_variables: { headers: { Bcc: 'x@evil.example' }, unsubscribeToken: 'tok' } })] })
    )
    await processEmailQueue(10)
    const variables = (sendWithFailover.mock.calls[0][0] as { variables: Record<string, unknown> }).variables
    expect(variables.headers).toBeUndefined()
    expect(variables.unsubscribeToken).toBe('tok')
  })
})

describe('L1: enqueue attaches the unsubscribe token', () => {
  it('adds the token from the preloaded preferences', async () => {
    const inserts: Record<string, unknown>[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ rows: [], onInsert: (p) => inserts.push(p) }))
    const prefs = { ...createDefaultNotificationPreferences('user-1'), unsubscribeToken: 'tok-123' }
    const res = await enqueueNotificationItem({
      userId: 'user-1',
      toEmail: 'learner@example.com',
      channel: 'email',
      templateKey: 'learning.weekly_recap',
      templateVariables: { userName: 'A' },
      eventType: 'learning.weekly_recap',
      category: 'learning',
      priorityLevel: 'low',
      preloadedPreferences: prefs,
      idempotencyKey: 'k-1',
    })
    expect(res.success).toBe(true)
    expect(inserts[0].template_variables).toEqual({ userName: 'A', unsubscribeToken: 'tok-123' })
  })

  it('keeps a token the caller already supplied', async () => {
    const inserts: Record<string, unknown>[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ rows: [], onInsert: (p) => inserts.push(p) }))
    await enqueueNotificationItem({
      userId: 'user-1',
      toEmail: 'learner@example.com',
      channel: 'email',
      templateKey: 'learning.weekly_recap',
      templateVariables: { unsubscribeToken: 'caller' },
      eventType: 'learning.weekly_recap',
      category: 'learning',
      priorityLevel: 'low',
      preloadedPreferences: { ...createDefaultNotificationPreferences('user-1'), unsubscribeToken: 'other' },
      idempotencyKey: 'k-2',
    })
    expect((inserts[0].template_variables as Record<string, unknown>).unsubscribeToken).toBe('caller')
  })

  it('does not add a token to critical auth mail', async () => {
    const inserts: Record<string, unknown>[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ rows: [], onInsert: (p) => inserts.push(p) }))
    await enqueueNotificationItem({
      userId: 'user-1',
      toEmail: 'learner@example.com',
      channel: 'email',
      templateKey: 'auth.password_reset',
      templateVariables: { resetUrl: 'https://prodily.app/x' },
      eventType: 'auth.password_reset',
      category: 'security',
      priorityLevel: 'critical',
      preloadedPreferences: { ...createDefaultNotificationPreferences('user-1'), unsubscribeToken: 'tok' },
      idempotencyKey: 'k-3',
    })
    expect(inserts[0].template_variables).toEqual({ resetUrl: 'https://prodily.app/x' })
  })
})
