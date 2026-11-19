/**
 * Security event helper (lib/security/security-events.ts).
 *
 * vitest.setup.ts replaces `recordSecurityEvent` with a vi.fn for every suite, so this
 * one loads the real module with vi.importActual. The service-role client and `after`
 * are mocked here to observe the RPC call and the scheduling.
 */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, afterMock, clientFactory } = vi.hoisted(() => {
  const rpc = vi.fn()
  return {
    rpc,
    afterMock: vi.fn(),
    clientFactory: vi.fn(() => ({ rpc })),
  }
})

vi.mock('@/lib/supabase', () => ({ createServiceRoleClient: clientFactory }))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: afterMock,
}))

type Helper = typeof import('@/lib/security/security-events')
let helper: Helper

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(async () => {
  helper = await vi.importActual<Helper>('@/lib/security/security-events')
  helper.resetSecurityEventsStateForTests()
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  clientFactory.mockImplementation(() => ({ rpc }))
  // Default: no request scope, as in a script. Tests that want one override this.
  afterMock.mockReset()
  afterMock.mockImplementation(() => {
    throw new Error('`after` was called outside a request scope')
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('subject hash and hint', () => {
  it('hashes the lowercased, trimmed subject to 16 hex characters', () => {
    const expected = createHash('sha256').update('jane.doe@gmail.com').digest('hex').slice(0, 16)
    expect(helper.hashSecuritySubject('  Jane.Doe@Gmail.com ')).toBe(expected)
    expect(helper.hashSecuritySubject('jane.doe@gmail.com')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('returns an empty hash when there is no subject', () => {
    expect(helper.hashSecuritySubject(undefined)).toBe('')
    expect(helper.hashSecuritySubject(null)).toBe('')
    expect(helper.hashSecuritySubject('   ')).toBe('')
  })

  it('masks an email to its first character and domain', () => {
    expect(helper.securitySubjectHint('Jane.Doe@Gmail.com')).toBe('j***@gmail.com')
    expect(helper.securitySubjectHint('a@b.co')).toBe('a***@b.co')
  })

  it('gives no hint for a user id or anything that is not an email', () => {
    expect(helper.securitySubjectHint('6f1c2a7e-1111-4222-8333-944455556666')).toBeNull()
    expect(helper.securitySubjectHint('not an email@x')).toBeNull()
    expect(helper.securitySubjectHint(undefined)).toBeNull()
  })

  it('never puts the full email in the payload', () => {
    const payload = helper.buildSecurityEventPayload('login_failed', { subject: 'jane.doe@gmail.com' })
    expect(JSON.stringify(payload)).not.toContain('jane.doe')
  })
})

describe('ip bucket and path', () => {
  it('reduces addresses to their network prefix', () => {
    expect(helper.toSecurityIpBucket('203.0.113.9')).toBe('203.0.113.0/24')
    expect(helper.toSecurityIpBucket('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48')
    expect(helper.toSecurityIpBucket('::1')).toBe('0:0:0::/48')
  })

  it('keeps the unresolved label and drops junk', () => {
    expect(helper.toSecurityIpBucket('unresolved')).toBe('unresolved')
    expect(helper.toSecurityIpBucket('')).toBe('')
    expect(helper.toSecurityIpBucket('<script>')).toBe('other')
  })

  it('drops the query string and fragment and caps the path at 200', () => {
    expect(helper.toSecurityPath('/api/auth/login?email=a@b.co#x')).toBe('/api/auth/login')
    expect(helper.toSecurityPath(`/${'a'.repeat(300)}`)).toHaveLength(200)
    expect(helper.toSecurityPath('')).toBeNull()
    expect(helper.toSecurityPath('https://prodily.app/api/cron/cleanup?token=x')).toBe('/api/cron/cleanup')
  })

  it('builds the RPC arguments with web as the default app', () => {
    expect(
      helper.buildSecurityEventPayload('origin_rejected', { ipBucket: '198.51.100.7', path: '/api/x?y=1' })
    ).toEqual({
      p_event_type: 'origin_rejected',
      p_app: 'web',
      p_ip_bucket: '198.51.100.0/24',
      p_subject_hash: '',
      p_subject_hint: null,
      p_path: '/api/x',
    })
  })
})

describe('recordSecurityEvent', () => {
  it('calls record_security_event with the service-role client', async () => {
    helper.recordSecurityEvent('login_failed', { subject: 'jane@gmail.com', ipBucket: '203.0.113.9', path: '/api/auth/login' })
    await flush()

    expect(clientFactory).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('record_security_event', {
      p_event_type: 'login_failed',
      p_app: 'web',
      p_ip_bucket: '203.0.113.0/24',
      p_subject_hash: helper.hashSecuritySubject('jane@gmail.com'),
      p_subject_hint: 'j***@gmail.com',
      p_path: '/api/auth/login',
    })
  })

  it('schedules the write with after() inside a request scope and does not run it inline', () => {
    const scheduled: Array<() => unknown> = []
    afterMock.mockImplementation((task: () => unknown) => {
      scheduled.push(task)
    })

    const result = helper.recordSecurityEvent('cron_auth_failed', { path: '/api/cron/cleanup' })

    expect(result).toBeUndefined()
    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
    scheduled[0]()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('returns before the RPC settles (fire and forget)', async () => {
    let settle: (value: { error: null }) => void = () => {}
    rpc.mockReturnValue(new Promise((resolve) => { settle = resolve }))

    const result = helper.recordSecurityEvent('login_failed', { subject: 'a@b.co' })

    expect(result).toBeUndefined()
    settle({ error: null })
    await flush()
  })

  it('never throws when the client cannot be created or the RPC rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    clientFactory.mockImplementationOnce(() => {
      throw new Error('Missing Supabase environment variables')
    })
    expect(() => helper.recordSecurityEvent('login_failed', { subject: 'a@b.co' })).not.toThrow()
    await flush()

    rpc.mockRejectedValueOnce(new Error('network down'))
    expect(() => helper.recordSecurityEvent('login_failed', { subject: 'a@b.co' })).not.toThrow()
    await flush()

    // The warning carries no subject, hint or provider text.
    for (const call of warn.mock.calls) {
      const text = JSON.stringify(call)
      expect(text).not.toContain('a@b.co')
      expect(text).not.toContain('a***')
      expect(text).not.toContain('network down')
    }
  })

  it('never throws even when after() and the payload builder misbehave', () => {
    afterMock.mockImplementation(() => {
      throw new TypeError('boom')
    })
    expect(() =>
      helper.recordSecurityEvent('login_failed', { subject: 42 as unknown as string })
    ).not.toThrow()
  })

  it('ignores an event type outside the contract', async () => {
    helper.recordSecurityEvent('made_up' as never, {})
    await flush()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['PGRST202', '42883'])('pauses for 10 minutes when the RPC is missing (%s)', async (code) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    rpc.mockResolvedValueOnce({ error: { code, message: 'Could not find the function' } })

    helper.recordSecurityEvent('login_failed', { subject: 'a@b.co' })
    await flush()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)

    helper.recordSecurityEvent('login_failed', { subject: 'a@b.co' })
    helper.recordSecurityEvent('signup_blocked', { subject: 'a@b.co' })
    await flush()
    expect(rpc).toHaveBeenCalledTimes(1)

    now.mockReturnValue(1_000_000 + helper.MISSING_RPC_BACKOFF_MS + 1)
    helper.recordSecurityEvent('login_failed', { subject: 'a@b.co' })
    await flush()
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('keeps recording after an ordinary RPC error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpc.mockResolvedValueOnce({ error: { code: '23514', message: 'check violation' } })
    helper.recordSecurityEvent('login_failed', {})
    await flush()
    helper.recordSecurityEvent('login_failed', {})
    await flush()
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
