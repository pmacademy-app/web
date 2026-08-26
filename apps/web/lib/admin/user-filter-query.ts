/**
 * Shared server-side user filtering layer.
 *
 * Used by both the Users workspace and the Email Broadcast system so that
 * recipient counts shown before sending exactly match the users targeted
 * during broadcast execution.
 *
 * Strategy: build intersecting Sets of matching user IDs from independent
 * sub-queries, then apply the intersection as `.in('id', [...])` to the
 * primary `public.users` query. This avoids N+1 queries and complex joins
 * across tables with differing row-level security models.
 *
 * All queries use the service-role client — this module is server-only.
 */

import { createServiceRoleClient } from '@/lib/supabase'
import type { AdminUserFilters } from './types'

export type { AdminUserFilters }

/** Result returned by `queryUserIds` and `countMatchingUsers`. */
export interface UserFilterResult {
  /** Ordered user IDs that match all filters. */
  userIds: string[]
  /** Total count of matching users (before pagination). */
  total: number
}

/** Result for a paginated user query (IDs for this page only). */
export interface PagedUserFilterResult extends UserFilterResult {
  page: number
  pageSize: number
  totalPages: number
}

/* ─── Internal helpers ─────────────────────────────────────────────────── */

type SupabaseClient = ReturnType<typeof createServiceRoleClient>

/**
 * Returns the Set of verified user IDs from auth.users.
 * auth.admin.listUsers paginates at 1000 — loop until exhausted.
 */
async function fetchVerifiedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const verified = new Set<string>()
  let page = 1
  const perPage = 1000
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error || !data?.users?.length) break
      for (const u of data.users) {
        if (u.email_confirmed_at) verified.add(u.id)
      }
      if (data.users.length < perPage) break
      page++
    } catch {
      break
    }
  }
  return verified
}

/**
 * Returns user IDs with XP activity within the given date range.
 * `from` and `to` are ISO timestamps or undefined.
 */
async function fetchActiveUserIds(
  supabase: SupabaseClient,
  from?: string,
  to?: string
): Promise<Set<string>> {
  try {
    let q = supabase.from('xp_events').select('user_id')
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    const { data } = await q
    return new Set(((data || []) as Array<{ user_id: string }>).map((r) => r.user_id))
  } catch {
    return new Set()
  }
}

/**
 * Returns user IDs that have at least one completed lesson (`status = 'completed'`).
 */
async function fetchUsersWithProgress(supabase: SupabaseClient): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('user_lesson_progress')
      .select('user_id')
      .eq('status', 'completed')
    return new Set(((data || []) as Array<{ user_id: string }>).map((r) => r.user_id))
  } catch {
    return new Set()
  }
}

/**
 * Returns user IDs with the `cpo_completion` badge (100% progress).
 */
async function fetchCompletedUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  try {
    const { data: badgeRows } = await supabase
      .from('badges')
      .select('id')
      .eq('key', 'cpo_completion')
    const badgeIds = ((badgeRows || []) as Array<{ id: string }>).map((b) => b.id)
    if (badgeIds.length === 0) return new Set()
    const { data } = await supabase
      .from('user_badges')
      .select('user_id')
      .in('badge_id', badgeIds)
    return new Set(((data || []) as Array<{ user_id: string }>).map((r) => r.user_id))
  } catch {
    return new Set()
  }
}

/**
 * Returns user IDs who opted in to marketing emails.
 */
async function fetchMarketingOptInIds(supabase: SupabaseClient): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('user_notification_preferences')
      .select('user_id')
      .eq('marketing_email', true)
    return new Set(((data || []) as Array<{ user_id: string }>).map((r) => r.user_id))
  } catch {
    return new Set()
  }
}

/**
 * Returns user IDs who have received (delivered) a specific email template.
 */
async function fetchUsersReceivedTemplate(
  supabase: SupabaseClient,
  templateKey: string
): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('email_queue')
      .select('user_id')
      .eq('template_key', templateKey)
      .eq('status', 'delivered')
    return new Set(((data || []) as Array<{ user_id: string }>).map((r) => r.user_id))
  } catch {
    return new Set()
  }
}

/**
 * Returns user IDs who received email from a specific broadcast.
 */
async function fetchUsersReceivedBroadcast(
  supabase: SupabaseClient,
  broadcastId: string
): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('email_queue')
      .select('user_id')
      .eq('broadcast_id', broadcastId)
      .in('status', ['delivered', 'pending', 'processing'])
    return new Set(((data || []) as Array<{ user_id: string }>).map((r) => r.user_id))
  } catch {
    return new Set()
  }
}

/** Intersects two Sets; returns the smaller if one is a universe (undefined = all). */
function intersect(a: Set<string> | null, b: Set<string> | null): Set<string> | null {
  if (a === null) return b
  if (b === null) return a
  const result = new Set<string>()
  // Iterate the smaller set
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
  for (const id of smaller) {
    if (larger.has(id)) result.add(id)
  }
  return result
}

/** Returns `true` when the date string is valid YYYY-MM-DD. */
function validDate(d: string | undefined): boolean {
  if (!d) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
}

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Builds the complete set of sub-query constraints from filters and applies
 * them to a `public.users` select query, returning the full matching set of
 * user IDs and the total count.
 *
 * This function is the single source of truth for user targeting — it is used
 * by both `getUsersOverview` (Users workspace) and broadcast execution so that
 * the preview count exactly matches the production send list.
 */
export async function resolveFilteredUserIds(
  filters: AdminUserFilters,
  supabaseClient?: SupabaseClient
): Promise<{ ids: Set<string> | null; error?: string }> {
  const supabase = supabaseClient ?? createServiceRoleClient()

  // Collect include/exclude constraint sets in parallel where possible
  const tasks: Array<Promise<void>> = []
  // `null` means "no constraint from this source" (all users pass)
  let constraintIds: Set<string> | null = null
  let excludeIds: Set<string> = new Set()

  // --- Verification ---
  if (filters.verification) {
    tasks.push(
      fetchVerifiedUserIds(supabase).then((verifiedIds) => {
        const constraint =
          filters.verification === 'verified'
            ? verifiedIds
            : // unverified = all users minus verified
              null // handled as exclude below
        if (filters.verification === 'verified') {
          constraintIds = intersect(constraintIds, verifiedIds)
        } else {
          // Will subtract verified from final result
          for (const id of verifiedIds) excludeIds.add(id)
        }
      })
    )
  }

  // --- Activity (legacy 'active'/'inactive' + new activeLastDays / inactiveLastDays) ---
  const activityDays =
    filters.activeLastDays ??
    (filters.activity === 'active' ? 30 : undefined)
  const inactivityDays =
    filters.inactiveLastDays ??
    (filters.activity === 'inactive' ? 30 : undefined)

  if (activityDays !== undefined) {
    const from = new Date(Date.now() - activityDays * 24 * 60 * 60 * 1000).toISOString()
    tasks.push(
      fetchActiveUserIds(supabase, from).then((ids) => {
        constraintIds = intersect(constraintIds, ids)
      })
    )
  } else if (inactivityDays !== undefined) {
    const cutoff = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000).toISOString()
    // Inactive = had XP activity at some point, but NOT after the cutoff
    tasks.push(
      Promise.all([
        fetchActiveUserIds(supabase, undefined, cutoff), // had activity before cutoff
        fetchActiveUserIds(supabase, cutoff),            // active after cutoff (to exclude)
      ]).then(([hadActivity, recentlyActive]) => {
        // Users with prior activity but not recent activity
        const inactive = new Set<string>()
        for (const id of hadActivity) {
          if (!recentlyActive.has(id)) inactive.add(id)
        }
        constraintIds = intersect(constraintIds, inactive)
      })
    )
  }

  // --- Activity date range ---
  if (filters.activeFrom || filters.activeTo) {
    const from = validDate(filters.activeFrom)
      ? `${filters.activeFrom}T00:00:00.000Z`
      : undefined
    const to = validDate(filters.activeTo)
      ? `${filters.activeTo}T23:59:59.999Z`
      : undefined
    tasks.push(
      fetchActiveUserIds(supabase, from, to).then((ids) => {
        constraintIds = intersect(constraintIds, ids)
      })
    )
  }

  // --- Progress ---
  if (filters.progress) {
    tasks.push(
      (async () => {
        if (filters.progress === 'none') {
          const withProgress = await fetchUsersWithProgress(supabase)
          for (const id of withProgress) excludeIds.add(id)
        } else if (filters.progress === 'started') {
          const [withProgress, completed] = await Promise.all([
            fetchUsersWithProgress(supabase),
            fetchCompletedUserIds(supabase),
          ])
          const started = new Set<string>()
          for (const id of withProgress) {
            if (!completed.has(id)) started.add(id)
          }
          constraintIds = intersect(constraintIds, started)
        } else if (filters.progress === 'completed') {
          const completed = await fetchCompletedUserIds(supabase)
          constraintIds = intersect(constraintIds, completed)
        }
      })()
    )
  }

  // --- Onboarding status ---
  if (filters.onboardingStatus) {
    // Applied directly on users table (no sub-query needed — handled in main query)
  }

  // --- Marketing email opt-in ---
  if (filters.marketingEmailOptIn === true) {
    tasks.push(
      fetchMarketingOptInIds(supabase).then((ids) => {
        constraintIds = intersect(constraintIds, ids)
      })
    )
  }

  // --- Email template exclusion / inclusion ---
  if (filters.excludeIfReceivedTemplate) {
    tasks.push(
      fetchUsersReceivedTemplate(supabase, filters.excludeIfReceivedTemplate).then((ids) => {
        for (const id of ids) excludeIds.add(id)
      })
    )
  }
  if (filters.onlyIfReceivedTemplate) {
    tasks.push(
      fetchUsersReceivedTemplate(supabase, filters.onlyIfReceivedTemplate).then((ids) => {
        constraintIds = intersect(constraintIds, ids)
      })
    )
  }

  // --- Broadcast exclusion ---
  if (filters.excludeBroadcastId) {
    tasks.push(
      fetchUsersReceivedBroadcast(supabase, filters.excludeBroadcastId).then((ids) => {
        for (const id of ids) excludeIds.add(id)
      })
    )
  }

  // Wait for all sub-queries
  await Promise.all(tasks)

  // Apply exclude set to constraint set
  if (excludeIds.size > 0) {
    if (constraintIds === null) {
      // Universe is all public.users — fetch their IDs and subtract excludeIds
      try {
        const { data: allUsers } = await supabase.from('users').select('id')
        constraintIds = new Set(((allUsers || []) as Array<{ id: string }>).map((u) => String(u.id)))
      } catch {
        constraintIds = new Set()
      }
    }
    for (const id of excludeIds) constraintIds.delete(id)
  }

  return { ids: constraintIds }
}

/**
 * Applies all filters to the `public.users` table and returns a paginated
 * result of user IDs + total count.
 *
 * This is the single entry point called by both the Users workspace
 * (`getUsersOverview`) and broadcast execution.
 */
export async function applyUserFilters(
  filters: AdminUserFilters,
  options: {
    page?: number
    pageSize?: number
    supabaseClient?: SupabaseClient
  } = {}
): Promise<PagedUserFilterResult> {
  const supabase = options.supabaseClient ?? createServiceRoleClient()
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(200, Math.max(10, options.pageSize ?? 25))
  const offset = (page - 1) * pageSize

  // Resolve sub-query constraint IDs in parallel
  const { ids: constraintIds } = await resolveFilteredUserIds(filters, supabase)

  // Build main users query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from('users') as any).select('id', { count: 'exact' })

  // ID set constraint (from sub-queries)
  if (constraintIds !== null) {
    if (constraintIds.size === 0) {
      // No users match — short-circuit
      return { userIds: [], total: 0, page, pageSize, totalPages: 1 }
    }
    query = query.in('id', [...constraintIds])
  }

  // Direct column filters (efficient — applied on DB)
  if (filters.role) {
    query = query.eq('is_admin', filters.role === 'admin')
  }
  if (filters.minLevel !== undefined) {
    query = query.gte('level', filters.minLevel)
  }
  if (filters.joinedFrom && validDate(filters.joinedFrom)) {
    query = query.gte('created_at', `${filters.joinedFrom}T00:00:00.000Z`)
  }
  if (filters.joinedTo && validDate(filters.joinedTo)) {
    query = query.lte('created_at', `${filters.joinedTo}T23:59:59.999Z`)
  }
  if (filters.onboardingStatus) {
    query = query.eq('onboarding_completed', filters.onboardingStatus === 'completed')
  }
  // Experience level (career_role stores the onboarding ID, e.g. 'beginner')
  if (filters.experienceLevels && filters.experienceLevels.length > 0) {
    query = query.in('career_role', filters.experienceLevels)
  }
  // Goal (goal stores the onboarding ID, e.g. 'become_pm')
  if (filters.goals && filters.goals.length > 0) {
    query = query.in('goal', filters.goals)
  }
  // Topics (onboarding_topics is a text[] column — use overlap operator)
  if (filters.topics && filters.topics.length > 0) {
    // Supabase PostgREST: .overlaps('column', array) maps to @> operator
    query = query.overlaps('onboarding_topics', filters.topics)
  }
  // Learning preference
  if (filters.learningPreference) {
    query = query.eq('onboarding_preference', filters.learningPreference)
  }

  // Sort
  const sortColMap: Record<string, string> = {
    createdAt: 'created_at',
    totalXp: 'total_xp',
    level: 'level',
    streakDays: 'current_streak',
  }
  const sortCol = sortColMap[filters.sort ?? 'createdAt'] ?? 'created_at'
  query = query.order(sortCol, { ascending: filters.sortDir === 'asc' }).order('id', { ascending: true })

  // Pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data, count, error } = await query
  if (error) {
    console.error('[user-filter-query] applyUserFilters error:', error)
    return { userIds: [], total: 0, page, pageSize, totalPages: 1 }
  }

  const rows = (data || []) as Array<{ id: string }>
  const total = count ?? rows.length

  return {
    userIds: rows.map((r) => String(r.id)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Returns the total count of users matching all filters.
 * Used for broadcast recipient preview ("Estimated recipients: 1,248").
 * Calls the same logic as the actual broadcast execution.
 */
export async function countMatchingUsers(
  filters: AdminUserFilters,
  supabaseClient?: SupabaseClient
): Promise<number> {
  const result = await applyUserFilters(filters, { page: 1, pageSize: 1, supabaseClient })
  return result.total
}

/**
 * Returns a sample of matching users for preview (first N users, name + email).
 */
export async function sampleMatchingUsers(
  filters: AdminUserFilters,
  limit = 50,
  supabaseClient?: SupabaseClient
): Promise<Array<{ id: string; name: string | null; email: string; career_role: string | null; goal: string | null; onboarding_completed: boolean }>> {
  const supabase = supabaseClient ?? createServiceRoleClient()
  const { ids: constraintIds } = await resolveFilteredUserIds(filters, supabase)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from('users') as any).select(
    'id, name, email, career_role, goal, onboarding_completed'
  )

  if (constraintIds !== null) {
    if (constraintIds.size === 0) return []
    query = query.in('id', [...constraintIds])
  }
  if (filters.role) query = query.eq('is_admin', filters.role === 'admin')
  if (filters.minLevel !== undefined) query = query.gte('level', filters.minLevel)
  if (filters.joinedFrom && validDate(filters.joinedFrom)) query = query.gte('created_at', `${filters.joinedFrom}T00:00:00.000Z`)
  if (filters.joinedTo && validDate(filters.joinedTo)) query = query.lte('created_at', `${filters.joinedTo}T23:59:59.999Z`)
  if (filters.onboardingStatus) query = query.eq('onboarding_completed', filters.onboardingStatus === 'completed')
  if (filters.experienceLevels?.length) query = query.in('career_role', filters.experienceLevels)
  if (filters.goals?.length) query = query.in('goal', filters.goals)
  if (filters.topics?.length) query = query.overlaps('onboarding_topics', filters.topics)
  if (filters.learningPreference) query = query.eq('onboarding_preference', filters.learningPreference)

  query = query.order('created_at', { ascending: false }).limit(limit)

  const { data } = await query
  return (data || []) as Array<{ id: string; name: string | null; email: string; career_role: string | null; goal: string | null; onboarding_completed: boolean }>
}
