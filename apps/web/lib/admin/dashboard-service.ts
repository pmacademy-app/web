import { createServiceRoleClient } from '../supabase'
import {
  buildFunnel,
  buildLearnerSeries,
  buildLearningSeries,
  computeTrend,
  mergeSeries,
  resolveRange,
} from './dashboard-aggregation'
import { AdminConsoleService } from './service'
import type {
  AdminAttentionItem,
  AdminDashboardData,
  AdminDashboardSummary,
  AdminSystemSnapshotItem,
  AdminDateRangeKey,
} from './types'

/**
 * Dashboard / Operations Center data service (Phase 2).
 *
 * Extracted from `AdminConsoleService` to keep the console service focused on
 * user/content/ops concerns. All raw row fetching for the dashboard lives here;
 * the bucketing/conversion math lives in the pure helpers under
 * `dashboard-aggregation.ts`.
 */
export class DashboardService {
  /**
   * Fetches every row matching a builder, walking Supabase's 1,000-row page
   * limit so range-scoped aggregates never silently truncate at the cap.
   */
  private static async fetchAllRows<T>(
    buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  ): Promise<T[]> {
    const pageSize = 1000
    const rows: T[] = []
    let start = 0
    // Guard against runaway loops (1M rows is far beyond launch scale).
    while (start < 1_000_000) {
      const { data, error } = await buildPage(start, start + pageSize - 1)
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) break
      rows.push(...data)
      if (data.length < pageSize) break
      start += pageSize
    }
    return rows
  }

  /**
   * Aggregates real-time platform overview metrics for the summary API.
   */
  public static async getDashboardSummary(): Promise<AdminDashboardSummary> {
    const supabase = createServiceRoleClient()

    const now = new Date()
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUsersRes,
      newSignups24hRes,
      lessonsRes,
      capstonesRes,
      certsRes,
      portfoliosRes,
      xpRows,
      active7dRows,
      systemHealth,
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', past24h.toISOString()),
      supabase.from('user_lesson_progress').select('user_id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }),
      supabase.from('certificates').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_portfolio_public', true),
      this.fetchAllRows<{ xp_amount?: number }>((from, to) =>
        supabase.from('xp_events').select('xp_amount').range(from, to)
      ),
      this.fetchAllRows<{ user_id: string }>((from, to) =>
        supabase.from('xp_events').select('user_id').gte('created_at', past7d.toISOString()).range(from, to)
      ),
      AdminConsoleService.getSystemHealth(),
    ])

    const totalUsers = totalUsersRes?.count ?? 0
    const newSignups24h = newSignups24hRes?.count ?? 0
    const totalXpAwarded = xpRows.reduce((acc, row) => acc + (row.xp_amount || 0), 0)

    // Distinct learners who earned XP in the last 7 days (not total users).
    const activeLearners7d = new Set(active7dRows.map((r) => r.user_id)).size

    return {
      totalUsers,
      activeLearners7d,
      newSignups24h,
      totalLessonsCompleted: lessonsRes?.count ?? 0,
      totalCapstonesSubmitted: capstonesRes?.count ?? 0,
      totalCertificatesIssued: certsRes?.count ?? 0,
      totalPublicPortfolios: portfoliosRes?.count ?? 0,
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
   * the learning funnel, recent activity, and the system snapshot.
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

    // ── 1. Users (counts + range-scoped rows; paginated past Supabase's cap) ──
    const [totalUsersRes, usersInRange, usersInPreviousRes, usersWithGoalRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      this.fetchAllRows<{ id: string; created_at: string }>((from, to) =>
        supabase
          .from('users')
          .select('id, created_at')
          .gte('created_at', rangeStartIso)
          .lte('created_at', rangeEndIso)
          .range(from, to)
      ),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', prevStartIso)
        .lte('created_at', prevEndIso),
      supabase.from('users').select('id', { count: 'exact', head: true }).not('goal', 'is', null),
    ])

    const totalUsers = totalUsersRes?.count ?? 0
    const usersInPrevious = usersInPreviousRes?.count ?? 0
    const usersWithGoal = usersWithGoalRes?.count ?? 0

    // ── 2. XP events (active learners + XP earned) ────────────────────────────
    const xpCurrent = await this.fetchAllRows<{ user_id: string; xp_amount: number; created_at: string }>((from, to) =>
      supabase
        .from('xp_events')
        .select('user_id, xp_amount, created_at')
        .gte('created_at', rangeStartIso)
        .lte('created_at', rangeEndIso)
        .range(from, to)
    )

    const xpPrevious = await this.fetchAllRows<{ user_id: string; xp_amount: number }>((from, to) =>
      supabase
        .from('xp_events')
        .select('user_id, xp_amount')
        .gte('created_at', prevStartIso)
        .lte('created_at', prevEndIso)
        .range(from, to)
    )

    const xpBefore = await this.fetchAllRows<{ user_id: string }>((from, to) =>
      supabase.from('xp_events').select('user_id').lt('created_at', rangeStartIso).range(from, to)
    )

    const activeUsersInRange = new Set(xpCurrent.map((e) => e.user_id))
    const activeUsersInPrevious = new Set(xpPrevious.map((e) => e.user_id))
    const activeUsersBeforeRange = new Set(xpBefore.map((e) => e.user_id))

    const xpEarned = xpCurrent.reduce((sum, e) => sum + (e.xp_amount || 0), 0)
    const xpEarnedPrevious = xpPrevious.reduce((sum, e) => sum + (e.xp_amount || 0), 0)

    // ── 3. Learning events (charts + funnel stages) ───────────────────────────
    const [lessonsInRange, lessonsInPreviousRes, quizzesInRange, capstonesInRange, certsInRange, certsInPreviousRes] =
      await Promise.all([
        this.fetchAllRows<{ user_id: string; completed_at: string | null }>((from, to) =>
          supabase
            .from('user_lesson_progress')
            .select('user_id, completed_at')
            .eq('status', 'completed')
            .gte('completed_at', rangeStartIso)
            .lte('completed_at', rangeEndIso)
            .range(from, to)
        ),
        supabase
          .from('user_lesson_progress')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('completed_at', prevStartIso)
          .lte('completed_at', prevEndIso),
        this.fetchAllRows<{ id: string; user_id: string; attempted_at: string }>((from, to) =>
          supabase
            .from('quiz_attempts')
            .select('id, user_id, attempted_at')
            .gte('attempted_at', rangeStartIso)
            .lte('attempted_at', rangeEndIso)
            .range(from, to)
        ),
        this.fetchAllRows<{ user_id: string; submitted_at: string | null }>((from, to) =>
          supabase
            .from('capstone_submissions')
            .select('user_id, submitted_at')
            .gte('submitted_at', rangeStartIso)
            .lte('submitted_at', rangeEndIso)
            .range(from, to)
        ),
        this.fetchAllRows<{ id: string; user_id: string; issued_at: string }>((from, to) =>
          supabase
            .from('certificates')
            .select('id, user_id, issued_at')
            .gte('issued_at', rangeStartIso)
            .lte('issued_at', rangeEndIso)
            .range(from, to)
        ),
        supabase
          .from('certificates')
          .select('id', { count: 'exact', head: true })
          .gte('issued_at', prevStartIso)
          .lte('issued_at', prevEndIso),
      ])

    const lessonsInPrevious = lessonsInPreviousRes?.count ?? 0
    const certsInPrevious = certsInPreviousRes?.count ?? 0

    // Funnel stages (all-time journey counts — distinct users per milestone).
    const [firstLessonRows, firstQuizRows, moduleCompletionRows, certificateRows] = await Promise.all([
      this.fetchAllRows<{ user_id: string }>((from, to) =>
        supabase.from('user_lesson_progress').select('user_id').eq('status', 'completed').range(from, to)
      ),
      this.fetchAllRows<{ user_id: string }>((from, to) =>
        supabase.from('quiz_attempts').select('user_id').range(from, to)
      ),
      this.fetchAllRows<{ user_id: string }>((from, to) =>
        supabase.from('capstone_submissions').select('user_id').not('submitted_at', 'is', null).range(from, to)
      ),
      this.fetchAllRows<{ user_id: string }>((from, to) =>
        supabase.from('certificates').select('user_id').range(from, to)
      ),
    ])
    const firstLessonUsers = new Set(firstLessonRows.map((r) => r.user_id))
    const firstQuizUsers = new Set(firstQuizRows.map((r) => r.user_id))
    const moduleCompletionUsers = new Set(moduleCompletionRows.map((r) => r.user_id))
    const certificateUsers = new Set(certificateRows.map((r) => r.user_id))

    // Course completion: users holding the cpo_completion badge (or all 90 lessons)
    let courseCompletionUsers = 0
    try {
      const badgeIds = await this.resolveCourseCompletionBadgeIds(supabase)
      if (badgeIds.length > 0) {
        const badgeRows = await this.fetchAllRows<{ user_id: string }>((from, to) =>
          supabase.from('user_badges').select('user_id').in('badge_id', badgeIds).range(from, to)
        )
        courseCompletionUsers = new Set(badgeRows.map((r) => r.user_id)).size
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
      lessonsCompleted: lessonsInRange.filter((l) => l.completed_at).length,
      courseCompletionPct:
        totalUsers === 0 ? 0 : Math.round((courseCompletionUsers / totalUsers) * 1000) / 10,
      xpEarned,
      certificatesIssued: certsInRange.length,
      trends: {
        totalUsers: computeTrend(totalUsers, totalUsers - usersInRange.length),
        activeLearners: computeTrend(activeUsersInRange.size, activeUsersInPrevious.size),
        newUsers: computeTrend(usersInRange.length, usersInPrevious),
        verifiedUsers: computeTrend(verifiedTotal, verifiedTotal - verifiedInRange),
        lessonsCompleted: computeTrend(lessonsInRange.filter((l) => l.completed_at).length, lessonsInPrevious),
        courseCompletionPct: null,
        xpEarned: computeTrend(xpEarned, xpEarnedPrevious),
        certificatesIssued: computeTrend(certsInRange.length, certsInPrevious),
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
      lessonsCompleted: lessonsInRange.filter((l): l is { user_id: string; completed_at: string } => l.completed_at !== null),
      quizAttempts: quizzesInRange,
      capstonesSubmitted: capstonesInRange.filter((c): c is { user_id: string; submitted_at: string } => c.submitted_at !== null),
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
    const [health, queue] = await Promise.all([AdminConsoleService.getSystemHealth(), AdminConsoleService.getEmailQueueOverview()])
    const lastChecked = health.lastCheckedAt

    return [
      { id: 'database', label: 'Database', status: health.status, lastChecked, summary: `${health.databaseLatencyMs} ms latency`, href: '/admin/system' },
      { id: 'auth', label: 'Authentication', status: authAvailable ? 'healthy' : 'degraded', lastChecked, summary: authAvailable ? 'Supabase Auth & RLS enforced' : 'Auth API unreachable', href: '/admin/system' },
      { id: 'email', label: 'Email', status: queue.failedCount > 0 ? 'degraded' : 'healthy', lastChecked, summary: queue.failedCount > 0 ? `${queue.failedCount} failed` : 'Operational', href: '/admin/communications?tab=queue' },
      { id: 'queue', label: 'Queue', status: queue.pendingCount > 0 ? 'degraded' : 'healthy', lastChecked, summary: `${queue.pendingCount} pending`, href: '/admin/communications?tab=queue' },
      // No telemetry source wired up yet — render as neutral "unknown", not a false "healthy".
      { id: 'notifications', label: 'Notifications', status: 'unknown', lastChecked, summary: 'No telemetry yet', href: '/admin/notifications' },
      { id: 'scheduler', label: 'Scheduler', status: 'unknown', lastChecked, summary: 'No telemetry yet', href: '/admin/system' },
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
}