/**
 * Security review 2026-11 (M2, M3, L3): what ends up inside an email is built from
 * trusted parts only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildAuthCallbackUrl } from '@/lib/auth-url'
import { interpolateVariables, escapeHtmlValue } from '@/emails'
import { fullNameSchema } from '@/lib/auth/full-name'
import { BrevoProvider } from '../notifications/providers/brevo-provider'
import { ResendProvider } from '../notifications/providers/resend-provider'
import type { ProviderSendPayload } from '../notifications/providers/types'

const site = 'https://prodily.app'

describe('M3: buildAuthCallbackUrl always uses the genuine token', () => {
  it('ignores a token_hash carried in redirect_to', () => {
    const url = new URL(
      buildAuthCallbackUrl(site, 'genuine', 'signup', `${site}/api/auth/callback?token_hash=evil&type=magiclink`)
    )
    expect(url.origin).toBe(site)
    expect(url.pathname).toBe('/api/auth/callback')
    expect(url.searchParams.get('token_hash')).toBe('genuine')
    expect(url.searchParams.get('type')).toBe('signup')
    expect(url.toString()).not.toContain('evil')
    // No `next` in the smuggled URL, so the action keeps its own landing page.
    expect(url.searchParams.get('next')).toBe('/verified')
  })

  it('keeps a same-origin next from a callback-shaped redirect_to', () => {
    const url = new URL(buildAuthCallbackUrl(site, 'genuine', 'recovery', `${site}/api/auth/callback?token_hash=evil&next=/learn/x?y=1`))
    expect(url.searchParams.get('token_hash')).toBe('genuine')
    expect(url.searchParams.get('next')).toBe('/learn/x?y=1')
  })

  it('takes the path of a plain same-origin redirect_to, minus credential params', () => {
    const url = new URL(buildAuthCallbackUrl(site, 'genuine', 'signup', `${site}/verified?token_hash=evil&ref=a`))
    expect(url.searchParams.get('next')).toBe('/verified?ref=a')
  })

  it('strips a credential nested inside next', () => {
    const url = new URL(buildAuthCallbackUrl(site, 'genuine', 'signup', `${site}/api/auth/callback?next=${encodeURIComponent('/x?token_hash=evil')}`))
    expect(url.searchParams.get('next')).toBe('/x')
  })

  for (const bad of [
    'https://evil.example/verified',
    `${site}/api/auth/callback?next=//evil.example`,
    `${site}/api/auth/callback?next=https://evil.example`,
    `${site}/api/auth/callback?next=/api/admin/users`,
    `${site}/api/auth/callback?next=/a%5Cb`,
    'javascript:alert(1)',
  ]) {
    it(`falls back to the default landing page for ${bad}`, () => {
      const url = new URL(buildAuthCallbackUrl(site, 'genuine', 'recovery', bad))
      expect(url.origin).toBe(site)
      expect(url.searchParams.get('token_hash')).toBe('genuine')
      expect(url.searchParams.get('next')).toBe('/reset-password?mode=update')
    })
  }

  it('treats the bare site root as no preference', () => {
    const url = new URL(buildAuthCallbackUrl(site, 'genuine', 'signup', `${site}/`))
    expect(url.searchParams.get('next')).toBe('/verified')
  })
})

describe('M2: template interpolation escapes by context', () => {
  it('HTML-escapes values in an HTML body', () => {
    const out = interpolateVariables('<p>Hi {{userName}}</p>', { userName: '<a href="https://evil.example">win</a>' }, 'html')
    expect(out).toBe('<p>Hi &lt;a href=&quot;https://evil.example&quot;&gt;win&lt;/a&gt;</p>')
    expect(out).not.toContain('<a ')
  })

  it('keeps URL variables working inside href', () => {
    const out = interpolateVariables(
      '<a href="{{resetUrl}}">Reset</a>',
      { resetUrl: 'https://prodily.app/api/auth/callback?token_hash=abc&type=recovery' },
      'html'
    )
    expect(out).toBe('<a href="https://prodily.app/api/auth/callback?token_hash=abc&amp;type=recovery">Reset</a>')
  })

  it('an escaped quote cannot break out of an attribute', () => {
    const out = interpolateVariables('<a href="{{appUrl}}">x</a>', { appUrl: '" onclick="alert(1)' }, 'html')
    expect(out).toBe('<a href="&quot; onclick=&quot;alert(1)">x</a>')
  })

  it('strips CR/LF and control characters from subject values', () => {
    const out = interpolateVariables('Module Complete: {{moduleName}}!', { moduleName: 'A\r\nBcc: x@evil.example\u0000' }, 'subject')
    expect(out).not.toMatch(/[\r\n\u0000]/)
    expect(out).toBe('Module Complete: A Bcc: x@evil.example !')
  })

  it('leaves plain-text bodies unchanged by default', () => {
    expect(interpolateVariables('Hi {{userName}} & co', { userName: 'O\'Brien <3' })).toBe("Hi O'Brien <3 & co")
  })

  it('escapeHtmlValue covers the five significant characters', () => {
    expect(escapeHtmlValue(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('M2: signup full name policy', () => {
  for (const name of ['Jane Doe', "Zoë O'Brien-Smith", 'J.R.R. Tolkien', 'Nguyễn Văn An', 'محمد علي', '李小龙', 'Ann', 'Jr. Martin Luther King', 'D’Angelo']) {
    it(`accepts ${name}`, () => {
      expect(fullNameSchema.safeParse(name).success).toBe(true)
    })
  }

  for (const name of [
    'visit evil.com now',
    'https://evil.example',
    'www.evil.example',
    '<a href=x>win</a>',
    'Jane\nDoe',
    'Jane\u0000',
    'Win $1000',
    'user@example.com',
    '  ',
    'A',
    '-Jane',
  ]) {
    it(`rejects ${JSON.stringify(name)}`, () => {
      expect(fullNameSchema.safeParse(name).success).toBe(false)
    })
  }

  it('trims surrounding whitespace', () => {
    expect(fullNameSchema.parse('  Jane Doe  ')).toBe('Jane Doe')
  })
})

describe('L3: providers ignore headers, tags and sender from template variables', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.BREVO_API_KEY = 'k'
    process.env.RESEND_API_KEY = 'k'
    process.env.BREVO_SIMULATE = 'false'
    process.env.RESEND_SIMULATE = 'false'
    process.env.ALLOW_TEST_NETWORK_EMAILS = 'true'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://prodily.app'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  function payload(variables: Record<string, unknown>): ProviderSendPayload {
    return {
      recipient: { userId: 'usr_1', email: 'learner@example.com' },
      channel: 'email',
      templateKey: 'learning.weekly_recap',
      templateVersion: 1,
      variables: { subject: 'Recap', html: '<p>x</p>', text: 'x', ...variables },
    }
  }

  for (const [name, make] of [
    ['brevo', () => new BrevoProvider()],
    ['resend', () => new ResendProvider()],
  ] as const) {
    it(`${name}: headers / customHeaders / tags in variables never reach the request`, async () => {
      let body: Record<string, unknown> = {}
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          body = JSON.parse(String(init.body))
          return { ok: true, status: 200, json: async () => ({ id: 'm1', messageId: 'm1' }) }
        })
      )
      await make().send(
        payload({
          headers: { Bcc: 'spy@evil.example', 'List-Unsubscribe': '<https://evil.example>' },
          customHeaders: { 'X-Evil': '1' },
          tags: ['evil'],
        })
      )
      const headers = (body.headers ?? {}) as Record<string, string>
      expect(headers.Bcc).toBeUndefined()
      expect(headers['X-Evil']).toBeUndefined()
      expect(headers['List-Unsubscribe']).toBe('<https://prodily.app/settings?tab=notifications>')
      expect(JSON.stringify(body.tags)).not.toContain('evil')
    })
  }
})
