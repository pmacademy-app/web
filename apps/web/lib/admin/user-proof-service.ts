import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient, type Database } from '@/lib/supabase'
import type { FellowRequestRowStatus, FellowRequestUiState } from '@/lib/fellow'
import { loadProofStates } from '@/lib/growth/proof-state-db'
import { selectProofNextStep, type ProofNextStepKind, type ProofState } from '@/lib/growth/proof-state'
import { PROOF_NUDGE_KEYS, nudgeEventType, type ProofNudgeKey } from '@/lib/growth/proof-nudges'

/**
 * Proof state for one learner, for the admin user drawer (Admin R6 / C3).
 *
 * A separate loader so `AdminUserDetail` and `getUserDetailData` stay unchanged. Returns a plain
 * serializable object (safe to pass from a server component to a client one), or null when any
 * read fails or the user does not exist: the drawer then shows a local warning, never an error.
 *
 * Wording: Fellow is never called a certificate or credential. `selectProofNextStep` phrases the
 * "continue lessons" step for the learner ("toward your certificate"), so that one step gets an
 * admin phrasing here, and the curriculum-completion fields avoid the word too.
 */

const NUDGE_HOLDOUT_REASON = 'nudge_holdout'

export interface AdminUserProofSummary {
  userId: string
  portfolio: {
    isPublic: boolean
    /** Everything but visibility is done: publishing is the last step. */
    readyButPrivate: boolean
    readinessPercent: number
  }
  fellowState: FellowRequestUiState
  /** The most recent Fellow request, or null when the user never requested. */
  latestRequest: {
    status: FellowRequestRowStatus
    requestedAt: string | null
    reviewedAt: string | null
  } | null
  nextCapstone: { slug: string; title: string; href: string } | null
  lessons: { completed: number; total: number; curriculumComplete: boolean }
  nextStep: { kind: ProofNextStepKind; text: string; path: string }
  /** The latest proof-nudge event (sent, reminder or holdout), or null when there is none. */
  lastNudge: {
    key: ProofNudgeKey
    round: 'initial' | 'reminder'
    heldOut: boolean
    at: string
  } | null
}

type Client = SupabaseClient<Database>

interface NudgeRow {
  event_type: string
  skipped_reason: string | null
  created_at: string
}

interface RequestRow {
  status: string
  requested_at: string | null
  reviewed_at: string | null
}

const NUDGE_EVENT_TYPES = PROOF_NUDGE_KEYS.flatMap((key) => [nudgeEventType(key, 'initial'), nudgeEventType(key, 'reminder')])

function parseNudge(row: NudgeRow): AdminUserProofSummary['lastNudge'] {
  for (const key of PROOF_NUDGE_KEYS) {
    if (row.event_type === nudgeEventType(key, 'initial')) {
      return { key, round: 'initial', heldOut: row.skipped_reason === NUDGE_HOLDOUT_REASON, at: row.created_at }
    }
    if (row.event_type === nudgeEventType(key, 'reminder')) {
      return { key, round: 'reminder', heldOut: false, at: row.created_at }
    }
  }
  return null
}

function adminNextStep(state: ProofState): AdminUserProofSummary['nextStep'] {
  const step = selectProofNextStep(state)
  if (step.kind === 'continue_lessons') {
    const { completedLessons, totalLessons } = state.certificate
    return { ...step, text: `Continue lessons: ${completedLessons} of ${totalLessons} completed.` }
  }
  return { ...step }
}

/** Pure: builds the summary from loaded rows. Exported for tests. */
export function buildUserProofSummary(
  userId: string,
  state: ProofState,
  latestRequest: RequestRow | null,
  latestNudge: NudgeRow | null,
): AdminUserProofSummary {
  return {
    userId,
    portfolio: { ...state.portfolio },
    fellowState: state.fellowState,
    latestRequest: latestRequest
      ? {
          status: latestRequest.status as FellowRequestRowStatus,
          requestedAt: latestRequest.requested_at,
          reviewedAt: latestRequest.reviewed_at,
        }
      : null,
    nextCapstone: state.nextCapstone ? { ...state.nextCapstone } : null,
    lessons: {
      completed: state.certificate.completedLessons,
      total: state.certificate.totalLessons,
      curriculumComplete: state.certificate.earned,
    },
    nextStep: adminNextStep(state),
    lastNudge: latestNudge ? parseNudge(latestNudge) : null,
  }
}

export async function getUserProofSummary(
  userId: string,
  client?: Client,
): Promise<AdminUserProofSummary | null> {
  if (!userId) return null
  try {
    const supabase = client ?? createServiceRoleClient()
    const [states, request, nudge] = await Promise.all([
      loadProofStates(supabase, [userId]),
      supabase
        .from('fellow_requests')
        .select('status, requested_at, reviewed_at')
        .eq('user_id', userId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('notification_events')
        .select('event_type, skipped_reason, created_at')
        .eq('user_id', userId)
        .in('event_type', NUDGE_EVENT_TYPES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (!states || request.error || nudge.error) return null
    const state = states.get(userId)
    if (!state) return null
    return buildUserProofSummary(
      userId,
      state,
      (request.data as RequestRow | null) ?? null,
      (nudge.data as NudgeRow | null) ?? null,
    )
  } catch (error) {
    console.error('[admin] user proof summary failed', error instanceof Error ? error.message : error)
    return null
  }
}
