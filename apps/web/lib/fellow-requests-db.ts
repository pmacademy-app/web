/**
 * PM Fellow Request — user-facing database operations.
 *
 * Reuses existing portfolio data-fetching (getPortfolioSettings, getLearnerSubmittedCapstones)
 * and the existing portfolio-readiness calculator instead of introducing a parallel
 * eligibility data model.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { getPortfolioSettings, getLearnerSubmittedCapstones } from '@/lib/portfolio-db'
import { calculatePortfolioReadiness, type PortfolioReadinessSummary } from '@/lib/portfolio-readiness'
import { deriveFellowRequestState, type FellowRequestRowStatus, type FellowRequestUiState } from '@/lib/fellow'
import { PublicError } from '@/lib/errors/public-error'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface FellowRequestRecord {
  id: string
  userId: string
  status: FellowRequestRowStatus
  requestedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejectionReason: string | null
}

export interface FellowRequestStatusPayload {
  state: FellowRequestUiState
  canSubmit: boolean
  isEligible: boolean
  readiness: PortfolioReadinessSummary
  latestRequest: FellowRequestRecord | null
}

interface FellowRequestRow {
  id: string
  user_id: string
  status: string
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
}

function mapRow(row: FellowRequestRow): FellowRequestRecord {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status as FellowRequestRowStatus,
    requestedAt: row.requested_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
  }
}

/**
 * Computes the requesting user's current Fellow eligibility + request status.
 * Reuses the exact same portfolio data the Settings > Portfolio readiness card
 * already fetches — no duplicate queries.
 */
export async function getUserFellowState(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<FellowRequestStatusPayload> {
  const [settings, capstones, userRow, latestRequestRes] = await Promise.all([
    getPortfolioSettings(supabase, userId),
    getLearnerSubmittedCapstones(supabase, userId),
    (supabase.from('users') as unknown as DBChain)
      .select('is_fellow')
      .eq('id', userId)
      .maybeSingle() as unknown as Promise<{ data: { is_fellow: boolean } | null }>,
    (supabase.from('fellow_requests') as unknown as DBChain)
      .select('*')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: FellowRequestRow | null }>,
  ])

  const publicCapstonesCount = capstones.filter((c) => c.isPublic).length
  const readiness = calculatePortfolioReadiness({
    name: settings.name,
    username: settings.username,
    bio: settings.bio,
    avatarUrl: settings.avatarUrl,
    linkedinUrl: settings.linkedinUrl,
    githubUrl: settings.githubUrl,
    websiteUrl: settings.websiteUrl,
    isPortfolioPublic: settings.isPortfolioPublic,
    publicCapstonesCount,
  })

  const isFellow = Boolean(userRow.data?.is_fellow)
  const latestRequest = latestRequestRes.data ? mapRow(latestRequestRes.data) : null

  const { state, canSubmit, isEligible } = deriveFellowRequestState({
    isFellow,
    readiness,
    latestRequestStatus: latestRequest?.status ?? null,
  })

  return { state, canSubmit, isEligible, readiness, latestRequest }
}

/**
 * Submits a new Fellow request after re-verifying eligibility server-side.
 * Duplicate active requests are also prevented at the DB level via a partial
 * unique index on (user_id) WHERE status = 'pending'.
 */
export async function submitFellowRequest(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ success: true; request: FellowRequestRecord }> {
  const current = await getUserFellowState(supabase, userId)

  if (!current.canSubmit) {
    if (current.state === 'pending') {
      throw new PublicError('You already have a pending Fellow request.', { status: 409, code: 'ALREADY_PENDING' })
    }
    if (current.state === 'approved') {
      throw new PublicError('You already have Fellow status.', { status: 409, code: 'ALREADY_FELLOW' })
    }
    throw new PublicError('Your portfolio does not yet meet all Fellow eligibility requirements.', { status: 403, code: 'NOT_ELIGIBLE' })
  }

  const { data, error } = (await (supabase.from('fellow_requests') as unknown as DBChain)
    .insert({ user_id: userId, status: 'pending' })
    .select('*')
    .single()) as unknown as { data: FellowRequestRow | null; error: { message?: string; code?: string } | null }

  if (error || !data) {
    // Postgres unique_violation code, or a duplicate-key message from the partial unique index.
    if (error?.code === '23505' || /duplicate/i.test(error?.message || '')) {
      throw new PublicError('You already have a pending Fellow request.', { status: 409, code: 'ALREADY_PENDING' })
    }
    // The driver message is logged, never published: before B7-E it was rethrown
    // and the route sent it verbatim to the learner, which is the N-3 pattern.
    console.error('[fellow-requests-db] Error inserting Fellow request:', error)
    throw new PublicError('Failed to submit Fellow request.', { status: 400, code: 'SUBMIT_FAILED' })
  }

  return { success: true, request: mapRow(data) }
}
