import { NextResponse } from 'next/server'

import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { profileUpdateSchema } from '@/lib/api/contracts/settings'
import { isValidAvatarUrl } from '@/lib/avatar/avatar-service'
import { logSystemError } from '@/lib/monitoring/logger'
import { revalidatePublicPortfolioForUser } from '@/lib/portfolio/portfolio-revalidate'
import { invalidateLeaderboardCache } from '@/lib/leaderboard/leaderboard-db'

export { profileUpdateSchema }

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.profile.read',
    domain: 'api',
    summary: 'Unexpected failure reading learner profile settings',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const { data: profile, error } = await supabase
      .from('users')
      .select('name, avatar_url, bio, linkedin_url, github_url, website_url, is_portfolio_public, username')
      .eq('id', actor.kind === 'learner' ? actor.userId : '')
      .maybeSingle()

    if (error) {
      throw new RouteError(500, 'SERVER_ERROR', 'Failed to fetch user profile.')
    }

    return NextResponse.json({ success: true, profile })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.profile.update',
    domain: 'api',
    summary: 'Unexpected failure updating learner profile settings',
    body: profileUpdateSchema,
  },
  async ({ actor, body }) => {
    const { name, avatar_url, bio, linkedin_url, github_url, website_url } = body

    if (avatar_url && !isValidAvatarUrl(avatar_url)) {
      throw new RouteError(400, 'VALIDATION_ERROR', "Avatar URL must be hosted on Prodily's secure avatar storage.")
    }

    const supabase = createServiceRoleClient()
    const { error } = await supabase
      .from('users')
      .update({
        name: typeof name === 'string' ? name.trim() : null,
        avatar_url: typeof avatar_url === 'string' && avatar_url.trim() ? avatar_url.trim() : null,
        bio: typeof bio === 'string' ? bio.trim() : null,
        linkedin_url: typeof linkedin_url === 'string' && linkedin_url.trim() ? linkedin_url.trim() : null,
        github_url: typeof github_url === 'string' && github_url.trim() ? github_url.trim() : null,
        website_url: typeof website_url === 'string' && website_url.trim() ? website_url.trim() : null,
      })
      .eq('id', actor.kind === 'learner' ? actor.userId : '')

    if (error) {
      // N-3: the driver error is logged, never returned. Before B7-F the outer
      // catch on this route sent `error.message` straight to an authenticated
      // learner, which can carry a connection string.
      void logSystemError({
        severity: 'error',
        category: 'db',
        operation: 'settings.profile.update',
        message: `Failed to update profile settings: ${error.message}`,
        userId: actor.kind === 'learner' ? actor.userId : undefined,
        details: { error: error.message },
      })
      throw new RouteError(400, 'SERVER_ERROR', 'Failed to update profile settings.')
    }

    // Name, avatar, bio and links show on the cached public portfolio, and name and avatar on the
    // cached weekly leaderboard. Both purges are best-effort and never fail the save.
    await revalidatePublicPortfolioForUser(supabase, actor.kind === 'learner' ? actor.userId : '')
    invalidateLeaderboardCache()

    return NextResponse.json({ success: true })
  }
)
