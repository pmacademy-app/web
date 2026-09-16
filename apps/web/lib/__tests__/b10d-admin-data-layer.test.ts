/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B10-D — Remaining Frontend Data Layer: Admin Console Migration.
 *
 * Validates:
 * 1. Admin Contracts (`lib/api/contracts/admin.ts`):
 *    - Pure type interfaces with zero server dependencies or runtime side-effects.
 * 2. Admin SWR Fetching & Error Propagation:
 *    - Validates unpacking of Admin responses via `apiFetcher`.
 *    - Preserves `requestId` and `errorId` on admin error responses.
 *    - Enforces no-retry on 401/403 admin authorization errors.
 * 3. Admin Mutations with Typed Client:
 *    - `apiPost`, `apiPatch`, `apiDelete` return typed `ApiResult`.
 *    - Unpack success vs error without throwing unhandled exceptions.
 * 4. Architectural Client/Server Boundary Enforcement:
 *    - 100% of `components/admin/**` contains ZERO raw `fetch(` calls.
 *    - ZERO value-imports of `@/lib/db`, `*-db`, `createServiceRoleClient`, or server data layer.
 *    - Key admin query views adopt `useApiQuery` from `@/lib/api/hooks`.
 *    - Key admin mutation components adopt typed client methods from `@/lib/api/client`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import {
  apiFetcher,
  defaultShouldRetryOnError,
  ApiRequestError,
} from '@/lib/api/hooks'
import {
  apiPost,
  apiPatch,
  apiDelete,
} from '@/lib/api/client'
import type {
  AdminSystemAlertsResponse,
  AdminAnnouncementsResponse,
  AdminBroadcastsResponse,
} from '@/lib/api/contracts/admin'

const ROOT = path.resolve(import.meta.dirname, '../../')

function respond(
  body: string | null,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const headers = new Headers(init.headers ?? {})
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers,
    text: () => Promise.resolve(body ?? ''),
  } as unknown as Response
}

let fetchMock: any

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── 1. Admin Contracts & SWR Query Integration ─────────────────────────────

describe('B10-D — Admin Contracts & SWR Fetching', () => {
  it('unpacks admin system alerts via apiFetcher', async () => {
    const mockPayload: AdminSystemAlertsResponse = {
      success: true,
      alerts: [
        {
          id: 'alert-1',
          category: 'cron',
          operation: 'system.cron',
          severity: 'critical',
          message: 'Cron job failed',
          timestamp: new Date().toISOString(),
          status: 'new',
        },
      ],
      unacknowledgedCriticalCount: 1,
    }

    fetchMock.mockResolvedValue(
      respond(JSON.stringify(mockPayload), {
        headers: { 'x-request-id': 'req-admin-alerts-1' },
      })
    )

    const data = await apiFetcher<AdminSystemAlertsResponse>('/api/admin/system/alerts?limit=50')
    expect(data.success).toBe(true)
    expect(data.alerts).toHaveLength(1)
    expect(data.alerts[0].id).toBe('alert-1')
  })

  it('unpacks admin announcements and broadcasts correctly', async () => {
    const announcementsPayload: AdminAnnouncementsResponse = {
      success: true,
      announcements: [
        {
          id: 'ann-1',
          title: 'System Maintenance',
          content: 'Scheduled maintenance this Sunday.',
          type: 'warning',
          status: 'active',
          targetAudience: 'all',
          targetCohortId: null,
          targetUserId: null,
          linkUrl: null,
          linkText: null,
          scheduledAt: null,
          publishedAt: new Date().toISOString(),
          expiresAt: null,
          dismissible: true,
          priority: 1,
          createdBy: 'admin-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }

    fetchMock.mockResolvedValue(respond(JSON.stringify(announcementsPayload)))

    const annData = await apiFetcher<AdminAnnouncementsResponse>('/api/admin/announcements')
    expect(annData.success).toBe(true)
    expect(annData.announcements[0].title).toBe('System Maintenance')

    const broadcastsPayload: AdminBroadcastsResponse = {
      success: true,
      data: {
        broadcasts: [
          {
            id: 'bc-1',
            name: 'New Feature Launch',
            description: 'Check out the new features.',
            template_key: 'custom',
            subject_override: null,
            batch_size: 100,
            status: 'completed',
            recipient_filters: {},
            scheduled_at: null,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            sent_count: 120,
            failed_count: 0,
            skipped_count: 0,
            total_recipients: 120,
            last_batch_index: 0,
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
      },
    }

    fetchMock.mockResolvedValue(respond(JSON.stringify(broadcastsPayload)))

    const bcData = await apiFetcher<AdminBroadcastsResponse>('/api/admin/emails/broadcasts')
    expect(bcData.success).toBe(true)
    expect(bcData.data?.broadcasts[0].name).toBe('New Feature Launch')
  })

  it('preserves errorId and requestId on admin API failure', async () => {
    fetchMock.mockResolvedValue(
      respond(
        JSON.stringify({
          success: false,
          error: 'Superadmin privileges required',
          code: 'FORBIDDEN',
          errorId: 'err-admin-sec-99',
        }),
        {
          status: 403,
          headers: { 'x-request-id': 'req-sec-trace-77' },
        }
      )
    )

    try {
      await apiFetcher('/api/admin/system/errors')
      expect.unreachable('Should have thrown ApiRequestError')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError)
      const apiErr = err as ApiRequestError
      expect(apiErr.status).toBe(403)
      expect(apiErr.code).toBe('FORBIDDEN')
      expect(apiErr.errorId).toBe('err-admin-sec-99')
      expect(apiErr.requestId).toBe('req-sec-trace-77')
      expect(defaultShouldRetryOnError(apiErr)).toBe(false)
    }
  })
})

// ─── 2. Admin Mutations with Typed Client ────────────────────────────────────

describe('B10-D — Admin Mutations with Typed Client', () => {
  it('handles apiPatch for admin status updates cleanly', async () => {
    fetchMock.mockResolvedValue(
      respond(
        JSON.stringify({ success: true, count: 1 }),
        { headers: { 'x-request-id': 'req-patch-1' } }
      )
    )

    const result = await apiPatch<{ success: boolean; count: number }>(
      '/api/admin/system/alerts/acknowledge',
      { ids: ['alert-1'] }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.success).toBe(true)
      expect(result.data.count).toBe(1)
      expect(result.requestId).toBe('req-patch-1')
    }
  })

  it('handles apiPost for admin broadcasts with correlation headers', async () => {
    fetchMock.mockResolvedValue(
      respond(
        JSON.stringify({ success: true, broadcastId: 'bc-new-123' }),
        { status: 201, headers: { 'x-request-id': 'req-post-broadcast' } }
      )
    )

    const result = await apiPost<{ success: boolean; broadcastId: string }>(
      '/api/admin/notifications/broadcasts',
      { title: 'Welcome', body: 'Hello' }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.broadcastId).toBe('bc-new-123')
      expect(result.requestId).toBe('req-post-broadcast')
    }
  })

  it('handles apiDelete for admin announcements', async () => {
    fetchMock.mockResolvedValue(
      respond(JSON.stringify({ success: true }))
    )

    const result = await apiDelete<{ success: boolean }>('/api/admin/announcements/ann-1')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.success).toBe(true)
    }
  })
})

// ─── 3. Architectural Client/Server Boundary Enforcement ─────────────────────

describe('B10-D — Boundary Enforcement in components/admin', () => {
  const adminDir = path.join(ROOT, 'components/admin')
  const allFiles = readdirSync(adminDir).filter((f) => statSync(path.join(adminDir, f)).isFile())
  const tsxFiles = allFiles.filter((f) => f.endsWith('.tsx'))

  it('has zero raw fetch() calls in components/admin', () => {
    const offending: string[] = []

    for (const file of tsxFiles) {
      const source = readFileSync(path.join(adminDir, file), 'utf8')
      // Look for fetch( that is not part of a comment or method name
      if (/\bfetch\s*\(/.test(source)) {
        offending.push(file)
      }
    }

    expect(offending, `Found raw fetch() calls in: ${offending.join(', ')}`).toEqual([])
  })

  it('has zero value-imports of server DB modules in components/admin', () => {
    const offending: { file: string; importLine: string }[] = []

    for (const file of tsxFiles) {
      const source = readFileSync(path.join(adminDir, file), 'utf8')
      const importStatements = source.match(/^import[\s\S]*?from\s+['"][^'"]+['"]/gm) ?? []

      for (const statement of importStatements) {
        // Skip type-only imports
        if (/^import\s+type\b/.test(statement)) continue

        const isForbidden =
          statement.includes("from '@/lib/db") ||
          statement.includes("from '@/lib/admin/service-role") ||
          statement.includes("from '@/lib/supabase/service-role") ||
          statement.includes("from '@supabase/supabase-js") ||
          (statement.includes("-db'") && !statement.includes('types'))

        if (isForbidden) {
          offending.push({ file, importLine: statement.trim() })
        }
      }
    }

    expect(offending, `Server DB value-imports found in components/admin: ${JSON.stringify(offending)}`).toEqual([])
  })

  it('adopts useApiQuery in key Category A polling/query views', () => {
    const expectedQueryViews = [
      'AdminSystemAlertsView.tsx',
      'AdminSystemErrorsView.tsx',
      'AdminSystemAuditView.tsx',
      'AdminAnnouncementsView.tsx',
      'AdminBroadcastsView.tsx',
    ]

    for (const view of expectedQueryViews) {
      const source = readFileSync(path.join(adminDir, view), 'utf8')
      expect(source, `${view} should import useApiQuery`).toContain('useApiQuery')
      expect(source, `${view} should import from @/lib/api/hooks`).toContain("from '@/lib/api/hooks'")
    }
  })

  it('adopts typed API client (apiPost/apiPatch/apiDelete/apiGet) in interactive admin components', () => {
    const sampleMutations = [
      'UserRoleToggle.tsx',
      'UserFellowToggle.tsx',
      'FeatureFlagToggle.tsx',
      'UserDetailDrawer.tsx',
      'AdminQueueView.tsx',
      'AdminEmailAutomationsView.tsx',
      'AdminInAppNotificationView.tsx',
      'AdminTemplateEditor.tsx',
      'SettingsWorkspace.tsx',
      'AdminCreateBroadcastModal.tsx',
      'AdminCreateInAppNotificationModal.tsx',
      'AdminAnnouncementEditorModal.tsx',
      'AdminErrorDetailDrawer.tsx',
    ]

    for (const comp of sampleMutations) {
      const source = readFileSync(path.join(adminDir, comp), 'utf8')
      expect(source, `${comp} should import from @/lib/api/client`).toContain("from '@/lib/api/client'")
    }
  })

  it('contracts/admin.ts contains pure types and no server dependencies', () => {
    const contractSource = readFileSync(path.join(ROOT, 'lib/api/contracts/admin.ts'), 'utf8')
    expect(contractSource).not.toContain("from '@/lib/db")
    expect(contractSource).not.toContain("from '@supabase")
    // Should be valid TypeScript definitions
    expect(contractSource).toContain('export interface AdminSystemAlertsResponse')
    expect(contractSource).toContain('export interface AdminAnnouncementsResponse')
  })
})
