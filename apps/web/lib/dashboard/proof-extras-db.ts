import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import type { Selected } from '@/lib/db'
import { getUserBadgesData } from '@/lib/badges-db'
import { deriveFellowRequestState, type FellowRequestRowStatus } from '@/lib/fellow'
import { calculatePortfolioReadiness } from '@/lib/portfolio-readiness'
import { portfolioReadinessInputFromUserRow } from '@/lib/portfolio-db'
import {
  summarizeBadges,
  summarizeFellow,
  summarizeLevel,
  type BadgeSummary,
  type FellowSummary,
  type ProofExtras,
} from './proof-extras'

type UserRow = Database['public']['Tables']['users']['Row']

/**
 * Reads the dashboard page has already started. They are shared, never re-issued: each one is a
 * real Promise (a Supabase builder re-runs its request every time it is awaited), so the page and
 * this loader await the same request.
 */
export interface SharedDashboardReads {
  profile: Promise<UserRow | null>
  progressRows: Promise<Selected<'user_lesson_progress', 'lesson_id' | 'status' | 'quiz_score' | 'quiz_attempts'>[]>
  capstoneRows: Promise<Selected<'capstone_submissions', 'id' | 'module_slug' | 'status' | 'is_public'>[]>
}

/** Same rule as getLearnerSubmittedCapstones: submitted or reviewed, and public. */
const countPublicSubmittedCapstones = (rows: Awaited<SharedDashboardReads['capstoneRows']>) =>
  rows.filter((row) => (row.status === 'submitted' || row.status === 'reviewed') && row.is_public === true).length

/**
 * The Fellow state Settings → Portfolio shows, from the profile row the page already holds. Only
 * the latest fellow_requests row is read here. Readiness uses the same column mapping as
 * getPortfolioSettings (portfolioReadinessInputFromUserRow).
 */
async function fellowSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  profile: UserRow,
  capstoneRows: Awaited<SharedDashboardReads['capstoneRows']>,
): Promise<FellowSummary | null> {
  const { data, error } = await supabase
    .from('fellow_requests')
    .select('status')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null

  const readiness = calculatePortfolioReadiness(
    portfolioReadinessInputFromUserRow(profile, userId, countPublicSubmittedCapstones(capstoneRows)),
  )
  const { state } = deriveFellowRequestState({
    isFellow: profile.is_fellow === true,
    readiness,
    latestRequestStatus: (data?.status as FellowRequestRowStatus | undefined) ?? null,
  })
  return summarizeFellow({ state, readiness })
}

/** The /badges summary, fed the rows the page already loaded (only badges + user_badges are read). */
async function badgeSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  profile: UserRow,
  progressRows: Awaited<SharedDashboardReads['progressRows']>,
  capstoneRows: Awaited<SharedDashboardReads['capstoneRows']>,
): Promise<BadgeSummary | null> {
  const payload = await getUserBadgesData(supabase, userId, { user: profile, progressRows, capstoneRows })
  return summarizeBadges(payload)
}

/**
 * Everything the proof card's lower row needs. Each cell is independent: a failure resolves that
 * cell to null (hidden) and never rejects the whole row. A missing profile (first visit, before
 * the page creates it) hides the Fellow and badge cells for that one load.
 */
export async function loadProofExtras(
  supabase: SupabaseClient<Database>,
  userId: string,
  shared: SharedDashboardReads,
): Promise<ProofExtras> {
  const settle = <T>(promise: Promise<T | null>) => promise.catch(() => null)

  const [profile, progressRows, capstoneRows] = await Promise.all([
    settle(shared.profile),
    settle(shared.progressRows),
    settle(shared.capstoneRows),
  ])
  if (!profile || !progressRows || !capstoneRows) {
    return { fellow: null, badges: null, level: profile ? summarizeLevel(profile.total_xp) : null }
  }

  const [fellow, badges] = await Promise.all([
    settle(fellowSummary(supabase, userId, profile, capstoneRows)),
    settle(badgeSummary(supabase, userId, profile, progressRows, capstoneRows)),
  ])
  return { fellow, badges, level: summarizeLevel(profile.total_xp) }
}
