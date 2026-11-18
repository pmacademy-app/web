/**
 * Security review 2026-11 (M1, L6): the inbound email webhook.
 *
 * M1: every inbound support email was forwarded with raw `sendEmail()` (no quota, no
 * rate limit) and the sender's own HTML was pasted into the forward unescaped.
 * L6: the body was read uncapped before authentication, a provider `to` array was
 * stringified into one bogus address, and the catch-all echoed `err.message`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'

const governed = vi.fn()
vi.mock('@/lib/email-governance', () => ({ sendGovernedEmail: (...args: unknown[]) => governed(...args) }))

import { POST, MAX_WEBHOOK_BODY_BYTES } from '../../app/api/email/webhooks/route'

function buildSupabase(captured: { suppressions: Array<Record<string, unknown>>; messages: Array<Record<string, unknown>> }) {
  const readChain = (): Record<string, unknown> => ({
    select: () => readChain(),
    eq: () => readChain(),
    maybeSingle: async () => ({ data: null, error: null }),
  })
  return {
    from: (table: string) => {
      if (table === 'contact_messages') {
        return {
          insert: (row: Record<string, unknown>) => {
            captured.messages.push(row)
            return { select: () => ({ single: async () => ({ data: { id: 'msg-1' }, error: null }) }) }
          },
        }
      }
      if (table === 'email_suppressions') {
        return {
          upsert: async (row: Record<string, unknown>) => {
            captured.suppressions.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'email_delivery_events') return { ...readChain(), insert: async () => ({ error: null }) }
      if (table === 'user_notification_preferences') return { update: () => ({ eq: async () => ({ error: null }) }) }
      return readChain()
    },
  } as unknown as SupabaseClient<Database>
}

describe('email webhooks hardening', () => {
  const originalEnv = { ...process.env }
  let captured: { suppressions: Array<Record<string, unknown>>; messages: Array<Record<string, unknown>> }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.BREVO_WEBHOOK_SECRET
    delete process.env.RESEND_WEBHOOK_SECRET
    delete process.env.RESEND_API_KEY
    governed.mockReset()
    governed.mockResolvedValue({ sent: true })
    captured = { suppressions: [], messages: [] }
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(buildSupabase(captured))
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  function post(body: string, headers: Record<string, string> = {}) {
    return POST(
      new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
      })
    )
  }

  it('M1: forwards inbound mail through the governed gateway with its own purpose', async () => {
    const res = await post(
      JSON.stringify({
        type: 'email.received',
        data: { from: 'Eve <eve@example.com>', subject: 'Hello\r\nBcc: x@evil.example', text: 'plain body', html: '<p>ignored</p>' },
      })
    )
    expect(res.status).toBe(200)
    expect(governed).toHaveBeenCalledTimes(1)
    const args = governed.mock.calls[0][0] as Record<string, string>
    expect(args.purpose).toBe('support.inbound_forward')
    expect(args.idempotencyKey).toBe('inbound:msg-1')
    expect(args.subject).not.toMatch(/[\r\n]/)
    expect(args.html).toContain('plain body')
  })

  it('M1: never forwards the sender HTML, and escapes the text body', async () => {
    await post(
      JSON.stringify({
        type: 'email.received',
        data: {
          from: 'eve@example.com',
          subject: 's',
          text: '<script>alert(1)</script> & <a href="https://phish.example">login</a>',
          html: '<img src=x onerror=alert(1)><a href="https://phish.example">verify</a>',
        },
      })
    )
    const html = (governed.mock.calls[0][0] as Record<string, string>).html
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<a href="https://phish.example"')
    expect(html).toContain('&lt;script&gt;')
  })

  it('M1: a governance refusal still stores the message and answers 200', async () => {
    governed.mockResolvedValue({ sent: false, blocked: 'rate_limited_aggregate' })
    const res = await post(JSON.stringify({ type: 'email.received', data: { from: 'a@example.com', subject: 's', text: 't' } }))
    expect(res.status).toBe(200)
    expect(captured.messages).toHaveLength(1)
  })

  it('L6: refuses an oversized body before authentication', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_' + Buffer.from('x').toString('base64')
    const res = await post('x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1))
    expect(res.status).toBe(413)
    expect(governed).not.toHaveBeenCalled()
  })

  it('L6: refuses a declared oversized body without reading it', async () => {
    const res = await post('{}', { 'content-length': String(MAX_WEBHOOK_BODY_BYTES + 10) })
    expect(res.status).toBe(413)
  })

  it('L6: suppresses only the first address of a Resend `to` array', async () => {
    await post(JSON.stringify({ type: 'email.bounced', data: { email_id: 'e1', to: ['First@Example.com', 'second@example.com'] } }))
    expect(captured.suppressions).toHaveLength(1)
    expect(captured.suppressions[0].email).toBe('first@example.com')
  })

  it('L6: the catch-all answers with a generic error, not the exception text', async () => {
    // A JSON `null` body parses, then throws a TypeError on property access inside the
    // handler, which lands in the outer catch.
    const res = await post('null')
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Invalid webhook payload' })
  })
})
