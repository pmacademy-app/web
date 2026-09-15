import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getCohortsData, toggleCohortMembership } from '@/lib/leaderboard-db'
import { createServiceRoleClient } from '@/lib/supabase'

const membershipSchema = z.object({
  cohortSlug: z.string().min(1, 'Valid cohortSlug and action (join/leave) required.'),
  action: z.enum(['join', 'leave'], { message: 'Valid cohortSlug and action (join/leave) required.' }),
})

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'cohorts.read',
    summary: 'Unexpected failure fetching learner cohorts',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const cohorts = await getCohortsData(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, cohorts })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'cohorts.membership.update',
    summary: 'Unexpected failure updating cohort membership',
    body: membershipSchema,
  },
  async ({ actor, body }) => {
    const supabase = createServiceRoleClient()
    const result = await toggleCohortMembership(supabase, requireUserId(actor), body.cohortSlug, body.action)

    return NextResponse.json({ success: true, isMember: result.isMember })
  }
)
