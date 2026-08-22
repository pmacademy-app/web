import { createServiceRoleClient } from '../supabase'
import { globalFeatureFlagService } from '../notifications/feature-flags/service'
import { fetchCurriculumData } from '../lesson-loader'
import { getCapstoneDefinition } from '@/config/capstones'
import {
  buildModuleProgress,
  buildUserActivityTimeline,
  clampPct,
  computeProgressPct,
  computeQuizAvgScore,
  TOTAL_LESSONS,
} from './users-aggregation'
import type {
  AdminSystemHealth,
  AdminUserOverview,
  AdminUserDetail,
  AdminUserFilters,
  AdminUserListResult,
  AdminContentOverview,
  AdminEmailQueueOverview,
} from './types'
import type { CurriculumEntry } from '@/types'

/** Live counts surfaced to the console shell (sidebar badges + header status). */
export interface AdminConsoleShellContext {
  attention: {
    contactMessages: number
    pendingTestimonials: number
    systemErrors: number
    failedEmails: number
    pendingCapstones: number
    newFeedback: number
  }
  /** Total actionable items across all attention sources. */
  attentionTotal: number
  /** Whether the database is reachable (drives the header status chip). */
  systemOnline: boolean
  databaseLatencyMs: number | null
}

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown; count?: number | null }>
}

export class AdminConsoleService {
  /**
   * Evaluates overall system health, DB latency, and queue latency.
   */
  public static async getSystemHealth(): Promise<AdminSystemHealth> {
    const supabase = createServiceRoleClient()
    const startTime = Date.now()
    const { error } = await supabase.from('users').select('id').limit(1)
    const latency = Date.now() - startTime

    // Fetch queue statistics
    let pendingQueueCount = 0
    let failedCount24h = 0
    try {
      const { count: pendingCount } = await supabase
        .from('email_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      pendingQueueCount = pendingCount || 0

      const { count: failedCount } = await supabase
        .from('email_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
      failedCount24h = failedCount || 0
    } catch {
      // Graceful fallback if queue tables aren't queryable
    }

    return {
      status: error ? 'degraded' : 'healthy',
      databaseLatencyMs: latency,
      activeCronJobsCount: 0,
      queuePendingItemsCount: pendingQueueCount,
      failedNotifications24h: failedCount24h,
      lastCheckedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      nextVersion: 'Next.js 16.2.12 (Turbopack)',
    }
  }

  /**
   * Fetches the live counts the console shell needs for the sidebar attention
   * badges and the header system-status chip. Runs once per layout render.
   */
  public static async getConsoleShellContext(): Promise<AdminConsoleShellContext> {
    const supabase = createServiceRoleClient()

    const startTime = Date.now()
    const { error } = await supabase.from('users').select('id').limit(1)
    const latency = Date.now() - startTime

    const [contactMessages, pendingTestimonials, systemErrors, failedEmails, pendingCapstones, newFeedback] =
      await Promise.all([
        supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('testimonials').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('system_errors').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase.from('user_feedback').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      ])

    const attention = {
      contactMessages: contactMessages.count || 0,
      pendingTestimonials: pendingTestimonials.count || 0,
      systemErrors: systemErrors.count || 0,
      failedEmails: failedEmails.count || 0,
      pendingCapstones: pendingCapstones.count || 0,
      newFeedback: newFeedback.count || 0,
    }
    const attentionTotal =
      attention.contactMessages +
      attention.pendingTestimonials +
      attention.systemErrors +
      attention.failedEmails +
      attention.pendingCapstones +
      attention.newFeedback

    return {
      attention,
      attentionTotal,
      systemOnline: !error,
      databaseLatencyMs: error ? null : latency,
    }
  }

  /**
   * Fetches paginated user list with role, activity status, and verification status.
   * Merges Supabase Auth users (auth.users) with public.users profiles to capture unverified accounts.
   *
   * Filtering, sorting, and pagination are applied in memory over the merged set
   * (the auth-users merge prevents SQL-side pagination across both sources).
   * At launch scale this is fine; revisit with SQL-side aggregation before
   * significant growth (see Phase 2 dashboard notes).
   */
  /**
   * Fetches paginated user list with role, activity status, and verification status.
   * Uses server-side SQL pagination, filtering, and page-scoped batch enrichment.
   */
  public static async getUsersOverview(
    limit = 50,
    search = '',
    filters: AdminUserFilters = {},
    page = 1
  ): Promise<AdminUserListResult> {
    const supabase = createServiceRoleClient()

    try {
      let query = (supabase.from('users') as unknown as DBChain)
        .select('*', { count: 'exact' })

      // Server-side search
      if (search && search.trim()) {
        const q = search.trim()
        query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,username.ilike.%${q}%`)
      }

      // Server-side filters
      if (filters.role) {
        query = query.eq('is_admin', filters.role === 'admin')
      }
      if (filters.minLevel !== undefined) {
        query = query.gte('level', filters.minLevel)
      }
      if (filters.joinedFrom) {
        query = query.gte('created_at', filters.joinedFrom)
      }
      if (filters.joinedTo) {
        query = query.lte('created_at', filters.joinedTo)
      }

      // Server-side sort
      const sortColumnMap: Record<string, string> = {
        createdAt: 'created_at',
        totalXp: 'total_xp',
        level: 'level',
        streakDays: 'current_streak',
        fullName: 'name',
        email: 'email',
      }
      const sortCol = sortColumnMap[filters.sort || 'createdAt'] || 'created_at'
      query = query.order(sortCol, { ascending: filters.sortDir === 'asc' })

      // Server-side range pagination
      const offset = (page - 1) * limit
      const { data: rawUsers, error, count } = (await query.range(offset, offset + limit - 1)) as unknown as {
        data: Record<string, unknown>[] | null
        error: unknown
        count: number | null
      }

      if (error) {
        throw error
      }

      const publicRows = rawUsers || []
      const pageUserIds = publicRows.map((r) => String(r.id)).filter(Boolean)

      if (pageUserIds.length === 0) {
        return { users: [], total: count ?? 0 }
      }

      // Page-scoped batch queries (no full-table scans)
      const [completedRes, lastActiveRes, completionBadgeRes] = await Promise.all([
        (supabase.from('user_lesson_progress') as unknown as DBChain)
          .select('user_id')
          .eq('status', 'completed')
          .in('user_id', pageUserIds),
        (supabase.from('xp_events') as unknown as DBChain)
          .select('user_id, created_at')
          .in('user_id', pageUserIds)
          .order('created_at', { ascending: false }),
        this.resolveCompletionBadgeUserIdsForPage(supabase, pageUserIds),
      ])

      const completedCounts = new Map<string, number>()
      for (const row of (completedRes.data || []) as Array<{ user_id: string }>) {
        completedCounts.set(row.user_id, (completedCounts.get(row.user_id) || 0) + 1)
      }

      const lastActiveMap = new Map<string, string>()
      for (const row of (lastActiveRes.data || []) as Array<{ user_id: string; created_at: string }>) {
        if (!lastActiveMap.has(row.user_id)) {
          lastActiveMap.set(row.user_id, row.created_at)
        }
      }

      const rows: AdminUserOverview[] = publicRows.map((pub) => {
        const userId = String(pub.id)
        const email = String(pub.email || '')
        const completed = completedCounts.get(userId) || 0
        const hasCompletionBadge = completionBadgeRes.has(userId)

        return {
          id: userId,
          email,
          fullName: String(pub.name || email.split('@')[0] || 'Learner'),
          username: pub.username ? String(pub.username) : null,
          role: pub.is_admin ? 'Admin' : 'Learner',
          isAdmin: Boolean(pub.is_admin),
          isVerified: true,
          emailConfirmedAt: String(pub.created_at || new Date().toISOString()),
          totalXp: Number(pub.total_xp) || 0,
          level: Number(pub.level) || 1,
          streakDays: Number(pub.current_streak) || 0,
          hasPublicPortfolio: Boolean(pub.is_portfolio_public),
          progressPct: computeProgressPct(completed, hasCompletionBadge),
          createdAt: String(pub.created_at || new Date().toISOString()),
          lastActiveAt: lastActiveMap.get(userId) || null,
        }
      })

      return { users: rows, total: count ?? rows.length }
    } catch (err) {
      console.warn('[AdminConsoleService] getUsersOverview failed:', err)
      return { users: [], total: 0, failed: true }
    }
  }

  /**
   * Helper to resolve completion badges for a specific page of user IDs.
   */
  private static async resolveCompletionBadgeUserIdsForPage(
    supabase: ReturnType<typeof createServiceRoleClient>,
    userIds: string[]
  ): Promise<Set<string>> {
    try {
      const { data: badgeRows } = await supabase.from('badges').select('id').eq('key', 'cpo_completion')
      const badgeIds = ((badgeRows || []) as unknown as Array<{ id: string }>).map((b) => b.id)
      if (badgeIds.length === 0 || userIds.length === 0) return new Set()
      const { data: userBadgeRows } = await supabase
        .from('user_badges')
        .select('user_id')
        .in('badge_id', badgeIds)
        .in('user_id', userIds)
      return new Set(((userBadgeRows || []) as unknown as Array<{ user_id: string }>).map((r) => r.user_id))
    } catch {
      return new Set()
    }
  }

  /**
   * KPI summary for the Users workspace header: total accounts, active
   * learners (30d), new signups (24h) and average course progress with SQL counts.
   */
  public static async getUsersKpis(): Promise<{
    totalUsers: number
    activeLearners30d: number
    newSignups24h: number
    avgCourseProgressPct: number
  }> {
    const supabase = createServiceRoleClient()

    try {
      const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const signupsSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [totalRes, activeRowsRes, signupsRes, completedCountRes] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('xp_events').select('user_id').gte('created_at', activeSince).limit(5000),
        supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', signupsSince),
        supabase.from('user_lesson_progress').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      ])

      const totalUsers = totalRes.count || 0
      const activeLearners30d = new Set(
        ((activeRowsRes.data || []) as Array<{ user_id: string | null }>)
          .map((r) => r.user_id)
          .filter((id): id is string => Boolean(id))
      ).size
      const newSignups24h = signupsRes.count || 0
      const totalCompleted = completedCountRes.count || 0

      const avgCourseProgressPct =
        totalUsers > 0 ? clampPct((totalCompleted / (totalUsers * TOTAL_LESSONS)) * 100) : 0

      return { totalUsers, activeLearners30d, newSignups24h, avgCourseProgressPct }
    } catch (err) {
      console.warn('[AdminConsoleService] getUsersKpis failed:', err)
      return { totalUsers: 0, activeLearners30d: 0, newSignups24h: 0, avgCourseProgressPct: 0 }
    }
  }

  /**
   * Fetches the complete Phase 3 user detail payload (KPI summary + all six
   * tab datasets) in a single pass. Returns null when the user does not exist
   * or the query fails (DB unreachable → the drawer degrades to its skeleton /
   * not-found state instead of crashing the page).
   */
  public static async getUserDetailData(userId: string): Promise<AdminUserDetail | null> {
    try {
      return await this.getUserDetailDataUnsafe(userId)
    } catch (err) {
      console.warn('[AdminConsoleService] getUserDetailData failed:', err)
      return null
    }
  }

  private static async getUserDetailDataUnsafe(userId: string): Promise<AdminUserDetail | null> {
    const supabase = createServiceRoleClient()

    const { data: userRow } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()

    interface AuthUserDetailRecord {
      email?: string
      email_confirmed_at?: string | null
      created_at: string
      user_metadata?: { full_name?: string; name?: string }
    }

    let authUser: AuthUserDetailRecord | null = null
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(userId)
      if (authData?.user) authUser = authData.user as unknown as AuthUserDetailRecord
    } catch {
      // Fallback
    }

    if (!userRow && !authUser) return null

    const u = userRow as unknown as {
      id: string
      email: string
      name?: string
      username?: string
      is_admin?: boolean
      total_xp?: number
      level?: number
      current_streak?: number
      is_portfolio_public?: boolean
      goal?: string
      timezone?: string
      auth_provider?: string
      created_at: string
      updated_at?: string
    } | null

    const email = u?.email || authUser?.email || ''
    const emailConfirmedAt = authUser?.email_confirmed_at || (u ? u.created_at : null)
    const isVerified = Boolean(emailConfirmedAt)

    // Curriculum metadata (module bucketing + lesson titles).
    let curriculum: CurriculumEntry[] = []
    try {
      const data = await fetchCurriculumData()
      curriculum = data?.lessons || []
    } catch {
      // Fallback to empty curriculum — module progress degrades gracefully.
    }
    const lessonTitleById = new Map(curriculum.map((l) => [l.id, l.title]))

    // ── Parallel data fetches for every tab ──────────────────────────────────
    const [
      lessonRes,
      quizRows,
      capstoneRes,
      certRes,
      badgeRes,
      reflectionRes,
      srsCountRes,
      emailRes,
      notifRes,
      contactRes,
      lastActiveRes,
    ] = await Promise.all([
      supabase
        .from('user_lesson_progress')
        .select('lesson_id, status, completed_at')
        .eq('user_id', userId),
      this.fetchAllRows<{ lesson_id: string; is_correct: boolean; attempted_at: string }>((from, to) =>
        supabase
          .from('quiz_attempts')
          .select('lesson_id, is_correct, attempted_at')
          .eq('user_id', userId)
          .range(from, to)
      ),
      supabase
        .from('capstone_submissions')
        .select('id, module_slug, status, is_public, submitted_at')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('certificates')
        .select('id, certificate_code, type, issued_at')
        .eq('user_id', userId)
        .order('issued_at', { ascending: false }),
      supabase
        .from('user_badges')
        .select('badge_id, earned_at')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false }),
      supabase
        .from('reflections')
        .select('id, lesson_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('user_flashcard_srs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase
        .from('email_queue')
        .select('id, template_key, status, created_at')
        .eq('to_email', email)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('in_app_notifications')
        .select('id, title, category, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('contact_messages')
        .select('id, subject, category, status, created_at')
        .or(`user_id.eq.${userId},email.eq.${email}`)
        .order('created_at', { ascending: false })
        .limit(20),
      // Most recent xp_event — real "Last Active" (the users table has no
      // updated_at column to fall back on).
      supabase
        .from('xp_events')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const lessonRows = (lessonRes.data || []) as unknown as Array<{
      lesson_id: string
      status: string
      completed_at: string | null
    }>
    const completedLessonIds = new Set(
      lessonRows.filter((l) => l.status === 'completed').map((l) => l.lesson_id)
    )
    const completedCount = completedLessonIds.size

    // Badge metadata (names/descriptions for Achievements + timeline).
    const badgeRows = (badgeRes.data || []) as unknown as Array<{ badge_id: string; earned_at: string }>
    const badgeIds = badgeRows.map((b) => b.badge_id)
    let badgeMeta: Array<{ id: string; key: string; name: string; description: string; icon: string }> = []
    if (badgeIds.length > 0) {
      const { data: badgeMetaRes } = await supabase
        .from('badges')
        .select('id, key, name, description, icon')
        .in('id', badgeIds)
      badgeMeta = (badgeMetaRes || []) as unknown as typeof badgeMeta
    }
    const badgeMetaById = new Map(badgeMeta.map((b) => [b.id, b]))
    const hasCompletionBadge = badgeMeta.some((b) => b.key === 'cpo_completion')

    const capstoneRows = (capstoneRes.data || []) as unknown as Array<{
      id: string
      module_slug: string
      status: string
      is_public: boolean
      submitted_at: string
    }>
    const certRows = (certRes.data || []) as unknown as Array<{
      id: string
      certificate_code: string
      type: string
      issued_at: string
    }>
    const reflectionRows = (reflectionRes.data || []) as unknown as Array<{
      id: string
      lesson_id: string
      created_at: string
    }>

    // ── Activity timeline (union across event tables) ────────────────────────
    const activity = buildUserActivityTimeline([
      ...lessonRows
        .filter((l) => l.status === 'completed' && l.completed_at)
        .map((l) => ({
          type: 'lesson_completed' as const,
          label: 'Completed lesson',
          detail: lessonTitleById.get(l.lesson_id) || l.lesson_id,
          timestamp: l.completed_at,
        })),
      ...quizRows.map((q) => ({
        type: 'quiz_attempted' as const,
        label: 'Attempted quiz',
        detail: lessonTitleById.get(q.lesson_id) || q.lesson_id,
        timestamp: q.attempted_at,
      })),
      ...badgeRows.map((b) => ({
        type: 'badge_earned' as const,
        label: 'Earned badge',
        detail: badgeMetaById.get(b.badge_id)?.name || b.badge_id,
        timestamp: b.earned_at,
      })),
      ...certRows.map((c) => ({
        type: 'certificate_issued' as const,
        label: 'Certificate issued',
        detail: c.certificate_code,
        timestamp: c.issued_at,
      })),
      ...reflectionRows.map((r) => ({
        type: 'reflection_created' as const,
        label: 'Created reflection',
        detail: lessonTitleById.get(r.lesson_id) || r.lesson_id,
        timestamp: r.created_at,
      })),
      ...capstoneRows.map((c) => ({
        type: 'capstone_submitted' as const,
        label: 'Submitted capstone',
        detail: getCapstoneDefinition(c.module_slug)?.moduleTitle || c.module_slug,
        timestamp: c.submitted_at,
      })),
    ])

    const courseProgressPct = computeProgressPct(completedCount, hasCompletionBadge)
    const portfolioUrl = u?.is_portfolio_public && u?.username ? `/p/${u.username}` : null
    const lastActiveRow = lastActiveRes.data as unknown as { created_at: string } | null
    const lastActiveAt = lastActiveRow?.created_at || null

    return {
      id: userId,
      email,
      fullName: u?.name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || email.split('@')[0],
      username: u?.username || null,
      role: u?.is_admin ? 'Admin' : 'Learner',
      isAdmin: Boolean(u?.is_admin),
      isVerified,
      emailConfirmedAt,
      totalXp: u?.total_xp || 0,
      level: u?.level || 1,
      streakDays: u?.current_streak || 0,
      hasPublicPortfolio: Boolean(u?.is_portfolio_public),
      progressPct: courseProgressPct,
      createdAt: u?.created_at || authUser?.created_at || new Date().toISOString(),
      lastActiveAt,
      lessonsCompleted: completedCount,
      quizzesCompleted: quizRows.length,
      capstonesSubmitted: capstoneRows.length,
      certificatesCount: certRows.length,
      goal: u?.goal,
      kpis: {
        level: u?.level || 1,
        xp: u?.total_xp || 0,
        streakDays: u?.current_streak || 0,
        courseProgressPct,
      },
      learning: {
        courseProgressPct,
        lessonsCompleted: completedCount,
        lessonsTotal: curriculum.length || 90,
        quizAttempts: quizRows.length,
        quizAvgScore: computeQuizAvgScore(quizRows),
        srsReviews: srsCountRes.count || 0,
        modules: buildModuleProgress(completedLessonIds, curriculum),
      },
      activity,
      achievements: {
        badges: badgeRows.map((b) => {
          const meta = badgeMetaById.get(b.badge_id)
          return {
            id: b.badge_id,
            key: meta?.key || b.badge_id,
            name: meta?.name || b.badge_id,
            description: meta?.description || '',
            icon: meta?.icon || 'Award',
            earnedAt: b.earned_at,
          }
        }),
        certificates: certRows.map((c) => ({
          id: c.id,
          code: c.certificate_code,
          type: c.type,
          issuedAt: c.issued_at,
        })),
        capstone: capstoneRows[0]
          ? {
              id: capstoneRows[0].id,
              moduleSlug: capstoneRows[0].module_slug,
              moduleTitle: getCapstoneDefinition(capstoneRows[0].module_slug)?.moduleTitle || capstoneRows[0].module_slug,
              status: capstoneRows[0].status,
              isPublic: capstoneRows[0].is_public,
              submittedAt: capstoneRows[0].submitted_at,
            }
          : null,
        portfolio: {
          hasPortfolio: Boolean(u?.is_portfolio_public),
          url: portfolioUrl,
          isPublic: Boolean(u?.is_portfolio_public),
        },
      },
      communications: {
        emails: ((emailRes.data || []) as unknown as Array<{
          id: string
          template_key: string
          status: string
          created_at: string
        }>).map((e) => ({
          id: e.id,
          templateKey: e.template_key,
          status: e.status,
          createdAt: e.created_at,
        })),
        notifications: ((notifRes.data || []) as unknown as Array<{
          id: string
          title: string
          category: string
          is_read: boolean
          created_at: string
        }>).map((n) => ({
          id: n.id,
          title: n.title,
          category: n.category,
          isRead: Boolean(n.is_read),
          createdAt: n.created_at,
        })),
        contacts: ((contactRes.data || []) as unknown as Array<{
          id: string
          subject: string
          category: string
          status: string
          created_at: string
        }>).map((c) => ({
          id: c.id,
          subject: c.subject,
          category: c.category,
          status: c.status,
          createdAt: c.created_at,
        })),
      },
      account: {
        email,
        verified: isVerified,
        emailConfirmedAt,
        createdAt: u?.created_at || authUser?.created_at || new Date().toISOString(),
        lastActiveAt,
        role: u?.is_admin ? 'Admin' : 'Learner',
        isAdmin: Boolean(u?.is_admin),
        goal: u?.goal || null,
        timezone: u?.timezone || null,
        authProvider: u?.auth_provider || null,
      },
    }
  }

  /** Fetches every auth user (paginated past the 1,000-row perPage cap). */
  private static async fetchAllAuthUsers(): Promise<
    Array<{
      id: string
      email?: string
      email_confirmed_at?: string | null
      created_at: string
      user_metadata?: { full_name?: string; name?: string }
    }>
  > {
    const supabase = createServiceRoleClient()
    const users: Array<{
      id: string
      email?: string
      email_confirmed_at?: string | null
      created_at: string
      user_metadata?: { full_name?: string; name?: string }
    }> = []
    const perPage = 1000
    let page = 1
    try {
      for (let guard = 0; guard < 20; guard++) {
        const { data } = await supabase.auth.admin.listUsers({ page, perPage })
        if (!data?.users || data.users.length === 0) break
        users.push(...(data.users as typeof users))
        if (data.users.length < perPage) break
        page += 1
      }
    } catch (err) {
      console.warn('[AdminConsoleService] Service role listUsers fallback:', err)
    }
    return users
  }

  /** Fetches every row matching a builder, walking Supabase's 1,000-row page limit up to safe bound. */
  private static async fetchAllRows<T>(
    buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  ): Promise<T[]> {
    const pageSize = 1000
    const rows: T[] = []
    let start = 0
    // Guard against runaway loops with a 50k row limit
    while (start < 50_000) {
      let page: { data: T[] | null; error: { message: string } | null }
      try {
        page = await buildPage(start, start + pageSize - 1)
      } catch (err) {
        // Network-level failures degrade gracefully to empty rows
        console.warn('[AdminConsoleService] fetchAllRows network failure:', err)
        break
      }
      if (page.error) throw new Error(page.error.message)
      if (!page.data || page.data.length === 0) break
      rows.push(...page.data)
      if (page.data.length < pageSize) break
      start += pageSize
    }
    return rows
  }

  /**
   * Resolves the most recent `xp_events.created_at` per user id.
   *
   * Walks `xp_events` newest-first and stops early once every known account
   * has a timestamp, so "Last Active" reflects real learner activity rather
   * than a profile column. Users with no XP events are absent from the result.
   * Best-effort: any failure degrades to an empty map.
   */
  private static async fetchLastActiveByUser(
    supabase: ReturnType<typeof createServiceRoleClient>,
    userIds: Set<string>
  ): Promise<Map<string, string>> {
    const lastActive = new Map<string, string>()
    if (userIds.size === 0) return lastActive
    const remaining = new Set(userIds)
    const pageSize = 1000
    let start = 0
    try {
      while (start < 1_000_000 && remaining.size > 0) {
        const { data, error } = await supabase
          .from('xp_events')
          .select('user_id, created_at')
          .order('created_at', { ascending: false })
          .range(start, start + pageSize - 1)
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) break
        for (const row of data as unknown as Array<{ user_id: string; created_at: string }>) {
          if (remaining.has(row.user_id) && !lastActive.has(row.user_id)) {
            lastActive.set(row.user_id, row.created_at)
            remaining.delete(row.user_id)
          }
        }
        if (data.length < pageSize) break
        start += pageSize
      }
    } catch (err) {
      // Best-effort enrichment — never let last-active fail the whole workspace.
      console.warn('[AdminConsoleService] fetchLastActiveByUser failed:', err)
    }
    return lastActive
  }

  /** Resolves user ids holding the full-curriculum completion badge. */
  private static async resolveCompletionBadgeUserIds(
    supabase: ReturnType<typeof createServiceRoleClient>
  ): Promise<Set<string>> {
    try {
      const { data: badgeRows } = await supabase.from('badges').select('id').eq('key', 'cpo_completion')
      const badgeIds = ((badgeRows || []) as unknown as Array<{ id: string }>).map((b) => b.id)
      if (badgeIds.length === 0) return new Set()
      const userRows = await this.fetchAllRows<{ user_id: string }>((from, to) =>
        supabase.from('user_badges').select('user_id').in('badge_id', badgeIds).range(from, to)
      )
      return new Set(userRows.map((r) => r.user_id))
    } catch {
      return new Set()
    }
  }

  /**
   * Toggles the admin status of a target user.
   *
   * Note: the `users` table has no `updated_at` column, so the update payload
   * only touches `is_admin` (writing `updated_at` would fail the whole update).
   */
  public static async toggleUserAdminRole(targetUserId: string, makeAdmin: boolean): Promise<boolean> {
    const supabase = createServiceRoleClient()
    type DBUpdateChain = { update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } }
    const { error } = await (supabase.from('users') as unknown as DBUpdateChain)
      .update({ is_admin: makeAdmin })
      .eq('id', targetUserId)

    return !error
  }

  /**
   * Overview metrics for Curriculum Content.
   */
  public static async getContentOverview(): Promise<AdminContentOverview> {
    const supabase = createServiceRoleClient()
    const [capstonesRes] = await Promise.all([
      supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }),
    ])

    return {
      totalModules: 9,
      totalLessons: 90,
      publishedLessons: 90,
      draftLessons: 0,
      archivedLessons: 0,
      totalQuizzes: 90,
      totalFlashcards: 450,
      totalCapstones: capstonesRes.count || 9,
    }
  }

  /**
   * Overview metrics for Email Queue.
   */
  public static async getEmailQueueOverview(): Promise<AdminEmailQueueOverview> {
    const supabase = createServiceRoleClient()
    try {
      const [pendingRes, processingRes, deliveredRes, failedRes] = await Promise.all([
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ])

      const { data: logsData } = await supabase
        .from('email_queue')
        .select('id, to_email, template_key, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

      const queueRows = (logsData || []) as unknown as Array<{
        id: string
        to_email: string
        template_key: string
        status: string
        created_at: string
      }>

      const recentLogs = queueRows.map((row) => ({
        id: row.id,
        toEmail: row.to_email,
        templateKey: row.template_key,
        status: row.status,
        createdAt: row.created_at,
      }))

      return {
        pendingCount: pendingRes.count || 0,
        processingCount: processingRes.count || 0,
        deliveredCount: deliveredRes.count || 0,
        failedCount: failedRes.count || 0,
        deadLetterCount: 0,
        recentLogs,
        failed: false,
      }
    } catch (err) {
      console.warn('[AdminConsoleService] getEmailQueueOverview failed:', err)
      return {
        pendingCount: 0,
        processingCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        deadLetterCount: 0,
        recentLogs: [],
        failed: true,
      }
    }
  }

  /**
   * Fetches feature flags list for admin controls.
   */
  public static getFeatureFlags() {
    return globalFeatureFlagService.getAll()
  }

  /**
   * Updates feature flag state from admin panel.
   */
  public static toggleFeatureFlag(key: string, enabled: boolean) {
    if (enabled) {
      return globalFeatureFlagService.enable(key)
    } else {
      return globalFeatureFlagService.disable(key)
    }
  }
}
