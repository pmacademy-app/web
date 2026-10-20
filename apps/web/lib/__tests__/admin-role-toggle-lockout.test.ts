/**
 * Admin lockout guards on PATCH /api/admin/users (the admin role toggle).
 *
 * Admin status now comes only from users.is_admin, so the console must not let the
 * last admin disappear: an admin cannot demote themselves (400), a demotion that would
 * leave zero admins is refused (409), and a target with no users row is a 404 rather
 * than a silent "success". Every role change that is written is audit-logged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as adminGuardLib from '../admin/guard'
import * as supabaseLib from '../supabase'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
}))

import { PATCH as adminUsersPatch } from '../../app/api/admin/users/route'
import { AdminConsoleService } from '../admin/service'

type Row = { id: string; is_admin: boolean }

/** In-memory `users` table supporting exactly the calls toggleUserAdminRole makes. */
function fakeUsersClient(rows: Row[], opts: { updateError?: boolean; countError?: boolean } = {}) {
  const updates: Array<{ id: string; is_admin: boolean }> = []
  const client = {
    from: (table: string) => {
      if (table !== 'users') throw new Error(`unexpected table ${table}`)
      return {
        select: (_cols: string, selectOpts?: { count?: string; head?: boolean }) => ({
          eq: (col: string, val: unknown) => {
            if (selectOpts?.head) {
              const count = rows.filter((r) => (r as Record<string, unknown>)[col] === val).length
              return Promise.resolve(
                opts.countError ? { count: null, error: { message: 'boom' } } : { count, error: null }
              )
            }
            return {
              maybeSingle: async () => ({ data: rows.find((r) => r.id === val) ?? null, error: null }),
            }
          },
        }),
        update: (patch: { is_admin: boolean }) => ({
          eq: (_col: string, id: string) => ({
            select: async () => {
              if (opts.updateError) return { data: null, error: { message: 'write failed' } }
              const row = rows.find((r) => r.id === id)
              if (!row) return { data: [], error: null }
              row.is_admin = patch.is_admin
              updates.push({ id, is_admin: patch.is_admin })
              return { data: [{ id }], error: null }
            },
          }),
        }),
      }
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, updates }
}

function patchRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/admin/users', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function actAs(userId: string) {
  vi.mocked(adminGuardLib.requireAdminUser).mockResolvedValue({
    authorized: true,
    userId,
    email: `${userId}@prodily.app`,
  })
}

describe('PATCH /api/admin/users admin lockout guards', () => {
  beforeEach(() => {
    vi.mocked(adminGuardLib.logAdminAction).mockClear()
    vi.mocked(adminGuardLib.requireAdminUser).mockReset()
  })

  it('refuses self-demotion with 400 and writes nothing', async () => {
    actAs('admin-a')
    const { client, updates } = fakeUsersClient([
      { id: 'admin-a', is_admin: true },
      { id: 'admin-b', is_admin: true },
    ])
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue(client)

    const res = await adminUsersPatch(patchRequest({ targetUserId: 'admin-a', makeAdmin: false }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('cannot remove your own admin access')
    expect(updates).toHaveLength(0)
    expect(adminGuardLib.logAdminAction).not.toHaveBeenCalled()
  })

  it('refuses to demote the last admin with 409', async () => {
    actAs('admin-a')
    // admin-a acts through a stale session; admin-b is the only remaining is_admin row.
    const { client, updates } = fakeUsersClient([
      { id: 'admin-a', is_admin: false },
      { id: 'admin-b', is_admin: true },
    ])
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue(client)

    const res = await adminUsersPatch(patchRequest({ targetUserId: 'admin-b', makeAdmin: false }))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('last administrator')
    expect(updates).toHaveLength(0)
    expect(adminGuardLib.logAdminAction).not.toHaveBeenCalled()
  })

  it('returns 404 when the target has no users row', async () => {
    actAs('admin-a')
    const { client } = fakeUsersClient([{ id: 'admin-a', is_admin: true }])
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue(client)

    const promote = await adminUsersPatch(patchRequest({ targetUserId: 'ghost', makeAdmin: true }))
    expect(promote.status).toBe(404)

    const demote = await adminUsersPatch(patchRequest({ targetUserId: 'ghost', makeAdmin: false }))
    expect(demote.status).toBe(404)
    expect(adminGuardLib.logAdminAction).not.toHaveBeenCalled()
  })

  it('demotes another admin when at least one admin remains, and audit-logs it', async () => {
    actAs('admin-a')
    const { client, updates } = fakeUsersClient([
      { id: 'admin-a', is_admin: true },
      { id: 'admin-b', is_admin: true },
    ])
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue(client)

    const res = await adminUsersPatch(patchRequest({ targetUserId: 'admin-b', makeAdmin: false }))

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ id: 'admin-b', is_admin: false }])
    expect(adminGuardLib.logAdminAction).toHaveBeenCalledWith(
      'admin-a',
      'admin-a@prodily.app',
      'revoke_admin_role',
      'user',
      'admin-b',
      { makeAdmin: false }
    )
  })

  it('promotes a learner and audit-logs the grant', async () => {
    actAs('admin-a')
    const { client, updates } = fakeUsersClient([
      { id: 'admin-a', is_admin: true },
      { id: 'learner-1', is_admin: false },
    ])
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue(client)

    const res = await adminUsersPatch(patchRequest({ targetUserId: 'learner-1', makeAdmin: true }))

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ id: 'learner-1', is_admin: true }])
    expect(adminGuardLib.logAdminAction).toHaveBeenCalledWith(
      'admin-a',
      'admin-a@prodily.app',
      'grant_admin_role',
      'user',
      'learner-1',
      { makeAdmin: true }
    )
  })

  it('returns 500 and logs nothing when the write fails', async () => {
    actAs('admin-a')
    const { client } = fakeUsersClient([{ id: 'learner-1', is_admin: false }], { updateError: true })
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue(client)

    const res = await adminUsersPatch(patchRequest({ targetUserId: 'learner-1', makeAdmin: true }))

    expect(res.status).toBe(500)
    expect(adminGuardLib.logAdminAction).not.toHaveBeenCalled()
  })
})

describe('AdminConsoleService.toggleUserAdminRole outcomes', () => {
  it('fails closed when the admin count cannot be read', async () => {
    const { client, updates } = fakeUsersClient(
      [
        { id: 'admin-a', is_admin: true },
        { id: 'admin-b', is_admin: true },
      ],
      { countError: true }
    )
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue(client)

    expect(await AdminConsoleService.toggleUserAdminRole('admin-b', false)).toBe('failed')
    expect(updates).toHaveLength(0)
  })

  it('demoting a user who is not an admin skips the count and succeeds', async () => {
    const { client } = fakeUsersClient([{ id: 'learner-1', is_admin: false }], { countError: true })
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue(client)

    expect(await AdminConsoleService.toggleUserAdminRole('learner-1', false)).toBe('updated')
  })
})
