import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BrevoProvider } from '../notifications/providers/brevo-provider'
import { ResendProvider } from '../notifications/providers/resend-provider'
import type { ProviderSendPayload } from '../notifications/providers/types'

/**
 * Audit 2026-11-17 #6: List-Unsubscribe points at the tokenized one-click POST
 * endpoint when the send carries an unsubscribe token (RFC 8058), and falls back to
 * the settings page otherwise.
 */

const TOKEN = '6f1c2a9e-1111-4222-8333-944455556666'

function payload(variables: Record<string, unknown>): ProviderSendPayload {
  return {
    recipient: { userId: 'usr_1', email: 'learner@example.com' },
    channel: 'email',
    templateKey: 'learning.weekly_recap',
    templateVersion: 1,
    variables: { subject: 'Recap', html: '<p>x</p>', text: 'x', ...variables },
  } as ProviderSendPayload
}

async function sentHeaders(provider: BrevoProvider | ResendProvider, variables: Record<string, unknown>) {
  let body: Record<string, unknown> = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return { ok: true, status: 200, json: async () => ({ id: 'm1', messageId: 'm1' }) }
    })
  )
  const result = await provider.send(payload(variables))
  expect(result.success).toBe(true)
  return (body.headers ?? {}) as Record<string, string>
}

describe('List-Unsubscribe headers (RFC 8058 one-click)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.BREVO_API_KEY = 'k'
    process.env.RESEND_API_KEY = 'k'
    process.env.BREVO_SIMULATE = 'false'
    process.env.RESEND_SIMULATE = 'false'
    process.env.ALLOW_TEST_NETWORK_EMAILS = 'true'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://prodily.app/'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  for (const [name, make] of [
    ['brevo', () => new BrevoProvider()],
    ['resend', () => new ResendProvider()],
  ] as const) {
    it(`${name}: tokenized POST endpoint plus List-Unsubscribe-Post when a token is present`, async () => {
      const headers = await sentHeaders(make(), { unsubscribeToken: TOKEN })
      expect(headers['List-Unsubscribe']).toBe(`<https://prodily.app/api/email/unsubscribe?token=${TOKEN}>`)
      expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    })

    it(`${name}: settings page and no one-click header without a token`, async () => {
      const headers = await sentHeaders(make(), {})
      expect(headers['List-Unsubscribe']).toBe('<https://prodily.app/settings?tab=notifications>')
      expect(headers['List-Unsubscribe-Post']).toBeUndefined()
    })

    it(`${name}: no List-Unsubscribe headers when suppressed`, async () => {
      const headers = await sentHeaders(make(), { unsubscribeToken: TOKEN, suppressListUnsubscribe: true })
      expect(headers['List-Unsubscribe']).toBeUndefined()
      expect(headers['List-Unsubscribe-Post']).toBeUndefined()
    })
  }
})
