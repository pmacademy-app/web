/**
 * POST /api/portfolio/share
 *
 * Records server-side `portfolio_shared` product event (PROD-15).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withRoute } from '@/lib/api/with-route'
import { trackProductEvent } from '@/lib/events/product-events'

const shareSchema = z.object({
  context: z.string().max(32).default('portfolio'),
  username: z.string().max(100).optional(),
  channel: z.string().max(32).optional(),
})

export const POST = withRoute(
  {
    actor: { allow: ['anonymous', 'learner', 'admin'] },
    operation: 'portfolio.share.track',
    summary: 'Track server-side portfolio share event',
    body: shareSchema,
  },
  async ({ actor, body }) => {
    const userId = actor.kind === 'learner' || actor.kind === 'admin' ? actor.userId : null

    await trackProductEvent('portfolio_shared', userId, {
      context: body.context,
      username: body.username,
      channel: body.channel,
    })

    return NextResponse.json({ success: true })
  }
)

