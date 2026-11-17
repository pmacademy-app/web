/**
 * POST /api/portfolio/share
 *
 * Records server-side `portfolio_shared` product event (PROD-15).
 *
 * Learners only, rate limited per user: every call inserts a product_events
 * row, so an open or unbounded endpoint lets anyone fill the database.
 * Anonymous visitors sharing a public portfolio get a 401, which the
 * fire-and-forget client caller ignores.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { trackProductEvent } from '@/lib/events/product-events'

const shareSchema = z.object({
  context: z.string().max(32).default('portfolio'),
  username: z.string().max(100).optional(),
  channel: z.string().max(32).optional(),
})

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'portfolio.share.track',
    summary: 'Track server-side portfolio share event',
    body: shareSchema,
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `portfolio_share_${actor.userId}` : null),
        limit: 20,
        windowMs: 60 * 60 * 1000,
      },
    ],
  },
  async ({ actor, body }) => {
    await trackProductEvent('portfolio_shared', requireUserId(actor), {
      context: body.context,
      username: body.username,
      channel: body.channel,
    })

    return NextResponse.json({ success: true })
  }
)
