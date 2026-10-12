import { NextResponse } from 'next/server'
import { z } from 'zod'

import { revalidateAdminTag, REVALIDATABLE_ADMIN_TAGS, type AdminCacheTag } from '@/lib/admin/cache-tags'
import { requireAdmin } from '@/lib/api/actor'
import type { AdminCacheRevalidateResponse } from '@/lib/api/contracts/admin'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'

/** Only the allowlisted admin tags; anything else (or a missing tag) is a 400. */
const revalidateBodySchema = z.object({
  tag: z.enum(REVALIDATABLE_ADMIN_TAGS as [AdminCacheTag, ...AdminCacheTag[]], {
    error: `tag must be one of: ${REVALIDATABLE_ADMIN_TAGS.join(', ')}.`,
  }),
})

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
    body: revalidateBodySchema,
    // Each call expires a tag and makes the next render recompute it, so a stuck or
    // scripted Refresh must not become a way to keep the caches cold. Ten per admin per minute.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'admin' ? `admin_cache_revalidate_${actor.userId}` : null),
        limit: 10,
        windowMs: 60 * 1000,
      },
    ],
  },
  async ({ actor, body }) => {
    requireAdmin(actor)
    try {
      revalidateAdminTag(body.tag)
      return NextResponse.json<AdminCacheRevalidateResponse>({ success: true, tag: body.tag })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to refresh the admin cache.')
      console.error('[API POST /api/admin/cache/revalidate] Error:', error)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
