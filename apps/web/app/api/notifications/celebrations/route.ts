import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import type { AchievementCelebrationClaimResponse } from '@/lib/api/contracts/achievement-celebration'
import { createServiceRoleClient } from '@/lib/supabase'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'
import { claimNextAchievementCelebration } from '@/lib/notifications/in-app/achievement-celebrations'

/**
 * POST /api/notifications/celebrations
 *
 * Claims the calling learner's next unseen achievement (Fellow grant, certificate,
 * published capstone, completed module) so the client can show its celebration exactly once. The claim
 * marks that achievement's in-app notification read with a compare-and-set, so when
 * several tabs or devices ask at the same moment only one receives it.
 *
 * POST rather than GET because a successful call writes. It is safe to retry: a repeat
 * returns the next unclaimed achievement or `celebration: null`, never the same one twice.
 *
 * The body is ignored on purpose. The actor decides *whose* achievements are considered —
 * the id comes from `requireUserId(actor)` and from nowhere else — and the server decides
 * *which* one, so there is nothing for a caller to supply.
 *
 * `ACHIEVEMENT_CELEBRATIONS_ENABLED` is the kill switch. Off means a null celebration
 * and no database access at all, so the notifications stay unread in the bell.
 */
export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'notifications.celebrations.claim',
    summary: 'Unexpected failure claiming an achievement celebration',
    errorMessage: 'Failed to check for achievement celebrations',
  },
  async ({ actor }) => {
    const userId = requireUserId(actor)

    const enabled = await globalFeatureFlagService.isEnabledAsync('ACHIEVEMENT_CELEBRATIONS_ENABLED', true)
    if (!enabled) {
      const disabled: AchievementCelebrationClaimResponse = { success: true, celebration: null }
      return NextResponse.json(disabled)
    }

    const celebration = await claimNextAchievementCelebration(createServiceRoleClient(), userId)
    const claimed: AchievementCelebrationClaimResponse = { success: true, celebration }
    return NextResponse.json(claimed)
  }
)
