/**
 * Regression coverage: `/api/email/webhooks` previously hardcoded failure
 * `error_message` values as "Resend event: ..." even when the event
 * originated from Brevo, which made the 2026-09-06 incident investigation
 * harder to reconstruct. This pins that bounced/failed events are now
 * labeled with the provider that actually produced them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { POST as webhookPost } from '../../app/api/email/webhooks/route'
import * as supabaseModule from '../supabase'

function buildMockSupabase(onUpdate: (payload: Record<string, unknown>) => void) {
  return {
    from: (table: string) => {
      if (table === 'email_queue') {
        return {
          select: () => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: { id: 'queue-row-x' } }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, _val: string) => {
              onUpdate(payload)
              return Promise.resolve({ data: null, error: null })
            },
          }),
        }
      }
      if (table === 'email_delivery_events') {
        return { insert: async () => ({ error: null }) }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
    },
  } as unknown as SupabaseClient<Database>
}

describe('Email webhook — provider-specific failure labeling', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.BREVO_WEBHOOK_SECRET
    delete process.env.RESEND_WEBHOOK_SECRET
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('labels a Brevo bounce event as "Brevo event: ..." not "Resend event: ..."', async () => {
    process.env.BREVO_WEBHOOK_SECRET = 'brevo-secret-1'
    let captured: Record<string, unknown> | null = null
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(buildMockSupabase((p) => (captured = p)))

    const request = new Request('https://prodily.app/api/email/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-brevo-webhook-secret': 'brevo-secret-1' },
      body: JSON.stringify({ event: 'hard_bounce', email: 'target@example.com', 'message-id': '<brevo-msg-1>' }),
    })

    const response = await webhookPost(request)
    expect(response.status).toBe(200)
    expect(captured).not.toBeNull()
    expect((captured as unknown as Record<string, unknown>).status).toBe('failed')
    expect((captured as unknown as Record<string, unknown>).error_message).toBe('Brevo event: email.bounced')
  })

  it('labels a Resend bounce event as "Resend event: ..."', async () => {
    let captured: Record<string, unknown> | null = null
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(buildMockSupabase((p) => (captured = p)))

    // No svix headers and no BREVO_WEBHOOK_SECRET/RESEND_WEBHOOK_SECRET configured means
    // the route's auth step is skipped (dev/unconfigured mode) — this test only exercises
    // the event-type normalization + labeling path, which defaults to Resend's `payload.type`.
    const request = new Request('https://prodily.app/api/email/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'resend-msg-1', email: 'target@example.com' } }),
    })

    const response = await webhookPost(request)
    expect(response.status).toBe(200)
    expect(captured).not.toBeNull()
    expect((captured as unknown as Record<string, unknown>).error_message).toBe('Resend event: email.bounced')
  })
})
