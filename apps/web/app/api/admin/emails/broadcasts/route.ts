import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'
import { clampPagination, paginated } from '@/lib/api/pagination'

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
      // B13-B: this route used `page`/`pageSize` while every other list used
      // `page`/`limit`. Both legacy names are still accepted so an already-deployed
      // admin console keeps working through the rollout, but the bound and the
      // envelope are now the shared ones.
      const legacyPage = Number(searchParams.get('page'))
      const legacyPageSize = searchParams.get('pageSize')
      const requestedLimit = searchParams.get('limit') ?? legacyPageSize

      const window = clampPagination({
        limit: requestedLimit,
        offset:
          searchParams.get('offset') ??
          (Number.isFinite(legacyPage) && legacyPage > 1
            ? (legacyPage - 1) * clampPagination({ limit: requestedLimit }).limit
            : null),
      })

      const pageNumber = Math.floor(window.offset / window.limit) + 1
      const result = await BroadcastService.listBroadcasts(pageNumber, window.limit)

      // `data` keeps its original shape — AdminBroadcastsView reads
      // `data.broadcasts`/`data.totalPages` — and the contract envelope is added
      // alongside it rather than replacing it.
      const body = paginated(result.broadcasts, window, result.total)
      return NextResponse.json({ success: true, ...body, data: result })
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
