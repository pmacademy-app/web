import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { parseBody } from '@/lib/api/contracts/body'
import { leaderboardOptInBodySchema } from '@/lib/api/contracts/learner-writes'
import { getWeeklyLeaderboard, getCohortLeaderboard, toggleLeaderboardOptIn } from '@/lib/leaderboard/leaderboard-db'
import { createServiceRoleClient } from '@/lib/supabase'

const leaderboardQuerySchema = z.object({
  scope: z.string().optional(),
  cohortId: z.string().optional(),
})

/**
 * The body is read in the handler rather than declared on the wrapper.
 *
 * Before migration this route parsed with `request.json().catch(() => ({}))` and
 * then `Boolean(body.isOptedIn)`, so a missing or unparseable body opted the
 * learner out — it never returned 400. Declaring a body schema would make the
 * wrapper reject malformed JSON instead, which is a different contract for the
 * privacy toggle than the one shipped. Same reasoning on `/api/certificates`.
 * A body that does parse must match the contract: a boolean flag and nothing else.
 */
async function readOptIn(request: Request): Promise<boolean> {
  const parsed = parseBody(leaderboardOptInBodySchema, await request.json().catch(() => ({})))
  if (!parsed.ok) throw new RouteError(400, 'VALIDATION', parsed.message)
  return Boolean(parsed.data.isOptedIn)
}

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'leaderboard.read',
    summary: 'Unexpected failure fetching the leaderboard',
    query: leaderboardQuerySchema,
  },
  async ({ actor, query }) => {
    const userId = requireUserId(actor)
    const supabase = createServiceRoleClient()

    if ((query.scope || 'global') === 'cohort') {
      if (!query.cohortId) {
        throw new RouteError(400, 'VALIDATION', 'cohortId is required for scope=cohort.')
      }
      const payload = await getCohortLeaderboard(supabase, userId, query.cohortId)
      return NextResponse.json({ success: true, scope: 'cohort', ...payload })
    }

    const payload = await getWeeklyLeaderboard(supabase, userId)
    return NextResponse.json({ success: true, scope: 'global', ...payload })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'leaderboard.opt_in.update',
    summary: 'Unexpected failure updating leaderboard privacy',
    // The learner toggles this by hand; 60 per 10 minutes is far past any real use.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `leaderboard_opt_in_${actor.userId}` : null),
        limit: 60,
        windowMs: 10 * 60 * 1000,
      },
    ],
  },
  async ({ request, actor }) => {
    const supabase = createServiceRoleClient()
    const result = await toggleLeaderboardOptIn(supabase, requireUserId(actor), await readOptIn(request))

    return NextResponse.json({ success: true, isOptedIn: result.isOptedIn })
  }
)
