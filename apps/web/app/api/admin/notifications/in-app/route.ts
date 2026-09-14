import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { InAppManagerService } from '@/lib/admin/in-app-manager-service'
import { z } from 'zod'

export const runtime = 'nodejs'

const createBroadcastSchema = z.object({
  title: z.string().min(1, 'Title is required.').max(150, 'Title must be 150 characters or less.').trim(),
  body: z.string().min(1, 'Body content is required.').max(2000, 'Body must be 2000 characters or less.').trim(),
  category: z.enum(['announcement', 'learning', 'achievements', 'product_updates', 'security', 'marketing']).default('announcement'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  actionUrl: z.string().max(300).nullable().optional(),
  audience: z.enum(['all', 'individual', 'cohort', 'filtered']).default('all'),
  targetUserId: z.string().uuid().nullable().optional(),
  targetCohortId: z.string().uuid().nullable().optional(),
  recipientFilters: z.record(z.string(), z.unknown()).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional().or(z.string().datetime().nullable().optional()),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional().or(z.string().datetime().nullable().optional()),
  status: z.enum(['draft', 'scheduled', 'sending', 'completed']).optional(),
  idempotencyKey: z.string().optional(),
})

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/notifications/in-app',
  },
  async ({ request }) => {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10)))
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || undefined

    try {
      const result = await InAppManagerService.listBroadcasts(page, pageSize, status, search)
      return NextResponse.json({ success: true, ...result })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Failed to list in-app notifications') },
        { status: 500 }
      )
    }
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/notifications/in-app',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)
    try {
      const body = await request.json().catch(() => ({}))
      const parsed = createBroadcastSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Invalid input data', code: 'VALIDATION' },
          { status: 400 }
        )
      }

      const {
        title,
        body: contentBody,
        category,
        priority,
        actionUrl,
        audience,
        targetUserId,
        targetCohortId,
        recipientFilters,
        scheduledAt,
        expiresAt,
        status,
        idempotencyKey,
      } = parsed.data

      if (audience === 'individual' && !targetUserId) {
        return NextResponse.json({ error: 'Target user is required for individual audience.' }, { status: 400 })
      }

      if (audience === 'cohort' && !targetCohortId) {
        return NextResponse.json({ error: 'Target cohort is required for cohort audience.' }, { status: 400 })
      }

      const item = await InAppManagerService.createBroadcast({
        title,
        body: contentBody,
        category,
        priority,
        actionUrl: actionUrl || null,
        audience,
        targetUserId: targetUserId || null,
        targetCohortId: targetCohortId || null,
        recipientFilters: recipientFilters as never,
        scheduledAt: scheduledAt || null,
        expiresAt: expiresAt || null,
        status,
        createdBy: admin.userId,
        idempotencyKey,
      })

      await logAdminAction(
        admin.userId,
        admin.email || '',
        'in_app_notification_created',
        'in_app_broadcast',
        item.id,
        { title: item.title, audience: item.audience, status: item.status }
      )

      return NextResponse.json({ success: true, item }, { status: 201 })
    } catch (err) {
      console.error('[POST /api/admin/notifications/in-app] Error:', err)
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Failed to create in-app notification') },
        { status: 500 }
      )
    }
  }
)
