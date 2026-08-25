import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User, SupabaseClient } from '@supabase/supabase-js'
import { requireAdminUser, logAdminAction } from '../admin/guard'
import { isAdminEmail, isAdminUser } from '../admin/authorization'
import * as authModule from '../auth'
import * as supabaseModule from '../supabase'
import { GET as searchGet } from '@/app/api/admin/search/route'
import { NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase'

describe('Phase 7 — Admin Security, Authorization & Audit Logging Unit Tests', () => {
  const originalEnv = process.env.ADMIN_EMAILS

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.ADMIN_EMAILS = ''
  })

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalEnv
  })

  it('requireAdminUser rejects unauthenticated requests with 401', async () => {
    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(null)

    const request = new Request('http://localhost:3000/api/admin/summary')
    const result = await requireAdminUser(request)

    expect(result.authorized).toBe(false)
    expect(result.statusCode).toBe(401)
    expect(result.error).toBe('Authentication required')
  })

  it('requireAdminUser rejects non-admin users with 403', async () => {
    const mockUser: User = {
      id: 'usr-learner',
      email: 'learner@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    }

    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(mockUser)

    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { is_admin: false, email: 'learner@example.com' },
              error: null,
            }),
          }),
        }),
        insert: async () => ({ error: null }),
      }),
    } as unknown as SupabaseClient<Database>

    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockClient)

    const request = new Request('http://localhost:3000/api/admin/summary')
    const result = await requireAdminUser(request)

    expect(result.authorized).toBe(false)
    expect(result.statusCode).toBe(403)
    expect(result.error).toContain('Admin privileges required')
  })

  it('requireAdminUser authorizes valid admin users via email or database flag', async () => {
    const mockAdmin: User = {
      id: 'usr-admin',
      email: 'superadmin@prodily.app',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    }

    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(mockAdmin)

    process.env.ADMIN_EMAILS = 'superadmin@prodily.app'

    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { is_admin: true, email: 'superadmin@prodily.app' },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>

    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockClient)

    const request = new Request('http://localhost:3000/api/admin/summary')
    const result = await requireAdminUser(request)

    expect(result.authorized).toBe(true)
    expect(result.userId).toBe('usr-admin')
    expect(result.email).toBe('superadmin@prodily.app')
  })

  it('isAdminEmail correctly parses comma-separated lists and handles case insensitivity', () => {
    process.env.ADMIN_EMAILS = 'lead@prodily.app, manager@prodily.app, CEO@PRODILY.APP'

    expect(isAdminEmail('lead@prodily.app')).toBe(true)
    expect(isAdminEmail('LEAD@prodily.app')).toBe(true)
    expect(isAdminEmail('manager@prodily.app')).toBe(true)
    expect(isAdminEmail('ceo@prodily.app')).toBe(true)
    expect(isAdminEmail('learner@prodily.app')).toBe(false)
    expect(isAdminEmail('')).toBe(false)
    expect(isAdminEmail(null)).toBe(false)
  })

  it('isAdminUser evaluates database is_admin when email is not in env list', async () => {
    const mockAdminClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { is_admin: true }, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>

    const mockLearnerClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { is_admin: false }, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>

    expect(await isAdminUser(mockAdminClient, 'usr-admin', 'admin@example.com')).toBe(true)
    expect(await isAdminUser(mockLearnerClient, 'usr-learner', 'learner@example.com')).toBe(false)
  })

  it('logAdminAction writes audit records to admin_audit_logs with structured metadata', async () => {
    interface AdminAuditLogRow {
      admin_user_id?: string
      admin_email?: string
      action?: string
      target_resource?: string
      target_id?: string
      metadata?: Record<string, unknown>
    }
    let capturedRow: AdminAuditLogRow | null = null

    const mockClient = {
      from: (table: string) => {
        if (table === 'admin_audit_logs') {
          return {
            insert: async (row: Record<string, unknown>) => {
              capturedRow = row as AdminAuditLogRow
              return { error: null }
            },
          }
        }
        return {
          insert: async () => ({ error: null }),
        }
      },
    } as unknown as SupabaseClient<Database>

    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockClient)

    await logAdminAction(
      'admin-123',
      'superadmin@prodily.app',
      'admin_user_deleted',
      'user',
      'target-user-456',
      { reason: 'Requested GDPR deletion' }
    )

    expect(capturedRow).not.toBeNull()
    const row = capturedRow as unknown as AdminAuditLogRow
    expect(row.admin_user_id).toBe('admin-123')
    expect(row.admin_email).toBe('superadmin@prodily.app')
    expect(row.action).toBe('admin_user_deleted')
    expect(row.target_resource).toBe('user')
    expect(row.target_id).toBe('target-user-456')
  })

  it('GET /api/admin/search returns 401/403 for unauthorized requests', async () => {
    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(null)

    const req = new NextRequest('http://localhost:3000/api/admin/search?q=test')
    const res = await searchGet(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBeDefined()
  })

  it('GET /api/admin/search returns empty category arrays when query is too short', async () => {
    process.env.ADMIN_EMAILS = 'admin@prodily.app'

    const mockAdmin: User = {
      id: 'admin-id',
      email: 'admin@prodily.app',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    }

    vi.spyOn(authModule, 'getAuthenticatedUserFromRequest').mockResolvedValue(mockAdmin)

    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { is_admin: true, email: 'admin@prodily.app' },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient<Database>

    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockClient)

    const req = new NextRequest('http://localhost:3000/api/admin/search?q=a')
    const res = await searchGet(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.total).toBe(0)
    expect(data.results.users).toEqual([])
    expect(data.results.curriculum).toEqual([])
  })
})
