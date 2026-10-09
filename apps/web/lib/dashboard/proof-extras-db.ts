import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { getUserBadgesData } from '@/lib/badges-db'
import { getUserFellowState } from '@/lib/fellow-requests-db'
import { summarizeBadges, summarizeFellow, type BadgeSummary, type FellowSummary } from './proof-extras'

/**
 * Server loaders for the dashboard proof card's extra row. Each resolves to null on any
 * failure, so the dashboard can start them in its Promise.all without a try/catch and the
 * card simply hides the cell.
 */

/**
 * Earned-badge count and latest badge, from the same function the /badges page uses. That page
 * counts a badge whose criteria are met even before its award row exists, so a lighter
 * user_badges count would disagree with it.
 */
export async function loadBadgeSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<BadgeSummary | null> {
  try {
    return summarizeBadges(await getUserBadgesData(supabase, userId))
  } catch {
    return null
  }
}

/** The same Fellow state Settings → Portfolio shows, reduced to what the card needs. */
export async function loadFellowSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<FellowSummary | null> {
  try {
    const payload = await getUserFellowState(supabase, userId)
    return summarizeFellow(payload)
  } catch {
    return null
  }
}
