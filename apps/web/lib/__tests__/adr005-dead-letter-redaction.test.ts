/**
 * ADR-005 / SEC-17: dead-lettered auth emails must not keep their one-time links.
 *
 * `auth.password_reset` carries `resetUrl` and `auth.verify_email` carries
 * `verificationUrl`, both with a live token. When such a row dead-letters, its
 * `template_variables` are replaced by a `{ _scrubbed: ... }` marker, on every path that
 * writes `dead_letter`: the processor's permanent-failure handler, the stale-lease
 * fallback and the reclaim RPC. Non-auth templates keep their variables so an admin
 * retry can still re-render them, and an admin retry of a scrubbed auth row is refused.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
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
    getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 1000 })),
    isAutomationEnabled: vi.fn(async () => true),
  },
}))

const renderEmailTemplate = vi.fn()
vi.mock('../../emails', () => ({
  renderEmailTemplate: (...args: unknown[]) => renderEmailTemplate(...args),
}))

vi.mock('../monitoring/logger', () => ({
  logErrorReport: vi.fn(),
  logSystemError: vi.fn(),
}))

const requireAdminUser = vi.fn()
const logAdminAction = vi.fn()
vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => requireAdminUser(req),
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
}))

vi.mock('@/lib/admin/cache-tags', () => ({
  revalidateAdminShell: vi.fn(),
}))

const {
  AUTH_EMAIL_EXPIRED_RETRY_MESSAGE,
  isAuthTemplateKey,
  isExpiredAuthQueueRow,
  scrubTemplateVariablesForDeadLetter,
} = await import('../notifications/queue/helpers')
const { processEmailQueue, reclaimStaleProcessingItems } = await import('../notifications/queue/processor')
const { POST: retryOnePost } = await import('../../app/api/admin/emails/queue/[id]/retry/route')
const { POST: retrySelectedPost } = await import('../../app/api/admin/emails/queue/retry-selected/route')
const { POST: retryAllPost } = await import('../../app/api/admin/emails/queue/retry-all/route')

const RESET_VARS = {
  userName: 'Learner',
  resetUrl: 'https://example.test/auth/reset-password?token=live-reset-token',
}
const VERIFY_VARS = {
  userName: 'Learner',
  verificationUrl: 'https://example.test/auth/confirm?token=live-verify-token',
}
const MODULE_VARS = { userName: 'Learner', moduleName: 'Foundations', moduleSlug: 'foundations' }

const ADMIN = { authorized: true, userId: 'admin-1', email: 'admin@example.test' }

// ─── Fakes ────────────────────────────────────────────────────────────────────

/**
 * Fake client for one processor batch. The claim RPC hands out `claimedRows`; every
 * `email_queue` update payload is captured so the final row state can be asserted.
 */
function buildProcessorSupabase(claimedRows: Array<Record<string, unknown>>) {
  const updates: Record<string, unknown>[] = []
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_email_queue_items') return { data: claimedRows, error: null }
    if (name === 'increment_daily_email_quota') return { data: true, error: null }
    return { data: null, error: null }
  })

  const readChain = (): Record<string, unknown> => {
    const node: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'gte', 'in', 'order', 'limit']) {
      node[method] = () => readChain()
    }
    node.maybeSingle = async () => ({ data: null, error: null })
    node.single = async () => ({ data: null, error: null })
    node.then = undefined
    return node
  }

  const from = (table: string) => {
    if (table === 'email_queue') {
      return {
        ...readChain(),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload)
          return { eq: async () => ({ data: null, error: null }) }
        },
      }
    }
    return {
      ...readChain(),
      insert: () => ({ ...readChain(), then: undefined }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
      upsert: async () => ({ data: null, error: null }),
    }
  }

  return { client: { rpc, from } as unknown as SupabaseClient<Database>, updates }
}

function queueRow(templateKey: string, templateVariables: Record<string, unknown>, id = 'queue-1') {
  return {
    id,
    user_id: 'user-1',
    to_email: 'learner@example.test',
    to_name: 'Learner',
    template_key: templateKey,
    template_variables: templateVariables,
    attempt_count: 1,
    max_attempts: 3,
  }
}

async function deadLetterViaRenderFailure(templateKey: string, vars: Record<string, unknown>) {
  const { client, updates } = buildProcessorSupabase([queueRow(templateKey, vars)])
  vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)
  renderEmailTemplate.mockRejectedValueOnce(new Error('template exploded'))

  const result = await processEmailQueue(10)
  const deadLetter = updates.find((u) => u.status === 'dead_letter')
  return { result, deadLetter }
}

/**
 * Fake client for an admin retry route. `rows` answers the route's select; every
 * `email_queue` update payload is recorded.
 */
function buildRouteSupabase(rows: Array<Record<string, unknown>>) {
  const updates: Record<string, unknown>[] = []

  const chain = (result: () => unknown): Record<string, unknown> => {
    const node: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'or', 'lte', 'order', 'limit']) {
      node[method] = () => chain(result)
    }
    node.maybeSingle = async () => {
      const value = result() as { data: unknown }
      return { data: Array.isArray(value.data) ? value.data[0] ?? null : value.data, error: null }
    }
    node.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return node
  }

  const from = (table: string) => {
    if (table === 'email_queue') {
      return {
        ...chain(() => ({ data: rows, error: null })),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload)
          return chain(() => ({ data: { id: 'x', status: 'pending' }, error: null, count: 1 }))
        },
      }
    }
    return chain(() => ({ data: [], error: null }))
  }

  return { client: { from } as unknown as SupabaseClient<Database>, updates }
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  renderEmailTemplate.mockReset().mockImplementation(async (key: string) => ({
    html: `<p>${key}</p>`,
    text: key,
    subject: `Subject: ${key}`,
  }))
  requireAdminUser.mockReset().mockResolvedValue(ADMIN)
  logAdminAction.mockReset().mockResolvedValue(undefined)
})

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('ADR-005: scrubTemplateVariablesForDeadLetter', () => {
  it('drops resetUrl from auth.password_reset and leaves only the marker', () => {
    const scrubbed = scrubTemplateVariablesForDeadLetter('auth.password_reset', RESET_VARS)
    expect(scrubbed).toEqual({ _scrubbed: 'dead_letter' })
    expect(JSON.stringify(scrubbed)).not.toContain('live-reset-token')
  })

  it('drops verificationUrl from auth.verify_email', () => {
    const scrubbed = scrubTemplateVariablesForDeadLetter('auth.verify_email', VERIFY_VARS)
    expect(scrubbed).toEqual({ _scrubbed: 'dead_letter' })
    expect(scrubbed).not.toHaveProperty('verificationUrl')
  })

  it('covers every auth.* template, not just the two critical ones', () => {
    expect(isAuthTemplateKey('auth.email_change_verify')).toBe(true)
    expect(isAuthTemplateKey('auth.invite')).toBe(true)
    expect(isAuthTemplateKey('learning.module_complete')).toBe(false)
    expect(isAuthTemplateKey(null)).toBe(false)
  })

  it('keeps a non-auth template\'s variables unchanged', () => {
    expect(scrubTemplateVariablesForDeadLetter('learning.module_complete', MODULE_VARS)).toEqual(MODULE_VARS)
  })

  it('treats a scrubbed or empty auth row as expired, and an intact one as retryable', () => {
    expect(isExpiredAuthQueueRow('auth.password_reset', { _scrubbed: 'dead_letter' })).toBe(true)
    expect(isExpiredAuthQueueRow('auth.verify_email', {})).toBe(true)
    expect(isExpiredAuthQueueRow('auth.verify_email', null)).toBe(true)
    expect(isExpiredAuthQueueRow('auth.password_reset', RESET_VARS)).toBe(false)
    expect(isExpiredAuthQueueRow('learning.module_complete', {})).toBe(false)
  })
})

// ─── Processor: handlePermanentFailure ────────────────────────────────────────

describe('ADR-005: processor dead-letter writes', () => {
  it('writes a dead-lettered auth.password_reset row without resetUrl', async () => {
    const { result, deadLetter } = await deadLetterViaRenderFailure('auth.password_reset', RESET_VARS)

    expect(result.failed).toBe(1)
    expect(deadLetter).toBeDefined()
    expect(deadLetter?.template_variables).toEqual({ _scrubbed: 'dead_letter' })
    expect(JSON.stringify(deadLetter)).not.toContain('resetUrl')
    expect(JSON.stringify(deadLetter)).not.toContain('live-reset-token')
  })

  it('writes a dead-lettered auth.verify_email row without verificationUrl', async () => {
    const { deadLetter } = await deadLetterViaRenderFailure('auth.verify_email', VERIFY_VARS)

    expect(deadLetter?.template_variables).toEqual({ _scrubbed: 'dead_letter' })
    expect(JSON.stringify(deadLetter)).not.toContain('verificationUrl')
  })

  it('keeps a dead-lettered non-auth row\'s variables for a later retry', async () => {
    const { deadLetter } = await deadLetterViaRenderFailure('learning.module_complete', MODULE_VARS)

    expect(deadLetter?.template_variables).toEqual(MODULE_VARS)
  })

  it('scrubs an auth row once it is delivered, and leaves a delivered non-auth row alone', async () => {
    const { client, updates } = buildProcessorSupabase([
      queueRow('auth.password_reset', RESET_VARS, 'auth-row'),
      queueRow('learning.module_complete', MODULE_VARS, 'module-row'),
    ])
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)

    const result = await processEmailQueue(10)
    const delivered = updates.filter((u) => u.status === 'delivered')

    expect(result.delivered).toBe(2)
    expect(delivered).toHaveLength(2)
    expect(delivered.filter((u) => 'template_variables' in u)).toEqual([
      expect.objectContaining({ template_variables: { _scrubbed: 'delivered' } }),
    ])
  })
})

// ─── Processor: stale-lease paths ─────────────────────────────────────────────

describe('ADR-005: stale-lease dead letters', () => {
  function staleFallbackSupabase(rows: Array<Record<string, unknown>>) {
    const updates: Record<string, unknown>[] = []
    const selects: string[] = []
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }),
      from: vi.fn().mockReturnValue({
        select: vi.fn(function (this: unknown, columns: string) {
          selects.push(columns)
          return this
        }),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: rows }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload)
          return {
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'row' } }),
          }
        }),
      }),
    }
    return { client, updates, selects }
  }

  const exhausted = (id: string, templateKey: string) => ({
    id,
    status: 'processing',
    template_key: templateKey,
    attempt_count: 3,
    max_attempts: 3,
  })

  it('the compare-and-swap fallback scrubs an exhausted auth row', async () => {
    const { client, updates, selects } = staleFallbackSupabase([exhausted('auth-row', 'auth.password_reset')])

    const result = await reclaimStaleProcessingItems(client as never)

    expect(result.items).toEqual([{ id: 'auth-row', newStatus: 'dead_letter' }])
    expect(selects[0]).toContain('template_key')
    expect(updates[0].status).toBe('dead_letter')
    expect(updates[0].template_variables).toEqual({ _scrubbed: 'dead_letter' })
  })

  it('the compare-and-swap fallback leaves a non-auth row\'s variables untouched', async () => {
    const { client, updates } = staleFallbackSupabase([exhausted('module-row', 'learning.module_complete')])

    await reclaimStaleProcessingItems(client as never)

    expect(updates[0].status).toBe('dead_letter')
    expect(updates[0]).not.toHaveProperty('template_variables')
  })

  it('scrubs auth rows the reclaim RPC dead-lettered, and only those', async () => {
    const calls: Array<{ op: string; args: unknown[] }> = []
    const builder: Record<string, unknown> = {}
    for (const op of ['in', 'like', 'eq']) {
      builder[op] = (...args: unknown[]) => {
        calls.push({ op, args })
        return builder
      }
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    const update = vi.fn((payload: Record<string, unknown>) => {
      calls.push({ op: 'update', args: [payload] })
      return builder
    })
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          { id: 'dead-1', new_status: 'dead_letter' },
          { id: 'retry-1', new_status: 'retrying' },
        ],
        error: null,
      }),
      from: vi.fn(() => ({ update })),
    }

    const result = await reclaimStaleProcessingItems(client as never)

    expect(result.reclaimedCount).toBe(2)
    expect(calls).toEqual([
      { op: 'update', args: [{ template_variables: { _scrubbed: 'dead_letter' } }] },
      { op: 'in', args: ['id', ['dead-1']] },
      { op: 'like', args: ['template_key', 'auth.%'] },
      { op: 'eq', args: ['status', 'dead_letter'] },
    ])
  })

  it('does not issue a scrub when the reclaim RPC dead-lettered nothing', async () => {
    const from = vi.fn()
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: [{ id: 'retry-1', new_status: 'retrying' }], error: null }),
      from,
    }

    await reclaimStaleProcessingItems(client as never)

    expect(from).not.toHaveBeenCalled()
  })
})

// ─── Admin retry routes ───────────────────────────────────────────────────────

describe('ADR-005: admin retry refuses scrubbed auth rows', () => {
  const scrubbedAuthRow = {
    id: 'auth-row',
    to_email: 'learner@example.test',
    template_key: 'auth.password_reset',
    template_variables: { _scrubbed: 'dead_letter' },
    status: 'dead_letter',
    attempt_count: 3,
    processing_at: null,
  }
  const moduleRow = {
    id: 'module-row',
    to_email: 'learner@example.test',
    template_key: 'learning.module_complete',
    template_variables: MODULE_VARS,
    status: 'dead_letter',
    attempt_count: 3,
    processing_at: null,
  }

  it('POST /queue/[id]/retry refuses with the expired-link message and does not requeue', async () => {
    const { client, updates } = buildRouteSupabase([scrubbedAuthRow])
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)

    const res = await retryOnePost(
      new NextRequest('https://example.test/api/admin/emails/queue/auth-row/retry', { method: 'POST' }),
      { params: Promise.resolve({ id: 'auth-row' }) }
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe(AUTH_EMAIL_EXPIRED_RETRY_MESSAGE)
    expect(updates.some((u) => u.status === 'pending')).toBe(false)
  })

  it('POST /queue/[id]/retry still requeues a non-auth dead letter', async () => {
    const { client, updates } = buildRouteSupabase([moduleRow])
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)

    const res = await retryOnePost(
      new NextRequest('https://example.test/api/admin/emails/queue/module-row/retry', { method: 'POST' }),
      { params: Promise.resolve({ id: 'module-row' }) }
    )

    expect(res.status).toBe(200)
    expect(updates.some((u) => u.status === 'pending')).toBe(true)
  })

  it('POST /queue/retry-selected refuses when every selected row is an expired auth email', async () => {
    const { client, updates } = buildRouteSupabase([scrubbedAuthRow])
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)

    const res = await retrySelectedPost(
      jsonRequest('https://example.test/api/admin/emails/queue/retry-selected', { ids: ['auth-row'] }),
      { params: Promise.resolve({}) }
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe(AUTH_EMAIL_EXPIRED_RETRY_MESSAGE)
    expect(body.expired).toBe(1)
    expect(updates.some((u) => u.status === 'pending')).toBe(false)
  })

  it('POST /queue/retry-selected requeues the rest and reports the expired auth email', async () => {
    const { client } = buildRouteSupabase([scrubbedAuthRow, moduleRow])
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)

    const res = await retrySelectedPost(
      jsonRequest('https://example.test/api/admin/emails/queue/retry-selected', { ids: ['auth-row', 'module-row'] }),
      { params: Promise.resolve({}) }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.retried).toBe(1)
    expect(body.expired).toBe(1)
    expect(body.message).toContain('Ask the learner to request a new one.')
  })

  it('POST /queue/retry-all refuses when every match is an expired auth email', async () => {
    const { client, updates } = buildRouteSupabase([scrubbedAuthRow])
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)

    const res = await retryAllPost(
      jsonRequest('https://example.test/api/admin/emails/queue/retry-all', { statusFilter: 'dead_letter' }),
      { params: Promise.resolve({}) }
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe(AUTH_EMAIL_EXPIRED_RETRY_MESSAGE)
    expect(updates.some((u) => u.status === 'pending')).toBe(false)
  })
})
