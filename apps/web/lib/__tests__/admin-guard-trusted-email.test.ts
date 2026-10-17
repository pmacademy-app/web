import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { User, SupabaseClient } from '@supabase/supabase-js'
import { requireAdminUser } from '../admin/guard'
import * as authModule from '../auth'
import * as supabaseModule from '../supabase'
import type { Database } from '@/lib/supabase'

/**
 * Security regression: the admin guard must decide ADMIN_EMAILS membership from the verified
 * auth identity, not from `public.users.email`, which a signed-in learner can edit.
 */

function authUser(id: string, email: string): User {
  return {
    id,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  }
}

function serviceClient(row: { is_admin: boolean; email: string }) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
      insert: async () => ({ error: null }),
    }),
  } as unknown as SupabaseClient<Database>
}

describe('requireAdminUser trusts the auth email, not users.email', () => {
  const originalEnv = process.env.ADMIN_EMAILS

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.ADMIN_EMAILS = 'boss@example.com'
  })

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalEnv
  })

  it('denies a learner whose users.email was rewritten to an admin address', async () => {
    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(
      authUser('usr-learner', 'learner@example.com')
    )
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      serviceClient({ is_admin: false, email: 'boss@example.com' })
    )

    const result = await requireAdminUser(new Request('http://localhost:3000/api/admin/summary'))

    expect(result.authorized).toBe(false)
    expect(result.statusCode).toBe(403)
  })

  it('denies a case-variant of an admin address written to users.email', async () => {
    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(
      authUser('usr-learner', 'learner@example.com')
    )
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      serviceClient({ is_admin: false, email: 'Boss@Example.com' })
    )

    const result = await requireAdminUser(new Request('http://localhost:3000/api/admin/users'))

    expect(result.authorized).toBe(false)
  })

  it('allows an ADMIN_EMAILS admin identified by the auth session email', async () => {
    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(
      authUser('usr-boss', 'Boss@Example.com')
    )
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      serviceClient({ is_admin: false, email: 'stale-profile@example.com' })
    )

    const result = await requireAdminUser(new Request('http://localhost:3000/api/admin/summary'))

    expect(result.authorized).toBe(true)
    expect(result.userId).toBe('usr-boss')
    expect(result.email).toBe('Boss@Example.com')
  })

  it('still allows a database is_admin admin regardless of email', async () => {
    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(
      authUser('usr-db-admin', 'dbadmin@example.com')
    )
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      serviceClient({ is_admin: true, email: 'dbadmin@example.com' })
    )

    const result = await requireAdminUser(new Request('http://localhost:3000/api/admin/summary'))

    expect(result.authorized).toBe(true)
  })
})

describe('20261017000001 migration (static check)', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../../../supabase/migrations/20261017000001_admin_guard_email_and_rpc_grants.sql'
    ),
    'utf8'
  ).replace(/--.*$/gm, '')

  it('rejects end-user changes to users.email in the privileged-column trigger', () => {
    expect(sql).toMatch(/NEW\.email\s+IS\s+DISTINCT\s+FROM\s+OLD\.email/i)
    expect(sql).toMatch(/current_user\s+NOT\s+IN\s+\('authenticated',\s*'anon'\)/i)
  })

  const functions = [
    'claim_email_send(text, text, text)',
    'finalize_email_send(text, text, text, int, jsonb)',
    'consume_rate_limit(text, int, bigint)',
    'reserve_provider_email_quota(text, int)',
    'release_provider_email_quota(text)',
    'mark_provider_exhausted(text)',
    'is_provider_exhausted(text)',
  ]

  it.each(functions)('revokes %s from anon and authenticated and keeps service_role', (fn) => {
    const escaped = fn.replace(/[()]/g, '\\$&')
    expect(sql).toMatch(
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM PUBLIC, anon, authenticated`)
    )
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO service_role`))
  })
})
