import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { InAppManagerService } from '@/lib/admin/in-app-manager-service'
import { z } from 'zod'

export const runtime = 'nodejs'

const updateSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  body: z.string().min(1).max(2000).optional(),
  category: z.enum(['announcement', 'learning', 'achievements', 'product_updates', 'security', 'marketing']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  actionUrl: z.string().max(300).nullable().optional(),
  audience: z.enum(['all', 'individual', 'cohort', 'filtered']).optional(),
  targetUserId: z.string().uuid().nullable().optional(),
  targetCohortId: z.string().uuid().nullable().optional(),
  recipientFilters: z.record(z.string(), z.unknown()).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional().or(z.string().datetime().nullable().optional()),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional().or(z.string().datetime().nullable().optional()),
})

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.id.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/notifications/in-app/[id]',
  },
  async ({ params }) => {
    const { id } = params
    const item = await InAppManagerService.getBroadcast(id)
    if (!item) {
      return NextResponse.json({ error: 'In-app notification not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, item })
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.id.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/notifications/in-app/[id]',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params
    try {
      const body = await request.json().catch(() => ({}))
      const parsed = updateSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Invalid update data', code: 'VALIDATION' },
          { status: 400 }
        )
      }

      const item = await InAppManagerService.updateBroadcast(id, parsed.data as never)

      await logAdminAction(
        admin.userId,
        admin.email || '',
        'in_app_notification_updated',
        'in_app_broadcast',
        id,
        parsed.data
      )

      return NextResponse.json({ success: true, item })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Update failed') },
        { status: 500 }
      )
    }
  }
)

export const DELETE = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.id.delete',
    domain: 'admin',
    summary: 'Unexpected failure in DELETE /api/admin/notifications/in-app/[id]',
  },
  async ({ actor, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params
    const res = await InAppManagerService.deleteBroadcast(id)
    if (!res.success) {
      return NextResponse.json({ error: res.error || 'Delete failed' }, { status: 400 })
    }

    await logAdminAction(
      admin.userId,
      admin.email || '',
      'in_app_notification_deleted',
      'in_app_broadcast',
      id
    )

    return NextResponse.json({ success: true })
  }
)
