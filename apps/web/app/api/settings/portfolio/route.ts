import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { revalidateCapstoneOgCards, revalidatePortfolioOgCard } from '@/lib/og/revalidate-capstone-cards'
import { revalidatePublicPortfolio } from '@/lib/portfolio-revalidate'
import { invalidateLeaderboardCache } from '@/lib/leaderboard-db'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { portfolioSettingsUpdateSchema } from '@/lib/api/contracts/settings'
import type { PortfolioSettingsData } from '@/lib/portfolio-db'
import {
  getPortfolioSettings,
  updatePortfolioSettings,
  getLearnerSubmittedCapstones,
  PortfolioValidationError,
} from '@/lib/portfolio-db'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.portfolio.read',
    domain: 'api',
    summary: 'Unexpected failure reading portfolio settings',
  },
  async ({ actor }) => {
    const userId = requireUserId(actor)

    const supabase = createServiceRoleClient()
    const [settings, submittedCapstones] = await Promise.all([
      getPortfolioSettings(supabase, userId),
      getLearnerSubmittedCapstones(supabase, userId),
    ])

    return NextResponse.json({ success: true, settings, submittedCapstones })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.portfolio.update',
    domain: 'api',
    summary: 'Unexpected failure updating portfolio settings',
    // Strict: only the form's own fields. Malformed JSON is now a 400 instead of a
    // 500 incident. The data layer keeps the username and URL rules and their copy.
    body: portfolioSettingsUpdateSchema,
  },
  async ({ actor, body }) => {
    const userId = requireUserId(actor)

    try {
      const supabase = createServiceRoleClient()
      // The schema accepts any short section id; updatePortfolioSettings keeps only
      // the known ones, so the narrower type is restored there, not trusted here.
      const result = await updatePortfolioSettings(supabase, userId, body as PortfolioSettingsData)

      // The public pages and cards are cached per handle. On a username change the old handle's
      // pages and cards would otherwise keep the learner's name and capstones until they expire,
      // and a visibility change must take effect on the next request, so purge both handles.
      for (const handle of new Set([result.previousUsername, result.settings.username])) {
        if (!handle) continue
        revalidatePublicPortfolio(handle)
        revalidatePortfolioOgCard(handle)
        revalidateCapstoneOgCards(handle)
      }
      // The weekly leaderboard shows the name, username and avatar saved here.
      invalidateLeaderboardCache()
      revalidatePath('/settings')

      return NextResponse.json({ success: true, settings: result.settings })
    } catch (error: unknown) {
      // A learner-fixable rejection keeps its exact message at 400. Anything else
      // is an unexpected fault and is rethrown so the wrapper genericises it —
      // before B7-F both cases returned error.message, so a driver error could
      // reach a learner (N-3).
      if (error instanceof PortfolioValidationError) {
        throw new RouteError(400, 'VALIDATION', error.message)
      }
      throw error
    }
  }
)
