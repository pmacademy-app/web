import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'
import { clampPagination, paginated } from '@/lib/api/pagination'

export const runtime = 'nodejs'

/** GET /api/admin/emails/broadcasts: paginated broadcast list */
export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/broadcasts',
  },
  async ({ request }) => {
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

    // `data` keeps its original shape: AdminBroadcastsView reads
    // `data.broadcasts`/`data.totalPages`: and the contract envelope is added
    // alongside it rather than replacing it.
    const body = paginated(result.broadcasts, window, result.total)
    return NextResponse.json({ success: true, ...body, data: result })
  }
)

/** POST /api/admin/emails/broadcasts: create a new draft broadcast */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/broadcasts',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)

    let body: Record<string, unknown>
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const { name, description, template_key, subject_override, batch_size, recipient_filters } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new RouteError(400, 'VALIDATION', 'Broadcast name is required.')
    }
    if (!template_key || typeof template_key !== 'string') {
      throw new RouteError(400, 'VALIDATION', 'template_key is required.')
    }

    const broadcast = await BroadcastService.createBroadcast({
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() : undefined,
      template_key,
      subject_override: typeof subject_override === 'string' ? subject_override.trim() : undefined,
      batch_size: typeof batch_size === 'number' ? batch_size : 100,
      recipient_filters: (recipient_filters && typeof recipient_filters === 'object' ? recipient_filters : {}) as Record<string, unknown>,
      created_by: admin.userId,
    })

    if (!broadcast) {
      throw new Error('Failed to create broadcast.')
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
  }
)
