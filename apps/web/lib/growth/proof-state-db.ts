import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import type { FellowRequestRowStatus } from '@/lib/fellow'
import { deriveProofState, type ProofState, type ProofUserRow } from './proof-state'

/**
 * Batch loader for proof state (Growth R5 / B1), for the scheduled jobs (nudges, weekly recap,
 * lifecycle). A fixed five queries per call, whatever the number of learners: callers page their
 * learner list (`PROOF_STATE_BATCH_SIZE`) and call this once per page.
 *
 * A failed read fails the whole call (returns null): a partial picture could tell a learner to
 * do something they already did, so the job should skip the page and retry later.
 */

export const PROOF_STATE_BATCH_SIZE = 200

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

type Rows<T> = Promise<{ data: T[] | null; error: unknown }>

export async function loadProofStates(
  supabase: SupabaseClient<Database>,
  userIds: readonly string[],
): Promise<Map<string, ProofState> | null> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Map()
  if (ids.length > PROOF_STATE_BATCH_SIZE) {
    throw new Error(`loadProofStates takes at most ${PROOF_STATE_BATCH_SIZE} users per call`)
  }

  const from = (table: string) => supabase.from(table as never) as unknown as DBChain

  const [users, capstones, requests, progress, certificates] = await Promise.all([
    from('users')
      .select('id, username, name, bio, avatar_url, linkedin_url, github_url, website_url, is_portfolio_public, is_fellow')
      .in('id', ids) as unknown as Rows<ProofUserRow & { id: string }>,
    from('capstone_submissions').select('user_id, module_slug, status, is_public').in('user_id', ids) as unknown as Rows<{
      user_id: string
      module_slug: string
      status: string
      is_public: boolean | null
    }>,
    from('fellow_requests')
      .select('user_id, status, requested_at')
      .in('user_id', ids)
      .order('requested_at', { ascending: false }) as unknown as Rows<{ user_id: string; status: string }>,
    from('user_lesson_progress')
      .select('user_id, lesson_id')
      .in('user_id', ids)
      .eq('status', 'completed') as unknown as Rows<{ user_id: string; lesson_id: string }>,
    // Admin TEST- certificates are not credentials.
    from('certificates')
      .select('user_id')
      .in('user_id', ids)
      .eq('type', 'full_curriculum')
      .not('certificate_code', 'like', 'TEST-%') as unknown as Rows<{ user_id: string }>,
  ])
  if (users.error || capstones.error || requests.error || progress.error || certificates.error) return null

  const group = <T extends { user_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T[]>()
    for (const row of rows ?? []) map.set(row.user_id, [...(map.get(row.user_id) ?? []), row])
    return map
  }
  const capstonesByUser = group(capstones.data)
  const progressByUser = group(progress.data)
  const certified = new Set((certificates.data ?? []).map((row) => row.user_id))
  // Newest first from the query, so the first row seen per user is their latest request.
  const latestRequest = new Map<string, FellowRequestRowStatus>()
  for (const row of requests.data ?? []) {
    if (!latestRequest.has(row.user_id)) latestRequest.set(row.user_id, row.status as FellowRequestRowStatus)
  }

  const states = new Map<string, ProofState>()
  for (const user of users.data ?? []) {
    states.set(
      user.id,
      deriveProofState({
        userId: user.id,
        user,
        capstones: capstonesByUser.get(user.id) ?? [],
        latestFellowRequestStatus: latestRequest.get(user.id) ?? null,
        completedLessonIds: (progressByUser.get(user.id) ?? []).map((row) => row.lesson_id),
        hasFullCurriculumCertificate: certified.has(user.id),
      }),
    )
  }
  return states
}
