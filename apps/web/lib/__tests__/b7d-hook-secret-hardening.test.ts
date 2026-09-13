import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

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
    // F-SEC-12 flagged the shared-secret comparisons: Authorization header, the
    // three custom headers, and the query string. Scope the assertion to those,
    // which end where the HMAC signature branch begins. The HMAC branch keeps one
    // `===` on `expected.length === v1Sig.length`, which guards timingSafeEqual
    // against a throw — a signature's length is fixed by its encoding and is not
    // secret, so that comparison is the correct standard pattern.
    const secretBranches = verifier
      .slice(0, verifier.indexOf('// 4. Standard Webhook'))
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
