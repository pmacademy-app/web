import { NextResponse } from 'next/server'

import { isRevalidatableAdminTag, revalidateAdminTag, REVALIDATABLE_ADMIN_TAGS } from '@/lib/admin/cache-tags'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'

/**
 * Expires one allowlisted admin cache tag so the next render refetches it (the
 * dashboard's Refresh button). Unknown tags are refused: this route must not become a
 * way to flush arbitrary data-cache entries.
 */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.cache.revalidate.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/cache/revalidate',
  },
  async ({ request, actor }) => {
    requireAdmin(actor)
    try {
      const body: unknown = await request.json().catch(() => null)
      const tag = body && typeof body === 'object' ? (body as { tag?: unknown }).tag : undefined

      if (!isRevalidatableAdminTag(tag)) {
        return NextResponse.json(
          { error: `tag must be one of: ${REVALIDATABLE_ADMIN_TAGS.join(', ')}.` },
          { status: 400 }
        )
      }

      revalidateAdminTag(tag)
      return NextResponse.json({ success: true, tag })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to refresh the admin cache.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
