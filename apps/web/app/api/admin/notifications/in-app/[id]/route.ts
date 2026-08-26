import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
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

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
  }

  const { id } = await props.params
  const item = await InAppManagerService.getBroadcast(id)
  if (!item) {
    return NextResponse.json({ error: 'In-app notification not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true, item })
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
  }

  const { id } = await props.params
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
      auth.userId,
      auth.email || '',
      'in_app_notification_updated',
      'in_app_broadcast',
      id,
      parsed.data
    )

    return NextResponse.json({ success: true, item })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
  }

  const { id } = await props.params
  const res = await InAppManagerService.deleteBroadcast(id)
  if (!res.success) {
    return NextResponse.json({ error: res.error || 'Delete failed' }, { status: 400 })
  }

  await logAdminAction(
    auth.userId,
    auth.email || '',
    'in_app_notification_deleted',
    'in_app_broadcast',
    id
  )

  return NextResponse.json({ success: true })
}
