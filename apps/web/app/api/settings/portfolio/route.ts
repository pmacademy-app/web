import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
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
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)

    try {
      const supabase = createServiceRoleClient()
      const body = await request.json()
      const result = await updatePortfolioSettings(supabase, userId, body)

      if (result.settings.username) {
        revalidatePath(`/p/${result.settings.username}`)
        revalidatePath(`/api/og/portfolio/${result.settings.username}`)
      }
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
      console.error('[API POST /api/settings/portfolio] Error:', error)
      throw error
    }
  }
)
