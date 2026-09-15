import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { getWeeklyLeaderboard, getCohortLeaderboard, toggleLeaderboardOptIn } from '@/lib/leaderboard-db'
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
 */
async function readOptIn(request: Request): Promise<boolean> {
  const body = await request.json().catch(() => ({}))
  return Boolean((body as { isOptedIn?: unknown })?.isOptedIn)
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
  },
  async ({ request, actor }) => {
    const supabase = createServiceRoleClient()
    const result = await toggleLeaderboardOptIn(supabase, requireUserId(actor), await readOptIn(request))

    return NextResponse.json({ success: true, isOptedIn: result.isOptedIn })
  }
)
