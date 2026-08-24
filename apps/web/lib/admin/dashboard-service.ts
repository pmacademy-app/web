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
 * Optimized with SQL-side RPC aggregations, bounded range queries, and tagged caching.
 */
export class DashboardService {
  /**
   * Fetches up to limit rows matching a query, preventing runaway memory scans.
   */
  private static async fetchBoundedRows<T>(
    buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    maxRows = 5000
  ): Promise<T[]> {
    const pageSize = 1000
    const rows: T[] = []
    let start = 0
    while (start < maxRows) {
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
   * Aggregates real-time platform overview metrics for the summary API with SQL RPC.
   */
  public static async getDashboardSummary(): Promise<AdminDashboardSummary> {
    const fetcher = async (): Promise<AdminDashboardSummary> => {
      try {
        const supabase = createServiceRoleClient()

        // Attempt PostgreSQL RPC aggregation first
        try {
          const { data: rpcData, error: rpcError } = (await (supabase as unknown as {
            rpc: (fn: string) => Promise<{ data: Record<string, unknown> | null; error: unknown }>
          }).rpc('get_admin_dashboard_summary'))

          if (!rpcError && rpcData) {
            const systemHealth = await AdminConsoleService.getSystemHealth()
            return {
              totalUsers: Number(rpcData.totalUsers || 0),
              activeLearners7d: Number(rpcData.activeLearners7d || 0),
              newSignups24h: Number(rpcData.newSignups24h || 0),
              totalLessonsCompleted: Number(rpcData.totalLessonsCompleted || 0),
              totalCapstonesSubmitted: Number(rpcData.totalCapstonesSubmitted || 0),
              totalCertificatesIssued: Number(rpcData.totalCertificatesIssued || 0),
              totalPublicPortfolios: Number(rpcData.totalPublicPortfolios || 0),
              totalXpAwarded: Number(rpcData.totalXpAwarded || 0),
              notificationsSent24h: 0,
              queuePendingCount: systemHealth.queuePendingItemsCount,
              systemHealth,
            }
          }
        } catch {
          // Fall back to direct queries if RPC is not yet created
        }

        // Fast fallback using direct count queries and users table total_xp
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
          usersXpRes,
          active7dRows,
          systemHealth,
        ] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', past24h.toISOString()),
          supabase.from('user_lesson_progress').select('user_id', { count: 'exact', head: true }).eq('status', 'completed'),
          supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }),
          supabase.from('certificates').select('id', { count: 'exact', head: true }),
          supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_portfolio_public', true),
          supabase.from('users').select('total_xp'),
          supabase
            .from('xp_events')
            .select('user_id')
            .gte('created_at', past7d.toISOString())
            .limit(5000),
          AdminConsoleService.getSystemHealth(),
        ])

        const totalUsers = totalUsersRes?.count ?? 0
        const newSignups24h = newSignups24hRes?.count ?? 0
        const totalXpAwarded = (usersXpRes.data || []).reduce(
          (acc: number, u: { total_xp?: number | null }) => acc + (u.total_xp || 0),
          0
        )

        const activeLearners7d = new Set(
          (active7dRows.data || []).map((r: { user_id: string | null }) => r.user_id).filter((id): id is string => Boolean(id))
        ).size

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
      } catch (err) {
        console.warn('[DashboardService] getDashboardSummary failed:', err)
        const systemHealth = await AdminConsoleService.getSystemHealth().catch(() => ({
          status: 'down' as const,
          databaseLatencyMs: -1,
          activeCronJobsCount: 0,
          queuePendingItemsCount: 0,
          failedNotifications24h: 0,
          lastCheckedAt: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
          nextVersion: 'Next.js 16.2.12 (Turbopack)',
        }))
        return {
          totalUsers: 0,
          activeLearners7d: 0,
          newSignups24h: 0,
          totalLessonsCompleted: 0,
          totalCapstonesSubmitted: 0,
          totalCertificatesIssued: 0,
          totalPublicPortfolios: 0,
          totalXpAwarded: 0,
          notificationsSent24h: 0,
          queuePendingCount: systemHealth.queuePendingItemsCount,
          systemHealth,
        }
      }
    }

    return fetcher()
  }

  /**
   * Fetches the complete Phase 2 dashboard payload for a date range with SQL aggregations and caching.
   */
  public static async getDashboardData(
    rangeKey: AdminDateRangeKey = '30d',
    from?: string | null,
    to?: string | null
  ): Promise<AdminDashboardData> {
    const fetcher = async (): Promise<AdminDashboardData> => {
      const range = resolveRange(rangeKey, from, to)
      try {
        const supabase = createServiceRoleClient()

        const rangeMs = range.end.getTime() - range.start.getTime()
        const previousEnd = new Date(range.start.getTime() - 1)
        const previousStart = new Date(previousEnd.getTime() - rangeMs)
        const rangeStartIso = range.start.toISOString()
        const rangeEndIso = range.end.toISOString()
        const prevStartIso = previousStart.toISOString()
        const prevEndIso = previousEnd.toISOString()

        // ── 1. Users (counts + range-scoped rows) ─────────────────────────────────
        const [totalUsersRes, usersInRangeRes, usersInPreviousRes, usersWithGoalRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase
            .from('users')
            .select('id, created_at')
            .gte('created_at', rangeStartIso)
            .lte('created_at', rangeEndIso)
            .limit(5000),
          supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', prevStartIso)
            .lte('created_at', prevEndIso),
          supabase.from('users').select('id', { count: 'exact', head: true }).not('goal', 'is', null),
        ])

        const totalUsers = totalUsersRes?.count ?? 0
        const usersInRange = (usersInRangeRes.data || []) as Array<{ id: string; created_at: string }>
        const usersInPrevious = usersInPreviousRes?.count ?? 0
        const usersWithGoal = usersWithGoalRes?.count ?? 0

        // ── 2. XP events (active learners + XP earned within range) ───────────────
        const [xpCurrentRes, xpPreviousRes, activeBeforeRes] = await Promise.all([
          supabase
            .from('xp_events')
            .select('user_id, xp_amount, created_at')
            .gte('created_at', rangeStartIso)
            .lte('created_at', rangeEndIso)
            .limit(5000),
          supabase
            .from('xp_events')
            .select('user_id, xp_amount')
            .gte('created_at', prevStartIso)
            .lte('created_at', prevEndIso)
            .limit(5000),
          supabase
            .from('xp_events')
            .select('user_id')
            .lt('created_at', rangeStartIso)
            .limit(2000),
        ])

        const xpCurrent = (xpCurrentRes.data || []) as Array<{ user_id: string | null; xp_amount: number; created_at: string }>
        const xpPrevious = (xpPreviousRes.data || []) as Array<{ user_id: string | null; xp_amount: number }>
        const xpBefore = (activeBeforeRes.data || []) as Array<{ user_id: string | null }>

        const activeUsersInRange = new Set(xpCurrent.map((e) => e.user_id).filter((id): id is string => Boolean(id)))
        const activeUsersInPrevious = new Set(xpPrevious.map((e) => e.user_id).filter((id): id is string => Boolean(id)))
        const activeUsersBeforeRange = new Set(xpBefore.map((e) => e.user_id).filter((id): id is string => Boolean(id)))

        const xpEarned = xpCurrent.reduce((sum, e) => sum + (e.xp_amount || 0), 0)
        const xpEarnedPrevious = xpPrevious.reduce((sum, e) => sum + (e.xp_amount || 0), 0)

        // ── 3. Learning events (charts + range counts) ───────────────────────────
        const [lessonsInRangeRes, lessonsInPreviousRes, quizzesInRangeRes, capstonesInRangeRes, certsInRangeRes, certsInPreviousRes] =
          await Promise.all([
            supabase
              .from('user_lesson_progress')
              .select('user_id, completed_at')
              .eq('status', 'completed')
              .gte('completed_at', rangeStartIso)
              .lte('completed_at', rangeEndIso)
              .limit(5000),
            supabase
              .from('user_lesson_progress')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'completed')
              .gte('completed_at', prevStartIso)
              .lte('completed_at', prevEndIso),
            supabase
              .from('quiz_attempts')
              .select('id, user_id, attempted_at')
              .gte('attempted_at', rangeStartIso)
              .lte('attempted_at', rangeEndIso)
              .limit(5000),
            supabase
              .from('capstone_submissions')
              .select('user_id, submitted_at')
              .gte('submitted_at', rangeStartIso)
              .lte('submitted_at', rangeEndIso)
              .limit(5000),
            supabase
              .from('certificates')
              .select('id, user_id, issued_at')
              .gte('issued_at', rangeStartIso)
              .lte('issued_at', rangeEndIso)
              .limit(5000),
            supabase
              .from('certificates')
              .select('id', { count: 'exact', head: true })
              .gte('issued_at', prevStartIso)
              .lte('issued_at', prevEndIso),
          ])

        const lessonsInRange = (lessonsInRangeRes.data || []) as Array<{ user_id: string; completed_at: string | null }>
        const lessonsInPrevious = lessonsInPreviousRes?.count ?? 0
        const quizzesInRange = (quizzesInRangeRes.data || []) as Array<{ id: string; user_id: string | null; attempted_at: string }>
        const capstonesInRange = (capstonesInRangeRes.data || []) as Array<{ user_id: string | null; submitted_at: string }>
        const certsInRange = (certsInRangeRes.data || []) as Array<{ id: string; user_id: string; issued_at: string }>
        const certsInPrevious = certsInPreviousRes?.count ?? 0

        // ── 4. Funnel stages (SQL-side fast count queries) ────────────────────────
        const [firstLessonCountRes, firstQuizCountRes, moduleCompletionCountRes, certificateCountRes] = await Promise.all([
          supabase.from('user_lesson_progress').select('user_id', { count: 'exact', head: true }).eq('status', 'completed'),
          supabase.from('quiz_attempts').select('user_id', { count: 'exact', head: true }),
          supabase.from('capstone_submissions').select('user_id', { count: 'exact', head: true }).not('submitted_at', 'is', null),
          supabase.from('certificates').select('user_id', { count: 'exact', head: true }),
        ])

        let courseCompletionUsers = 0
        try {
          const badgeIds = await this.resolveCourseCompletionBadgeIds(supabase)
          if (badgeIds.length > 0) {
            const { count } = await supabase.from('user_badges').select('user_id', { count: 'exact', head: true }).in('badge_id', badgeIds)
            courseCompletionUsers = count || 0
          }
        } catch {
          courseCompletionUsers = 0
        }

        const funnel = buildFunnel([
          { key: 'registered', label: 'Registered', count: totalUsers },
          { key: 'onboarding', label: 'Onboarding', count: usersWithGoal },
          { key: 'first_lesson', label: 'First Lesson', count: firstLessonCountRes?.count ?? 0 },
          { key: 'first_quiz', label: 'First Quiz', count: firstQuizCountRes?.count ?? 0 },
          { key: 'module_completion', label: 'Module Completion', count: moduleCompletionCountRes?.count ?? 0 },
          { key: 'course_completion', label: 'Course Completion', count: courseCompletionUsers },
          { key: 'certificate', label: 'Certificate', count: certificateCountRes?.count ?? 0 },
        ])

        // ── 5. Verified users ─────────────────────────────────────────────────────
        let verifiedTotal = 0
        let verifiedInRange = 0
        let authAvailable = true
        try {
          const { data: authData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
          const authUsers = authData?.users || []
          verifiedTotal = authUsers.filter((u) => Boolean(u.email_confirmed_at)).length
          verifiedInRange = authUsers.filter(
            (u) => u.email_confirmed_at && u.email_confirmed_at >= rangeStartIso && u.email_confirmed_at <= rangeEndIso
          ).length
        } catch {
          authAvailable = false
        }

        // ── 6. Attention center & System Snapshot ────────────────────────────────
        const [attention, systemSnapshot, recentActivity] = await Promise.all([
          this.getAttentionItems(supabase, rangeStartIso, rangeEndIso),
          this.getSystemSnapshot(authAvailable),
          this.getRecentActivity(supabase, 12),
        ])

        // ── 7. Assemble KPIs & Series ─────────────────────────────────────────────
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
          xpEvents: xpCurrent.filter((e): e is { user_id: string; xp_amount: number; created_at: string } => e.user_id !== null),
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
      } catch (err) {
        console.warn('[DashboardService] getDashboardData failed:', err)
        const systemSnapshot = await this.getSystemSnapshot(false).catch(() => [])
        return {
          range,
          kpis: {
            totalUsers: 0,
            activeLearners: 0,
            newUsers: 0,
            verifiedUsers: 0,
            lessonsCompleted: 0,
            courseCompletionPct: 0,
            xpEarned: 0,
            certificatesIssued: 0,
            trends: {
              totalUsers: null,
              activeLearners: null,
              newUsers: null,
              verifiedUsers: null,
              lessonsCompleted: null,
              courseCompletionPct: null,
              xpEarned: null,
              certificatesIssued: null,
            },
          },
          attention: [],
          series: [],
          funnel: [],
          recentActivity: [],
          systemSnapshot,
        }
      }
    }

    return fetcher()
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
      { id: 'notifications', label: 'Notifications', status: 'unknown', lastChecked, summary: 'No telemetry yet', href: '/admin/notifications' },
      { id: 'scheduler', label: 'Scheduler', status: 'unknown', lastChecked, summary: 'No telemetry yet', href: '/admin/system' },
    ]
  }

  /** Builds the recent-activity timeline by unioning recent events across tables with parallel limit queries. */
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

    const lessonRowsTyped = (lessonRes.data || []) as unknown as Array<{ user_id: string; lesson_slug: string; completed_at: string }>
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