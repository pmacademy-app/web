import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { POST as sendEmailHook } from '../../app/api/auth/send-email-hook/route'
import { secretMatchesAny, secretsMatch } from '@/lib/security/constant-time'

const HOOK_ROUTE = path.resolve(import.meta.dirname, '../../app/api/auth/send-email-hook/route.ts')

describe('B7-D — constant-time secret comparison', () => {
  it('accepts an exact match', () => {
    expect(secretsMatch('whsec_abc123', 'whsec_abc123')).toBe(true)
  })

  it('rejects a different value of the same length', () => {
    expect(secretsMatch('whsec_abc123', 'whsec_abc124')).toBe(false)
  })

  it('rejects a value that shares a prefix', () => {
    expect(secretsMatch('whsec_abc12', 'whsec_abc123')).toBe(false)
  })

  it('rejects a longer value without throwing on the length mismatch', () => {
    // timingSafeEqual throws on unequal lengths; hashing first is what makes this
    // safe, and a length guard would have leaked the secret's length.
    expect(() => secretsMatch('whsec_abc123-and-more', 'whsec_abc123')).not.toThrow()
    expect(secretsMatch('whsec_abc123-and-more', 'whsec_abc123')).toBe(false)
  })

  it('rejects the empty string against a real secret', () => {
    expect(secretsMatch('', 'whsec_abc123')).toBe(false)
  })

  it('matches any one of several accepted variants', () => {
    const variants = ['v1,whsec_abc', 'whsec_abc', 'abc']

    expect(secretMatchesAny('abc', variants)).toBe(true)
    expect(secretMatchesAny('whsec_abc', variants)).toBe(true)
    expect(secretMatchesAny('nope', variants)).toBe(false)
  })

  it('does not short-circuit once a variant matches', () => {
    // The first variant matches; every candidate must still be visited so the work
    // done does not reveal which variant was the hit.
    const visited: string[] = []
    const variants = new Proxy(['a', 'b', 'c'], {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) visited.push(prop)
        return Reflect.get(target, prop, receiver)
      },
    })

    expect(secretMatchesAny('a', variants as unknown as string[])).toBe(true)
    expect(visited).toEqual(['0', '1', '2'])
  })
})

describe('B7-D — the auth hook no longer compares secrets with ===', () => {
  const source = readFileSync(HOOK_ROUTE, 'utf8')
  const verifier = source.slice(
    source.indexOf('function verifyHookSecret'),
    source.indexOf('// ─── Callback URL Generator')
  )

  it('uses the shared constant-time helper', () => {
    expect(source).toContain("from '@/lib/security/constant-time'")
    expect(verifier).toContain('secretMatchesAny')
  })

  it('has no plain equality comparison left in the secret-bearing branches', () => {
    // F-SEC-12 flagged the shared-secret comparisons: the Authorization header and
    // the three custom headers. (The query-string branch it also flagged is gone
    // entirely.) Scope the assertion to those, which end where the HMAC signature
    // branch begins. That branch keeps one `===` comparing signature lengths,
    // which guards timingSafeEqual against a throw — a signature's length is fixed
    // by its encoding and is not secret, so it is the correct standard pattern.
    const secretBranches = verifier
      .slice(0, verifier.indexOf('// 3. Standard Webhook'))
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('//'))
      .join(' ')

    expect(secretBranches).not.toMatch(/[^=!<>]===[^=]/)
    expect(secretBranches).toContain('secretMatchesAny')
  })

  it('still verifies the HMAC signature with timingSafeEqual', () => {
    expect(verifier).toContain('timingSafeEqual')
  })
})

// ─── Query-string secret removal (F-SEC-12) ──────────────────────────────────
//
// Production was manually verified on 2026-09-14 to use the standard
// `v1,whsec_...` webhook-signing secret, which authenticates by HMAC over the raw
// body. That unblocked deleting the legacy query-parameter path.
//
// The literals below are synthetic test secrets, never production values.

const TEST_SECRET = ['whsec', Buffer.from('b7d synthetic hook secret').toString('base64')].join('_')
const PROD_SHAPED_SECRET = `v1,${TEST_SECRET}`

const HOOK_URL = 'https://prodily.app/api/auth/send-email-hook'

const PAYLOAD = {
  user: { id: 'usr-b7d', email: 'b7d@example.com', user_metadata: { full_name: 'B7D Tester' } },
  email_data: { email_action_type: 'signup', token_hash: 'th_b7d_123' },
}

/** Signs exactly the way the standard webhook scheme does: HMAC over the raw body. */
function signStandardWebhook(rawBody: string, secret: string): string {
  const base64Part = secret.replace(/^v1,/, '').replace(/^whsec_/, '')
  const keyBytes = Buffer.from(base64Part, 'base64')
  return crypto.createHmac('sha256', keyBytes).update(rawBody).digest('base64')
}

let previousSecret: string | undefined

beforeEach(() => {
  previousSecret = process.env.SEND_EMAIL_HOOK_SECRET
  process.env.SEND_EMAIL_HOOK_SECRET = PROD_SHAPED_SECRET
})

afterEach(() => {
  if (previousSecret === undefined) delete process.env.SEND_EMAIL_HOOK_SECRET
  else process.env.SEND_EMAIL_HOOK_SECRET = previousSecret
})

describe('B7-D — standard webhook HMAC authentication still works', () => {
  it('accepts a valid v1,whsec_ signature over the raw body', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: { 'webhook-signature': `v1,${signStandardWebhook(rawBody, PROD_SHAPED_SECRET)}` },
      body: rawBody,
    })

    expect((await sendEmailHook(req)).status).toBe(200)
  })

  it('rejects a signature computed over a different body (tamper detection)', async () => {
    const signedBody = JSON.stringify(PAYLOAD)
    const tamperedBody = JSON.stringify({
      ...PAYLOAD,
      user: { ...PAYLOAD.user, email: 'attacker@example.com' },
    })

    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: { 'webhook-signature': `v1,${signStandardWebhook(signedBody, PROD_SHAPED_SECRET)}` },
      body: tamperedBody,
    })

    expect((await sendEmailHook(req)).status).toBe(401)
  })

  it('rejects an invalid signature', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: { 'webhook-signature': 'v1,bm90LWEtcmVhbC1zaWduYXR1cmU=' },
      body: rawBody,
    })

    expect((await sendEmailHook(req)).status).toBe(401)
  })

  it('rejects a request with no credential at all', async () => {
    const req = new NextRequest(HOOK_URL, { method: 'POST', body: JSON.stringify(PAYLOAD) })

    expect((await sendEmailHook(req)).status).toBe(401)
  })
})

describe('B7-D — the query-string secret is no longer accepted', () => {
  it('rejects the correct secret supplied as ?secret=', async () => {
    const req = new NextRequest(`${HOOK_URL}?secret=${encodeURIComponent(PROD_SHAPED_SECRET)}`, {
      method: 'POST',
      body: JSON.stringify(PAYLOAD),
    })

    expect((await sendEmailHook(req)).status).toBe(401)
  })

  it('rejects each accepted spelling of the secret supplied as ?secret=', async () => {
    const spellings = [PROD_SHAPED_SECRET, TEST_SECRET, TEST_SECRET.replace(/^whsec_/, '')]

    for (const spelling of spellings) {
      const req = new NextRequest(`${HOOK_URL}?secret=${encodeURIComponent(spelling)}`, {
        method: 'POST',
        body: JSON.stringify(PAYLOAD),
      })
      expect((await sendEmailHook(req)).status).toBe(401)
    }
  })

  it('cannot use a query secret to bypass a bad HMAC signature', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const req = new NextRequest(`${HOOK_URL}?secret=${encodeURIComponent(PROD_SHAPED_SECRET)}`, {
      method: 'POST',
      headers: { 'webhook-signature': 'v1,bm90LWEtcmVhbC1zaWduYXR1cmU=' },
      body: rawBody,
    })

    expect((await sendEmailHook(req)).status).toBe(401)
  })

  it('does not accept the secret under any other query parameter name', async () => {
    for (const name of ['token', 'key', 'hook_secret', 'apikey']) {
      const req = new NextRequest(`${HOOK_URL}?${name}=${encodeURIComponent(PROD_SHAPED_SECRET)}`, {
        method: 'POST',
        body: JSON.stringify(PAYLOAD),
      })
      expect((await sendEmailHook(req)).status).toBe(401)
    }
  })

  it('never echoes a supplied secret back in the response body', async () => {
    const req = new NextRequest(`${HOOK_URL}?secret=${encodeURIComponent(PROD_SHAPED_SECRET)}`, {
      method: 'POST',
      body: JSON.stringify(PAYLOAD),
    })

    const body = await (await sendEmailHook(req)).text()

    expect(body).not.toContain(PROD_SHAPED_SECRET)
    expect(body).not.toContain(TEST_SECRET)
  })

  it('reads no query parameter named secret anywhere in the route', () => {
    const source = readFileSync(HOOK_ROUTE, 'utf8')

    expect(source).not.toMatch(/searchParams\.get\(\s*['"]secret['"]\s*\)/)
    expect(source).not.toContain('querySecret')
  })
})

describe('B7-D — auth route migration scope', () => {
  const API_DIR = path.resolve(import.meta.dirname, '../../app/api')

  function routeFilesImporting(needle: string): string[] {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'route.ts' && readFileSync(full, 'utf8').includes(needle)) {
          hits.push(path.relative(API_DIR, full).split(path.sep).join('/'))
        }
      }
    }
    walk(API_DIR)
    return hits.sort()
  }

  it('migrates exactly the eight eligible auth routes plus the six cron routes', () => {
    expect(routeFilesImporting('@/lib/api/with-route')).toEqual([
      'auth/login/route.ts',
      'auth/logout/route.ts',
      'auth/refresh/route.ts',
      'auth/resend-verification/route.ts',
      'auth/session/route.ts',
      'auth/signup/route.ts',
      'auth/telemetry/route.ts',
      'auth/update-password/route.ts',
      'cron/cleanup/route.ts',
      'cron/daily-reminder/route.ts',
      'cron/process-broadcasts/route.ts',
      'cron/process-email-queue/route.ts',
      'cron/retry-failed/route.ts',
      'cron/weekly-recap/route.ts',
    ])
  })

  it('leaves the two documented exceptions unwrapped', () => {
    // send-email-hook authenticates by HMAC over the RAW body: a resolver that read
    // the body would consume the stream the route still needs.
    // callback is a redirect-only browser endpoint with no JSON envelope at all —
    // wrapping it would let a navigation receive JSON instead of an error page.
    for (const exception of ['auth/send-email-hook/route.ts', 'auth/callback/route.ts']) {
      const source = readFileSync(path.join(API_DIR, exception), 'utf8')
      expect(source).not.toContain('@/lib/api/with-route')
    }
  })

  it('migrated no learner, settings or admin route', () => {
    const migrated = routeFilesImporting('@/lib/api/with-route')

    expect(migrated.filter((f) => f.startsWith('admin/'))).toEqual([])
    expect(migrated.filter((f) => f.startsWith('settings/'))).toEqual([])
    expect(migrated.every((f) => f.startsWith('auth/') || f.startsWith('cron/'))).toBe(true)
  })

  it('every migrated auth route declares an explicit actor policy', () => {
    for (const route of ['login', 'signup', 'logout', 'refresh', 'session', 'telemetry', 'resend-verification', 'update-password']) {
      const source = readFileSync(path.join(API_DIR, 'auth', route, 'route.ts'), 'utf8')
      expect(source).toContain('withRoute')
      expect(source).toContain('actor: { allow:')
    }
  })
})
