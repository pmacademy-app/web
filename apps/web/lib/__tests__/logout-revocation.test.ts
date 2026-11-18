/**
 * L4: POST /api/auth/logout revokes the session at the provider (it used to call signOut on
 * a session-less client, which revoked nothing) and still clears the cookies on failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  adminSignOut: vi.fn(),
}))

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>()
  return { ...actual, createClient: () => ({ auth: { refreshSession: h.refreshSession, signOut: h.signOut } }) }
})

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({ auth: { admin: { signOut: h.adminSignOut } } }),
}))

import { POST } from '../../app/api/auth/logout/route'

type RouteResponse = Response & { cookies: { get(name: string): { value: string } | undefined } }

function logout(headers: Record<string, string>) {
  return POST(
    new NextRequest('https://prodily.app/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://prodily.app', ...headers },
    }),
    { params: Promise.resolve({}) }
  ) as Promise<RouteResponse>
}

describe('POST /api/auth/logout revocation (L4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://mock.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    h.refreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null })
    h.signOut.mockResolvedValue({ error: null })
    h.adminSignOut.mockResolvedValue({ data: null, error: null })
  })

  it('revokes the refresh-token family with the local scope, then clears cookies', async () => {
    const res = await logout({ cookie: 'sb-access-token=at; sb-refresh-token=rt' })
    expect(h.refreshSession).toHaveBeenCalledWith({ refresh_token: 'rt' })
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect((await res.json()).revocation).toBe('revoked')
    expect(res.cookies.get('sb-access-token')?.value).toBe('')
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
  })

  it('a Bearer-only caller has its access token session revoked through the Admin API', async () => {
    const res = await logout({ authorization: 'Bearer native-at' })
    expect(h.adminSignOut).toHaveBeenCalledWith('native-at', 'local')
    expect((await res.json()).revocation).toBe('revoked')
  })

  it('a provider failure still clears the cookies', async () => {
    h.refreshSession.mockRejectedValue(new Error('network'))
    const res = await logout({ cookie: 'sb-refresh-token=rt' })
    expect(res.status).toBe(200)
    expect((await res.json()).revocation).toBe('failed')
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
  })
})
