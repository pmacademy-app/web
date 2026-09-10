/**
 * Bounce classification (F-12) and bounce ↔ queue correlation (F-11).
 *
 * F-12 was a real defect: Brevo's `soft_bounce` was folded into the same
 * `email.bounced` event as `hard_bounce`/`blocked`/`invalid_email`, and every one of
 * them was then written to `email_suppressions` with `reason: 'hard_bounce'`.
 * Suppression here is permanent (`expires_at` is never set), so a full mailbox or a
 * greylisting delay could permanently cut off a valid recipient.
 *
 * F-11 was investigated and found NOT to be a defect: correlation by provider message
 * id is correct, and unmatched events in production are unmatched because their queue
 * rows no longer exist. These tests lock that behaviour in so a future change cannot
 * quietly introduce recipient-based guessing, which would mis-attribute a bounce when
 * one recipient has several messages in flight.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'
import { POST as webhookPost } from '../../app/api/email/webhooks/route'

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn().mockResolvedValue('err_test'),
  logErrorReport: vi.fn().mockResolvedValue(undefined),
}))

interface Captured {
  events: Array<{ email_queue_id: string | null; resend_id: string | null; event_type: string }>
  suppressions: Array<{ email: string; reason: string }>
  queueUpdates: Array<{ id: string; status?: string }>
}

/**
 * @param queueRowsByResendId which provider message ids currently have a queue row.
 *        Correlation must consult ONLY this map — never the recipient.
 */
function harness(queueRowsByResendId: Record<string, string> = {}) {
  const captured: Captured = { events: [], suppressions: [], queueUpdates: [] }
  let lastLookupId = ''

  const client = {
    from: (table: string) => {
      if (table === 'email_queue') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => {
              lastLookupId = val
              return { maybeSingle: async () => ({ data: queueRowsByResendId[val] ? { id: queueRowsByResendId[val] } : null }) }
            },
          }),
          update: (patch: { status?: string }) => ({
            eq: async (_c: string, id: string) => {
              captured.queueUpdates.push({ id, status: patch.status })
              return { data: null, error: null }
            },
          }),
        }
      }
      if (table === 'email_delivery_events') {
        return {
          insert: async (row: Captured['events'][number]) => {
            captured.events.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'email_suppressions') {
        return {
          upsert: async (row: { email: string; reason: string }) => {
            captured.suppressions.push(row)
            return { error: null }
          },
        }
      }
      return {}
    },
  } as unknown as SupabaseClient<Database>

  vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(client)
  return { captured, lookupId: () => lastLookupId }
}

function brevoRequest(payload: Record<string, unknown>) {
  return new Request('https://prodily.app/api/email/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-brevo-webhook-secret': 'test_brevo_secret' },
    body: JSON.stringify(payload),
  })
}

describe('Bounce classification (F-12) and queue correlation (F-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BREVO_WEBHOOK_SECRET = 'test_brevo_secret'
    delete process.env.RESEND_WEBHOOK_SECRET
  })

  // ==========================================================================
  // F-12 — transient failures must never create permanent suppression
  // ==========================================================================

  it('F-12: Brevo soft_bounce is recorded as a soft bounce and does NOT suppress', async () => {
    const { captured } = harness({ '<mid-soft>': 'queue-soft' })

    const res = await webhookPost(brevoRequest({
      event: 'soft_bounce',
      email: 'valid.user@example.com',
      reason: 'Mailbox full',
      'message-id': '<mid-soft>',
    }))

    expect(res.status).toBe(200)
    expect(captured.events[0].event_type).toBe('email.bounced_soft')
    // The whole point: a temporary failure must not permanently block the address.
    expect(captured.suppressions).toHaveLength(0)
    // And it must not flip a delivered row to failed — the provider is still retrying.
    expect(captured.queueUpdates).toHaveLength(0)
  })

  it('F-12: Brevo hard_bounce still suppresses permanently and fails the row', async () => {
    const { captured } = harness({ '<mid-hard>': 'queue-hard' })

    await webhookPost(brevoRequest({
      event: 'hard_bounce',
      email: 'nosuchuser@example.com',
      reason: '550-5.1.1 does not exist',
      'message-id': '<mid-hard>',
    }))

    expect(captured.events[0].event_type).toBe('email.bounced')
    expect(captured.suppressions).toHaveLength(1)
    expect(captured.suppressions[0]).toMatchObject({ email: 'nosuchuser@example.com', reason: 'hard_bounce' })
    expect(captured.queueUpdates[0]).toMatchObject({ id: 'queue-hard', status: 'failed' })
  })

  it.each(['blocked', 'invalid_email'])(
    'F-12: Brevo %s remains a hard bounce (protection not weakened)',
    async (event) => {
      const { captured } = harness()
      await webhookPost(brevoRequest({ event, email: 'blocked@example.com', 'message-id': '<m>' }))
      expect(captured.events[0].event_type).toBe('email.bounced')
      expect(captured.suppressions).toHaveLength(1)
    }
  )

  it('F-12: Resend Transient bounce is soft and does NOT suppress', async () => {
    const { captured } = harness()

    await webhookPost(brevoRequest({
      type: 'email.bounced',
      data: {
        email_id: 'resend-transient-1',
        to: ['valid.user@example.com'],
        email: 'valid.user@example.com',
        bounce: { type: 'Transient', subType: 'MailboxFull' },
      },
    }))

    expect(captured.events[0].event_type).toBe('email.bounced_soft')
    expect(captured.suppressions).toHaveLength(0)
  })

  it('F-12: Resend Permanent bounce stays hard and suppresses', async () => {
    const { captured } = harness()

    await webhookPost(brevoRequest({
      type: 'email.bounced',
      data: {
        email_id: 'resend-perm-1',
        email: 'nosuchuser@example.com',
        bounce: { type: 'Permanent', subType: 'General' },
      },
    }))

    expect(captured.events[0].event_type).toBe('email.bounced')
    expect(captured.suppressions).toHaveLength(1)
    expect(captured.suppressions[0]).toMatchObject({ email: 'nosuchuser@example.com', reason: 'hard_bounce' })
  })

  it.each([
    ['Undetermined verdict', { type: 'Undetermined' }],
    ['absent bounce block', undefined],
    ['malformed bounce block', 'not-an-object'],
  ])('F-12: Resend bounce with %s stays HARD (only an explicit Transient is downgraded)', async (_label, bounce) => {
    const { captured } = harness()

    await webhookPost(brevoRequest({
      type: 'email.bounced',
      data: { email_id: 'resend-x', email: 'unknown@example.com', ...(bounce === undefined ? {} : { bounce }) },
    }))

    expect(captured.events[0].event_type).toBe('email.bounced')
    expect(captured.suppressions).toHaveLength(1)
  })

  it('F-12: a spam complaint is still suppressed as spam_complaint, not a bounce', async () => {
    const { captured } = harness()
    await webhookPost(brevoRequest({ event: 'spam', email: 'complainer@example.com', 'message-id': '<m>' }))
    expect(captured.suppressions).toHaveLength(1)
    expect(captured.suppressions[0]).toMatchObject({ email: 'complainer@example.com', reason: 'spam_complaint' })
  })

  // ==========================================================================
  // F-11 — correlation is by provider message id, never by recipient
  // ==========================================================================

  it('F-11: a Brevo bounce attaches to the queue row holding that message id', async () => {
    const { captured } = harness({ '<brevo-mid-1>': 'queue-brevo-1' })

    await webhookPost(brevoRequest({ event: 'hard_bounce', email: 'a@example.com', 'message-id': '<brevo-mid-1>' }))

    expect(captured.events[0].email_queue_id).toBe('queue-brevo-1')
    expect(captured.queueUpdates[0].id).toBe('queue-brevo-1')
  })

  it('F-11: a Resend bounce attaches via data.email_id', async () => {
    const { captured } = harness({ 'resend-id-1': 'queue-resend-1' })

    await webhookPost(brevoRequest({
      type: 'email.bounced',
      data: { email_id: 'resend-id-1', email: 'a@example.com', bounce: { type: 'Permanent' } },
    }))

    expect(captured.events[0].email_queue_id).toBe('queue-resend-1')
  })

  it('F-11: after Brevo→Resend failover the bounce follows the RESEND id the row stored', async () => {
    // The queue row records the id of the provider that actually accepted the message,
    // so the later bounce from that provider is what must match.
    const { captured, lookupId } = harness({ 'resend-after-failover': 'queue-failover' })

    await webhookPost(brevoRequest({
      type: 'email.bounced',
      data: { email_id: 'resend-after-failover', email: 'a@example.com', bounce: { type: 'Permanent' } },
    }))

    expect(lookupId()).toBe('resend-after-failover')
    expect(captured.events[0].email_queue_id).toBe('queue-failover')
    expect(captured.queueUpdates[0].id).toBe('queue-failover')
  })

  it('F-11: with several messages to one recipient, only the matching id is touched', async () => {
    const { captured } = harness({ '<mid-A>': 'queue-A', '<mid-B>': 'queue-B' })

    await webhookPost(brevoRequest({ event: 'hard_bounce', email: 'busy@example.com', 'message-id': '<mid-B>' }))

    expect(captured.events[0].email_queue_id).toBe('queue-B')
    expect(captured.queueUpdates).toHaveLength(1)
    expect(captured.queueUpdates[0].id).toBe('queue-B')
    // queue-A shares the recipient and must be left completely alone.
    expect(captured.queueUpdates.some((u) => u.id === 'queue-A')).toBe(false)
  })

  it('F-11: an unmatched bounce stays unmatched rather than being guessed onto a row', async () => {
    const { captured } = harness({}) // no queue row holds this id

    await webhookPost(brevoRequest({ event: 'hard_bounce', email: 'orphan@example.com', 'message-id': '<gone>' }))

    expect(captured.events[0].email_queue_id).toBeNull()
    expect(captured.queueUpdates).toHaveLength(0)
    // Suppression is recipient-scoped, so it still applies even with no queue row.
    expect(captured.suppressions).toHaveLength(1)
    expect(captured.suppressions[0]).toMatchObject({ email: 'orphan@example.com', reason: 'hard_bounce' })
  })

  it('F-11: a non-queue (auth/direct) email bounce is recorded and suppressed without a queue row', async () => {
    // Auth mail goes out through the governed transport and never has a queue row, so
    // a null email_queue_id is the correct outcome, not a correlation failure.
    const { captured } = harness({})

    await webhookPost(brevoRequest({
      event: 'hard_bounce',
      email: 'authuser@example.com',
      subject: 'Confirm your email address',
      'message-id': '<auth-direct-1>',
    }))

    expect(captured.events[0].email_queue_id).toBeNull()
    expect(captured.events[0].resend_id).toBe('<auth-direct-1>')
    expect(captured.suppressions).toHaveLength(1)
  })

  it('F-11: delivery still marks the row delivered', async () => {
    const { captured } = harness({ '<mid-d>': 'queue-d' })
    await webhookPost(brevoRequest({ event: 'delivered', email: 'a@example.com', 'message-id': '<mid-d>' }))
    expect(captured.events[0].event_type).toBe('email.delivered')
    expect(captured.queueUpdates[0]).toMatchObject({ id: 'queue-d', status: 'delivered' })
    expect(captured.suppressions).toHaveLength(0)
  })
})
