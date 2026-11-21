import { NextResponse } from 'next/server'

import { RouteError, withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase'
import { goalUpdateSchema } from '@/lib/api/contracts/settings'
import { logSystemError } from '@/lib/monitoring/logger'

export { goalUpdateSchema }

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.goal.read',
    domain: 'api',
    summary: 'Unexpected failure reading learner weekly goal settings',
  },
  async ({ request, actor }) => {
    const supabase = await getLearnerDbForRequest(request)
    const { data: user, error } = await supabase
      .from('users')
      .select('weekly_goal_lessons, session_minutes')
      .eq('id', actor.kind === 'learner' ? actor.userId : '')
      .maybeSingle()

    if (error) {
      throw new RouteError(500, 'SERVER_ERROR', 'Failed to fetch user goal settings.')
    }

    return NextResponse.json({
      success: true,
      weekly_goal_lessons: user?.weekly_goal_lessons ?? null,
      session_minutes: user?.session_minutes ?? null,
    })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.goal.update',
    domain: 'api',
    summary: 'Unexpected failure updating learner weekly goal settings',
    body: goalUpdateSchema,
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `settings_goal_${actor.userId}` : null),
        limit: 30,
        windowMs: 60 * 60 * 1000,
      },
    ],
  },
  async ({ actor, body }) => {
    const { weekly_goal_lessons, session_minutes } = body

    const supabase = createServiceRoleClient()
    const { error } = await supabase
      .from('users')
      .update({
        weekly_goal_lessons: weekly_goal_lessons ?? null,
        session_minutes: session_minutes ?? null,
      })
      .eq('id', actor.kind === 'learner' ? actor.userId : '')

    if (error) {
      void logSystemError({
        severity: 'error',
        category: 'db',
        operation: 'settings.goal.update',
        message: `Failed to update weekly goal settings: ${error.message}`,
        userId: actor.kind === 'learner' ? actor.userId : undefined,
        details: { error: error.message },
      })
      throw new RouteError(400, 'SERVER_ERROR', 'Failed to update goal settings.')
    }

    return NextResponse.json({ success: true })
  }
)
