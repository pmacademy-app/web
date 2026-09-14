import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'

/** GET /api/admin/emails/broadcasts — paginated broadcast list */
export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/broadcasts',
  },
  async ({ request }) => {
    try {
      const { searchParams } = new URL(request.url)
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
      const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get('pageSize') || '25', 10)))

      const result = await BroadcastService.listBroadcasts(page, pageSize)
      return NextResponse.json({ success: true, data: result })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)

/** POST /api/admin/emails/broadcasts — create a new draft broadcast */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/broadcasts',
  },
  async ({ request, actor }) => {
    try {
      const admin = requireAdmin(actor)
      const body = await request.json()
      const { name, description, template_key, subject_override, batch_size, recipient_filters } = body

      if (!name || typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'Broadcast name is required.' }, { status: 400 })
      }
      if (!template_key || typeof template_key !== 'string') {
        return NextResponse.json({ error: 'template_key is required.' }, { status: 400 })
      }

      const broadcast = await BroadcastService.createBroadcast({
        name: name.trim(),
        description: description?.trim(),
        template_key,
        subject_override: subject_override?.trim(),
        batch_size: batch_size ?? 100,
        recipient_filters: recipient_filters ?? {},
        created_by: admin.userId,
      })

      if (!broadcast) {
        return NextResponse.json({ error: 'Failed to create broadcast.' }, { status: 500 })
      }

      await logAdminAction(
        admin.userId,
        admin.email || '',
        'CREATE_BROADCAST',
        'email_broadcasts',
        broadcast.id,
        { name: broadcast.name, template_key: broadcast.template_key }
      )

      return NextResponse.json({ success: true, data: broadcast }, { status: 201 })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)
