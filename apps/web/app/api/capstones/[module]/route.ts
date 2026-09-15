import { NextResponse } from 'next/server'

import { getCapstoneDefinition } from '@/config/capstones'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { loadCapstoneSubmission } from '@/lib/capstones-db'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'capstones.module.read',
    summary: 'Unexpected failure fetching capstone details',
  },
  async ({ actor, params }) => {
    const moduleSlug = params.module
    const capstoneDef = getCapstoneDefinition(moduleSlug)

    // The slug check now runs after authentication rather than before it. The
    // wrapper resolves the actor first by design, which also stops an unauthenticated
    // caller from enumerating valid module slugs off the 404/401 split.
    if (!capstoneDef) {
      throw new RouteError(404, 'NOT_FOUND', 'Invalid module capstone slug.')
    }

    const userId = requireUserId(actor)
    const supabase = createServiceRoleClient()
    const [result, userProfileRes] = await Promise.all([
      loadCapstoneSubmission(supabase, userId, moduleSlug),
      supabase
        .from('users')
        .select('username, is_portfolio_public')
        .eq('id', userId)
        .maybeSingle(),
    ])

    const userProfile = {
      username: userProfileRes.data?.username || '',
      isPortfolioPublic: userProfileRes.data?.is_portfolio_public ?? true,
    }

    return NextResponse.json({
      success: true,
      definition: capstoneDef,
      submission: result.submission,
      reflection: result.reflection,
      status: result.status,
      userProfile,
    })
  }
)
