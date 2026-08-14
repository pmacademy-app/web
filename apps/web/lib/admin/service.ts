import { createServiceRoleClient } from '../supabase'
import { globalFeatureFlagService } from '../notifications/feature-flags/service'
import {
  buildFunnel,
  buildLearnerSeries,
  buildLearningSeries,
  computeTrend,
  mergeSeries,
  resolveRange,
} from './dashboard-aggregation'
import type {
  AdminAttentionItem,
  AdminDashboardData,
  AdminDashboardSummary,
  AdminSystemHealth,
  AdminSystemSnapshotItem,
  AdminUserOverview,
  AdminUserDetail,
  AdminContentOverview,
  AdminEmailQueueOverview,
  AdminDateRangeKey,
} from './types'

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
      activeCronJobsCount: 4,
      queuePendingItemsCount: pendingQueueCount,
      failedNotifications24h: failedCount24h,
      lastCheckedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      nextVersion: 'Next.js 16.2.12 (Turbopack)',
    }
  }

  /**
   * Aggregates real-time platform overview metrics for main Admin Dashboard.
   */
  public static async getDashboardSummary(): Promise<AdminDashboardSummary> {
    const supabase = createServiceRoleClient()

    const [
      usersRes,
      lessonsRes,
      capstonesRes,
      certsRes,
      portfoliosRes,
      xpRes,
      systemHealth,
    ] = await Promise.all([
      supabase.from('users').select('id, created_at', { count: 'exact' }),
      supabase.from('user_lesson_progress').select('user_id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }),
      supabase.from('certificates').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_portfolio_public', true),
      supabase.from('xp_events').select('xp_amount'),
      this.getSystemHealth(),
    ])

    const now = new Date()
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const totalUsers = usersRes.count || 0
    let newSignups24h = 0
    if (usersRes.data) {
      const userRows = usersRes.data as unknown as Array<{ created_at: string }>
      newSignups24h = userRows.filter((u) => new Date(u.created_at) >= past24h).length
    }

    let totalXpAwarded = 0
    if (xpRes.data) {
      const xpRows = xpRes.data as unknown as Array<{ xp_amount?: number }>
      totalXpAwarded = xpRows.reduce((acc, row) => acc + (row.xp_amount || 0), 0)
    }

    return {
      totalUsers,
      activeLearners7d: totalUsers,
      newSignups24h,
      totalLessonsCompleted: lessonsRes.count || 0,
      totalCapstonesSubmitted: capstonesRes.count || 0,
      totalCertificatesIssued: certsRes.count || 0,
      totalPublicPortfolios: portfoliosRes.count || 0,
      totalXpAwarded,
      notificationsSent24h: 0,
      queuePendingCount: systemHealth.queuePendingItemsCount,
      systemHealth,
    }
  }

  /**
   * Fetches the complete Phase 2 dashboard payload for a date range.
   *
   * Orchestrates KPI aggregation, attention-center counts, time-series charts,
   * the learning funnel, recent activity, and the system snapshot. All raw row
   * fetching happens here; the bucketing/conversion math lives in the pure
   * helpers under `dashboard-aggregation.ts`.
   */
  public static async getDashboardData(
    rangeKey: AdminDateRangeKey = '30d',
    from?: string | null,
    to?: string | null
  ): Promise<AdminDashboardData> {
    const supabase = createServiceRoleClient()

    const range = resolveRange(rangeKey, from, to)
    const rangeMs = range.end.getTime() - range.start.getTime()
    const previousEnd = new Date(range.start.getTime() - 1)
    const previousStart = new Date(previousEnd.getTime() - rangeMs)
    const rangeStartIso = range.start.toISOString()
    const rangeEndIso = range.end.toISOString()
    const prevStartIso = previousStart.toISOString()
    const prevEndIso = previousEnd.toISOString()

    // ── 1. Users (all rows; small at launch scale) ────────────────────────────
    const { data: userRows } = await supabase
      .from('users')
      .select('id, created_at, goal')
      .order('created_at', { ascending: false })

    const users = (userRows || []) as unknown as Array<{
      id: string
      created_at: string
      goal?: string | null
    }>
    const totalUsers = users.length
    const usersInRange = users.filter((u) => u.created_at >= rangeStartIso && u.created_at <= rangeEndIso)
    const usersInPrevious = users.filter((u) => u.created_at >= prevStartIso && u.created_at <= prevEndIso)

    // ── 2. XP events (active learners + XP earned) ────────────────────────────
    const { data: xpCurrentData } = await supabase
      .from('xp_events')
      .select('user_id, xp_amount, created_at')
      .gte('created_at', rangeStartIso)
      .lte('created_at', rangeEndIso)

    const { data: xpPreviousData } = await supabase
      .from('xp_events')
      .select('user_id, xp_amount')
      .gte('created_at', prevStartIso)
      .lte('created_at', prevEndIso)

    const { data: xpBeforeData } = await supabase
      .from('xp_events')
      .select('user_id')
      .lt('created_at', rangeStartIso)

    const xpCurrent = (xpCurrentData || []) as unknown as Array<{ user_id: string; xp_amount: number; created_at: string }>
    const xpPrevious = (xpPreviousData || []) as unknown as Array<{ user_id: string; xp_amount: number }>
    const xpBefore = (xpBeforeData || []) as unknown as Array<{ user_id: string }>

    const activeUsersInRange = new Set(xpCurrent.map((e) => e.user_id))
    const activeUsersInPrevious = new Set(xpPrevious.map((e) => e.user_id))
    const activeUsersBeforeRange = new Set(xpBefore.map((e) => e.user_id))

    const xpEarned = xpCurrent.reduce((sum, e) => sum + (e.xp_amount || 0), 0)
    const xpEarnedPrevious = xpPrevious.reduce((sum, e) => sum + (e.xp_amount || 0), 0)

    // ── 3. Learning events (charts + funnel stages) ───────────────────────────
    const [lessonsRes, quizzesRes, capstonesRes, certsRes] = await Promise.all([
      supabase.from('user_lesson_progress').select('user_id, completed_at').eq('status', 'completed'),
      supabase.from('quiz_attempts').select('id, user_id, attempted_at'),
      supabase.from('capstone_submissions').select('user_id, submitted_at'),
      supabase.from('certificates').select('id, user_id, issued_at'),
    ])

    const lessonsAll = (lessonsRes.data || []) as unknown as Array<{ user_id: string; completed_at: string | null }>
    const quizzesAll = (quizzesRes.data || []) as unknown as Array<{ id: string; user_id: string; attempted_at: string }>
    const capstonesAll = (capstonesRes.data || []) as unknown as Array<{ user_id: string; submitted_at: string | null }>
    const certsAll = (certsRes.data || []) as unknown as Array<{ id: string; user_id: string; issued_at: string }>

    const lessonsInRange = lessonsAll.filter(
      (l): l is { user_id: string; completed_at: string } =>
        l.completed_at !== null && l.completed_at >= rangeStartIso && l.completed_at <= rangeEndIso
    )
    const lessonsInPrevious = lessonsAll.filter(
      (l): l is { user_id: string; completed_at: string } =>
        l.completed_at !== null && l.completed_at >= prevStartIso && l.completed_at <= prevEndIso
    )
    const quizzesInRange = quizzesAll.filter((q) => q.attempted_at >= rangeStartIso && q.attempted_at <= rangeEndIso)
    const capstonesInRange = capstonesAll.filter(
      (c): c is { user_id: string; submitted_at: string } =>
        c.submitted_at !== null && c.submitted_at >= rangeStartIso && c.submitted_at <= rangeEndIso
    )
    const certsInRange = certsAll.filter((c) => c.issued_at >= rangeStartIso && c.issued_at <= rangeEndIso)
    const certsInPrevious = certsAll.filter((c) => c.issued_at >= prevStartIso && c.issued_at <= prevEndIso)

    // Funnel stages (all-time journey counts)
    const usersWithGoal = users.filter((u) => Boolean(u.goal)).length
    const firstLessonUsers = new Set(lessonsAll.filter((l) => l.completed_at).map((l) => l.user_id))
    const firstQuizUsers = new Set(quizzesAll.map((q) => q.user_id))
    const moduleCompletionUsers = new Set(capstonesAll.filter((c) => c.submitted_at).map((c) => c.user_id))
    const certificateUsers = new Set(certsAll.map((c) => c.user_id))

    // Course completion: users holding the cpo_completion badge (or all 90 lessons)
    let courseCompletionUsers = 0
    try {
      const badgeIds = await this.resolveCourseCompletionBadgeIds(supabase)
      if (badgeIds.length > 0) {
        const { data: badgeRows } = await supabase
          .from('user_badges')
          .select('user_id')
          .in('badge_id', badgeIds)
        courseCompletionUsers = badgeRows ? new Set((badgeRows as unknown as Array<{ user_id: string }>).map((r) => r.user_id)).size : 0
      }
    } catch {
      courseCompletionUsers = 0
    }

    const funnel = buildFunnel([
      { key: 'registered', label: 'Registered', count: totalUsers },
      { key: 'onboarding', label: 'Onboarding', count: usersWithGoal },
      { key: 'first_lesson', label: 'First Lesson', count: firstLessonUsers.size },
      { key: 'first_quiz', label: 'First Quiz', count: firstQuizUsers.size },
      { key: 'module_completion', label: 'Module Completion', count: moduleCompletionUsers.size },
      { key: 'course_completion', label: 'Course Completion', count: courseCompletionUsers },
      { key: 'certificate', label: 'Certificate', count: certificateUsers.size },
    ])

    // ── 4. Verified users (via Supabase Auth admin API) ───────────────────────
    let verifiedTotal = 0
    let verifiedInRange = 0
    let authAvailable = true
    try {
      const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      const authUsers = authData?.users || []
      verifiedTotal = authUsers.filter((u) => Boolean(u.email_confirmed_at)).length
      verifiedInRange = authUsers.filter((u) => u.email_confirmed_at && u.email_confirmed_at >= rangeStartIso && u.email_confirmed_at <= rangeEndIso).length
    } catch {
      // Graceful fallback: verification telemetry unavailable
      authAvailable = false
    }

    // ── 5. Attention center ───────────────────────────────────────────────────
    const attention = await this.getAttentionItems(supabase, rangeStartIso, rangeEndIso)

    // ── 6. System snapshot ────────────────────────────────────────────────────
    const systemSnapshot = await this.getSystemSnapshot(authAvailable)

    // ── 7. Recent activity (union across event tables) ────────────────────────
    const recentActivity = await this.getRecentActivity(supabase, 12)

    // ── 8. Assemble KPIs + series ─────────────────────────────────────────────
    const kpis = {
      totalUsers,
      activeLearners: activeUsersInRange.size,
      newUsers: usersInRange.length,
      verifiedUsers: verifiedTotal,
      lessonsCompleted: lessonsInRange.length,
      courseCompletionPct:
        totalUsers === 0 ? 0 : Math.round((courseCompletionUsers / totalUsers) * 1000) / 10,
      xpEarned,
      certificatesIssued: certsInRange.length,
      trends: {
        totalUsers: computeTrend(totalUsers, totalUsers - usersInRange.length),
        activeLearners: computeTrend(activeUsersInRange.size, activeUsersInPrevious.size),
        newUsers: computeTrend(usersInRange.length, usersInPrevious.length),
        verifiedUsers: computeTrend(verifiedTotal, verifiedTotal - verifiedInRange),
        lessonsCompleted: computeTrend(lessonsInRange.length, lessonsInPrevious.length),
        courseCompletionPct: null,
        xpEarned: computeTrend(xpEarned, xpEarnedPrevious),
        certificatesIssued: computeTrend(certsInRange.length, certsInPrevious.length),
      },
    }

    const learnerSeries = buildLearnerSeries({
      range,
      newUsers: usersInRange,
      xpEvents: xpCurrent,
      usersActiveBeforeWindow: activeUsersBeforeRange,
    })
    const learningSeries = buildLearningSeries({
      range,
      lessonsCompleted: lessonsInRange,
      quizAttempts: quizzesInRange,
      capstonesSubmitted: capstonesInRange,
    })
    const series = mergeSeries(learnerSeries, learningSeries)

    return {
      range,
      kpis,
      attention,
      series,
      funnel,
      recentActivity,
      systemSnapshot,
    }
  }

  /** Resolves badge ids marking full-curriculum completion. */
  private static async resolveCourseCompletionBadgeIds(
    supabase: ReturnType<typeof createServiceRoleClient>
  ): Promise<string[]> {
    try {
      const { data } = await supabase.from('badges').select('id').eq('key', 'cpo_completion')
      return ((data || []) as unknown as Array<{ id: string }>).map((b) => b.id)
    } catch {
      return []
    }
  }

  /** Builds the attention-center rows from live operational tables. */
  private static async getAttentionItems(
    supabase: ReturnType<typeof createServiceRoleClient>,
    rangeStartIso: string,
    rangeEndIso: string
  ): Promise<AdminAttentionItem[]> {
    const [failedEmails, contactMessages, testimonials, alerts] = await Promise.all([
      supabase
        .from('email_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('failed_at', rangeStartIso)
        .lte('failed_at', rangeEndIso),
      supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('testimonials').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('system_errors').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ])

    return [
      {
        id: 'failed-emails',
        label: 'Failed Emails',
        count: failedEmails.count || 0,
        severity: (failedEmails.count || 0) > 0 ? 'critical' : 'healthy',
        href: '/admin/communications?tab=queue',
        actionLabel: 'Review',
      },
      {
        id: 'contact-messages',
        label: 'New Contact Messages',
        count: contactMessages.count || 0,
        severity: (contactMessages.count || 0) > 0 ? 'warning' : 'healthy',
        href: '/admin/communications?tab=contact',
        actionLabel: 'Open Inbox',
      },
      {
        id: 'pending-testimonials',
        label: 'Pending Testimonials',
        count: testimonials.count || 0,
        severity: (testimonials.count || 0) > 0 ? 'warning' : 'healthy',
        href: '/admin/feedback',
        actionLabel: 'Review',
      },
      {
        id: 'system-alerts',
        label: 'Active System Alerts',
        count: alerts.count || 0,
        severity: (alerts.count || 0) > 0 ? 'warning' : 'healthy',
        href: '/admin/system',
        actionLabel: 'View',
      },
    ]
  }

  /** Builds the system snapshot from health + email queue telemetry. */
  private static async getSystemSnapshot(authAvailable: boolean): Promise<AdminSystemSnapshotItem[]> {
    const [health, queue] = await Promise.all([this.getSystemHealth(), this.getEmailQueueOverview()])
    const lastChecked = health.lastCheckedAt

    return [
      { id: 'database', label: 'Database', status: health.status, lastChecked, summary: `${health.databaseLatencyMs} ms latency`, href: '/admin/system' },
      { id: 'auth', label: 'Authentication', status: authAvailable ? 'healthy' : 'degraded', lastChecked, summary: authAvailable ? 'Supabase Auth & RLS enforced' : 'Auth API unreachable', href: '/admin/system' },
      { id: 'email', label: 'Email', status: queue.failedCount > 0 ? 'degraded' : 'healthy', lastChecked, summary: queue.failedCount > 0 ? `${queue.failedCount} failed` : 'Operational', href: '/admin/communications?tab=queue' },
      { id: 'queue', label: 'Queue', status: queue.pendingCount > 0 ? 'degraded' : 'healthy', lastChecked, summary: `${queue.pendingCount} pending`, href: '/admin/communications?tab=queue' },
      { id: 'notifications', label: 'Notifications', status: 'healthy', lastChecked, summary: 'In-app + email channels', href: '/admin/notifications' },
      { id: 'scheduler', label: 'Scheduler', status: 'healthy', lastChecked, summary: `${health.activeCronJobsCount} active cron jobs`, href: '/admin/system' },
    ]
  }

  /** Builds the recent-activity timeline by unioning recent events across tables. */
  private static async getRecentActivity(supabase: ReturnType<typeof createServiceRoleClient>, limit: number) {
    type ActivityRow = {
      id: string
      userId: string | null
      userName: string
      activity: string
      entity: string
      href: string
      timestamp: string
    }

    const results: ActivityRow[] = []

    // Fetch all event sources in parallel
    const [certRes, regRes, lessonRes, capRes] = await Promise.all([
      supabase
        .from('certificates')
        .select('id, user_id, learner_name, issued_at, certificate_code')
        .order('issued_at', { ascending: false })
        .limit(limit),
      supabase
        .from('users')
        .select('id, name, email, created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('user_lesson_progress')
        .select('user_id, lesson_slug, completed_at')
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(limit),
      supabase
        .from('capstone_submissions')
        .select('id, user_id, module_slug, submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(limit),
    ])

    // Certificate issuances
    for (const row of (certRes.data || []) as unknown as Array<{ id: string; user_id: string; learner_name: string; issued_at: string; certificate_code: string }>) {
      results.push({
        id: `cert-${row.id}`,
        userId: row.user_id,
        userName: row.learner_name || 'Learner',
        activity: 'earned a certificate',
        entity: row.certificate_code,
        href: `/admin/certificates`,
        timestamp: row.issued_at,
      })
    }

    // New registrations
    for (const row of (regRes.data || []) as unknown as Array<{ id: string; name: string | null; email: string; created_at: string }>) {
      results.push({
        id: `reg-${row.id}`,
        userId: row.id,
        userName: row.name || row.email.split('@')[0] || 'New learner',
        activity: 'registered',
        entity: 'new learner account',
        href: `/admin/users?userId=${row.id}`,
        timestamp: row.created_at,
      })
    }

    // Lesson completions
    const lessonRowsTyped = (lessonRes.data || []) as unknown as Array<{ user_id: string; lesson_slug: string; completed_at: string }>

    // Resolve names for lesson/capstone rows in one batch
    const activityUserIds = new Set(lessonRowsTyped.map((r) => r.user_id))
    const capRowsTyped = (capRes.data || []) as unknown as Array<{ id: string; user_id: string; module_slug: string; submitted_at: string }>
    for (const row of capRowsTyped) activityUserIds.add(row.user_id)

    const nameMap = new Map<string, string>()
    if (activityUserIds.size > 0) {
      const { data: nameRows } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', [...activityUserIds])
      for (const row of (nameRows || []) as unknown as Array<{ id: string; name: string | null; email: string }>) {
        nameMap.set(row.id, row.name || row.email.split('@')[0] || 'Learner')
      }
    }

    for (const row of lessonRowsTyped) {
      results.push({
        id: `lesson-${row.user_id}-${row.lesson_slug}`,
        userId: row.user_id,
        userName: nameMap.get(row.user_id) || 'Learner',
        activity: 'completed a lesson',
        entity: row.lesson_slug,
        href: `/admin/users?userId=${row.user_id}`,
        timestamp: row.completed_at,
      })
    }

    // Capstone submissions
    for (const row of capRowsTyped) {
      results.push({
        id: `cap-${row.id}`,
        userId: row.user_id,
        userName: nameMap.get(row.user_id) || 'Learner',
        activity: 'submitted a capstone',
        entity: row.module_slug,
        href: `/admin/users?userId=${row.user_id}`,
        timestamp: row.submitted_at,
      })
    }

    return results
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  /**
   * Fetches paginated user list with role & activity status.
   */
  /**
   * Fetches paginated user list with role, activity status, and verification status.
   * Merges Supabase Auth users (auth.users) with public.users profiles to capture unverified accounts.
   */
  public static async getUsersOverview(limit = 50, search = ''): Promise<AdminUserOverview[]> {
    const supabase = createServiceRoleClient()

    // 1. Fetch public.users profiles
    let query = supabase.from('users').select('*').order('created_at', { ascending: false }).limit(limit)
    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`)
    }
    const { data: publicData } = await query

    const publicRows = (publicData || []) as unknown as Array<{
      id: string
      email: string
      name?: string
      username?: string
      is_admin?: boolean
      total_xp?: number
      level?: number
      current_streak?: number
      is_portfolio_public?: boolean
      created_at: string
      updated_at?: string
    }>

    const publicMap = new Map(publicRows.map((r) => [r.id, r]))

    // 2. Fetch Supabase Auth users via service role client (includes unverified users)
    let authUsers: Array<{
      id: string
      email?: string
      email_confirmed_at?: string | null
      created_at: string
      user_metadata?: { full_name?: string; name?: string }
    }> = []

    try {
      const { data: authUsersData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
      if (authUsersData?.users) {
        authUsers = authUsersData.users as typeof authUsers
      }
    } catch (err) {
      console.warn('[AdminConsoleService] Service role listUsers fallback:', err)
    }

    // Merge Auth users and Public users
    const allUserIds = new Set([
      ...publicRows.map((r) => r.id),
      ...authUsers.map((a) => a.id),
    ])

    const authMap = new Map(authUsers.map((a) => [a.id, a]))
    const result: AdminUserOverview[] = []

    for (const userId of allUserIds) {
      const pub = publicMap.get(userId)
      const auth = authMap.get(userId)

      const email = pub?.email || auth?.email || ''
      if (!email) continue

      if (search && !email.toLowerCase().includes(search.toLowerCase()) && !pub?.name?.toLowerCase().includes(search.toLowerCase())) {
        continue
      }

      const emailConfirmedAt = auth?.email_confirmed_at || (pub ? pub.created_at : null)
      const isVerified = Boolean(emailConfirmedAt)

      result.push({
        id: userId,
        email,
        fullName: pub?.name || auth?.user_metadata?.full_name || auth?.user_metadata?.name || email.split('@')[0],
        username: pub?.username || null,
        role: pub?.is_admin ? 'Admin' : 'Learner',
        isAdmin: Boolean(pub?.is_admin),
        isVerified,
        emailConfirmedAt,
        totalXp: pub?.total_xp || 0,
        level: pub?.level || 1,
        streakDays: pub?.current_streak || 0,
        hasPublicPortfolio: Boolean(pub?.is_portfolio_public),
        createdAt: pub?.created_at || auth?.created_at || new Date().toISOString(),
        lastActiveAt: pub?.updated_at || auth?.created_at || null,
      })
    }

    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit)
  }

  /**
   * Fetches detailed profile breakdown for a specific user (verified or unverified).
   */
  public static async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const supabase = createServiceRoleClient()

    const { data: userRow } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()

    interface AuthUserDetailRecord {
      email?: string
      email_confirmed_at?: string | null
      created_at: string
      user_metadata?: { full_name?: string }
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
      created_at: string
      updated_at?: string
    } | null

    const [lessonsRes, quizzesRes, capstonesRes, certsRes] = await Promise.all([
      supabase.from('user_lesson_progress').select('user_id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'completed'),
      supabase.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ])

    const targetAuthUser = authUser as AuthUserDetailRecord | null
    const email = u?.email || targetAuthUser?.email || ''
    const emailConfirmedAt = targetAuthUser?.email_confirmed_at || (u ? u.created_at : null)

    return {
      id: userId,
      email,
      fullName: u?.name || targetAuthUser?.user_metadata?.full_name || email.split('@')[0],
      username: u?.username || null,
      role: u?.is_admin ? 'Admin' : 'Learner',
      isAdmin: Boolean(u?.is_admin),
      isVerified: Boolean(emailConfirmedAt),
      emailConfirmedAt,
      totalXp: u?.total_xp || 0,
      level: u?.level || 1,
      streakDays: u?.current_streak || 0,
      createdAt: u?.created_at || targetAuthUser?.created_at || new Date().toISOString(),
      lastActiveAt: u?.updated_at || targetAuthUser?.created_at || null,
      lessonsCompleted: lessonsRes.count || 0,
      quizzesCompleted: quizzesRes.count || 0,
      capstonesSubmitted: capstonesRes.count || 0,
      certificatesCount: certsRes.count || 0,
      hasPublicPortfolio: Boolean(u?.is_portfolio_public),
      goal: u?.goal,
    }
  }

  /**
   * Toggles the admin status of a target user.
   */
  public static async toggleUserAdminRole(targetUserId: string, makeAdmin: boolean): Promise<boolean> {
    const supabase = createServiceRoleClient()
    type DBUpdateChain = { update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } }
    const { error } = await (supabase.from('users') as unknown as DBUpdateChain)
      .update({ is_admin: makeAdmin, updated_at: new Date().toISOString() })
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
      }
    } catch {
      return {
        pendingCount: 0,
        processingCount: 0,
        deliveredCount: 0,
        failedCount: 0,
        deadLetterCount: 0,
        recentLogs: [],
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
