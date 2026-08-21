import { createServiceRoleClient } from '../supabase'
import { AdminConsoleService } from './service'
import { fetchAllRows } from './fetch-all'
import type {
  AdminSystemHealthOverview,
  AdminSystemServiceStatus,
  AdminSystemServiceDetail,
  AdminSystemRecentError,
  AdminErrorGroup,
  AdminErrorGroupResult,
  AdminAuditEntry,
  AdminAuditLogResult,
} from './types'

/**
 * System Workspace data service (Phase 7).
 *
 * Health, service status, operational diagnostics, error grouping and the
 * audit log. Follows the extracted-service pattern (DashboardService /
 * CommunicationsService): raw row fetching lives here, and every method
 * degrades to an honest fallback (empty / `unknown`) rather than fabricating
 * a healthy state when telemetry is unavailable.
 */

/** GitHub Actions cron jobs configured for the platform (no run telemetry). */
const CRON_JOBS = [
  { name: 'Process Email Queue', path: '/api/cron/process-email-queue' },
  { name: 'Retry Failed Emails', path: '/api/cron/retry-failed' },
  { name: 'Daily Reminder', path: '/api/cron/daily-reminder' },
  { name: 'Weekly Recap', path: '/api/cron/weekly-recap' },
  { name: 'Cleanup', path: '/api/cron/cleanup' },
]

interface SystemErrorRow {
  id: string
  fingerprint: string
  severity: string
  category: string
  operation: string
  message: string
  status: string
  timestamp: string
}

export class SystemService {
  /**
   * Health overview for the System Health tab: six service cards, overall
   * status, environment info, external integrations and configured cron jobs.
   *
   * Services without a telemetry source are reported as `unknown` (neutral),
   * never as a false "healthy". The overall status is derived only from the
   * monitored services (database, auth, email, queue).
   */
  public static async getHealthOverview(): Promise<AdminSystemHealthOverview> {
    try {
      const { health, queue, authAvailable, notificationEvents24h } = await this.getBaseTelemetry()

      const lastChecked = health.lastCheckedAt
      const dbHealthy = health.status === 'healthy'
      const queueTelemetryAvailable = !queue.failed

      const services: AdminSystemServiceStatus[] = [
        {
          id: 'database',
          label: 'Database',
          status: health.status,
          lastChecked,
          summary: `${health.databaseLatencyMs} ms latency`,
          detail: 'Supabase PostgreSQL connection (live ping)',
        },
        {
          id: 'auth',
          label: 'Authentication',
          status: authAvailable ? 'healthy' : 'degraded',
          lastChecked,
          summary: authAvailable ? 'Supabase Auth reachable' : 'Auth API unreachable',
          detail: 'Supabase Auth & RLS enforcement',
        },
        {
          id: 'email',
          label: 'Email',
          status: queueTelemetryAvailable
            ? (queue.failedCount > 0 ? 'degraded' : 'healthy')
            : 'unknown',
          lastChecked,
          summary: queueTelemetryAvailable
            ? (queue.failedCount > 0 ? `${queue.failedCount} failed` : 'Operational')
            : 'No queue telemetry',
          detail: 'Resend transactional email service — status reflects queue health',
        },
        {
          id: 'queue',
          label: 'Queue',
          status: queueTelemetryAvailable
            ? (queue.failedCount > 0 || queue.processingCount > 0 ? 'degraded' : 'healthy')
            : 'unknown',
          lastChecked,
          summary: queueTelemetryAvailable
            ? `${queue.pendingCount} pending, ${queue.processingCount} processing`
            : 'No queue telemetry',
          detail: 'Email delivery queue',
        },
        {
          id: 'notifications',
          label: 'Notifications',
          status: 'unknown',
          lastChecked,
          summary: `${notificationEvents24h} events (24h)`,
          detail: 'In-app notification platform — no health telemetry',
        },
        {
          id: 'scheduler',
          label: 'Scheduler',
          status: 'unknown',
          lastChecked,
          summary: `${CRON_JOBS.length} jobs configured`,
          detail: 'GitHub Actions cron — no run telemetry',
        },
      ]

      const monitored = services.filter((s) => s.status !== 'unknown')
      const overallStatus = monitored.some((s) => s.status === 'degraded')
        ? 'degraded'
        : 'healthy'

      return {
        overallStatus,
        environment: health.environment,
        nextVersion: '',
        lastCheckedAt: lastChecked,
        databaseLatencyMs: health.databaseLatencyMs,
        services,
        cronJobs: CRON_JOBS,
        integrations: this.getIntegrationStatus(dbHealthy),
      }
    } catch (err) {
      // DB unreachable → honest fallback: no services, overall unknown.
      console.warn('[SystemService] getHealthOverview failed:', err)
      return {
        overallStatus: 'unknown',
        environment: process.env.NODE_ENV || 'development',
        nextVersion: '',
        lastCheckedAt: new Date().toISOString(),
        databaseLatencyMs: null,
        services: [],
        cronJobs: CRON_JOBS,
        integrations: this.getIntegrationStatus(false),
        failed: true,
      }
    }
  }

  /**
   * Detail payload for every service (status, metrics, recent failures).
   * Computed server-side so the detail drawer opens instantly.
   */
  public static async getServiceDetails(): Promise<Record<string, AdminSystemServiceDetail>> {
    try {
      return await this.buildServiceDetails()
    } catch (err) {
      // DB unreachable → honest fallback: every service reports `unknown`
      // rather than a fabricated healthy state.
      console.warn('[SystemService] getServiceDetails failed:', err)
      const lastChecked = new Date().toISOString()
      const fallback: AdminSystemServiceDetail = {
        id: 'database',
        label: 'Database',
        status: 'unknown',
        lastChecked,
        summary: 'Unavailable',
        metrics: [],
        recentErrors: [],
      }
      return {
        database: { ...fallback, id: 'database', label: 'Database' },
        auth: { ...fallback, id: 'auth', label: 'Authentication' },
        email: { ...fallback, id: 'email', label: 'Email' },
        notifications: { ...fallback, id: 'notifications', label: 'Notifications' },
        queue: { ...fallback, id: 'queue', label: 'Queue' },
        scheduler: { ...fallback, id: 'scheduler', label: 'Scheduler' },
      }
    }
  }

  private static async buildServiceDetails(): Promise<Record<string, AdminSystemServiceDetail>> {
    const { supabase, health, queue, authAvailable, notificationEvents24h } = await this.getBaseTelemetry()
    const lastChecked = health.lastCheckedAt
    const queueTelemetryAvailable = !queue.failed

    const [dbErrors, authErrors, emailErrors, queueErrors, cronErrors] = await Promise.all([
      this.fetchRecentErrors(supabase, ['system'], 10),
      this.fetchRecentErrors(supabase, ['auth'], 10),
      this.fetchRecentErrors(supabase, ['resend'], 10),
      this.fetchRecentErrors(supabase, ['queue'], 10),
      this.fetchRecentErrors(supabase, ['cron'], 10),
    ])

    const emailStatus = queueTelemetryAvailable
      ? (queue.failedCount > 0 ? 'degraded' : 'healthy')
      : 'unknown'
    const emailSummary = queueTelemetryAvailable
      ? (queue.failedCount > 0 ? `${queue.failedCount} failed` : 'Operational')
      : 'No queue telemetry'

    const queueStatus = queueTelemetryAvailable
      ? (queue.failedCount > 0 || queue.processingCount > 0 ? 'degraded' : 'healthy')
      : 'unknown'
    const queueSummary = queueTelemetryAvailable
      ? `${queue.pendingCount} pending, ${queue.processingCount} processing`
      : 'No queue telemetry'

    return {
      database: {
        id: 'database',
        label: 'Database',
        status: health.status,
        lastChecked,
        summary: `${health.databaseLatencyMs} ms latency`,
        metrics: [
          { label: 'Query latency', value: `${health.databaseLatencyMs} ms` },
          { label: 'Environment', value: health.environment },
          { label: 'Last checked', value: new Date(lastChecked).toLocaleString() },
        ],
        recentErrors: dbErrors,
      },
      auth: {
        id: 'auth',
        label: 'Authentication',
        status: authAvailable ? 'healthy' : 'degraded',
        lastChecked,
        summary: authAvailable ? 'Supabase Auth reachable' : 'Auth API unreachable',
        metrics: [
          { label: 'Auth API', value: authAvailable ? 'Reachable' : 'Unreachable' },
          { label: 'Last checked', value: new Date(lastChecked).toLocaleString() },
        ],
        recentErrors: authErrors,
      },
      email: {
        id: 'email',
        label: 'Email',
        status: emailStatus,
        lastChecked,
        summary: emailSummary,
        metrics: [
          { label: 'Pending', value: String(queue.pendingCount) },
          { label: 'Processing', value: String(queue.processingCount) },
          { label: 'Delivered', value: String(queue.deliveredCount) },
          { label: 'Failed', value: String(queue.failedCount) },
        ],
        recentErrors: emailErrors,
        note: queueTelemetryAvailable
          ? undefined
          : 'Queue telemetry unavailable — email service status cannot be determined.',
      },
      queue: {
        id: 'queue',
        label: 'Queue',
        status: queueStatus,
        lastChecked,
        summary: queueSummary,
        metrics: [
          { label: 'Pending', value: String(queue.pendingCount) },
          { label: 'Processing', value: String(queue.processingCount) },
          { label: 'Delivered', value: String(queue.deliveredCount) },
          { label: 'Failed', value: String(queue.failedCount) },
        ],
        recentErrors: queueErrors,
        note: queueTelemetryAvailable
          ? undefined
          : 'Queue telemetry unavailable — status cannot be determined.',
      },
      notifications: {
        id: 'notifications',
        label: 'Notifications',
        status: 'unknown',
        lastChecked,
        summary: `${notificationEvents24h} events (24h)`,
        metrics: [{ label: 'Events (24h)', value: String(notificationEvents24h) }],
        recentErrors: [],
        note: 'No health telemetry is available for the in-app notification platform. Events are dispatched automatically from learning activity; see Communications → Notifications for the event log.',
      },
      scheduler: {
        id: 'scheduler',
        label: 'Scheduler',
        status: 'unknown',
        lastChecked,
        summary: `${CRON_JOBS.length} jobs configured`,
        metrics: [{ label: 'Configured jobs', value: String(CRON_JOBS.length) }],
        recentErrors: cronErrors,
        note: `No run telemetry is available for the GitHub Actions scheduler. Configured jobs: ${CRON_JOBS.map((j) => j.name).join(', ')}.`,
      },
    }
  }

  /**
   * Grouped operational errors from `system_errors`, aggregated by fingerprint
   * (first/last seen + occurrence count). Filtering is applied before grouping
   * so counts stay exact; grouping + pagination happen in memory (the table is
   * deduplicated by the logger, so it stays small at launch scale).
   */
  public static async getErrorGroups(params: {
    severity?: string
    category?: string
    status?: string
    page?: number
    pageSize?: number
  }): Promise<AdminErrorGroupResult> {
    const supabase = createServiceRoleClient()
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(5, Number(params.pageSize) || 25))
    const severity = params.severity && params.severity !== 'all' ? params.severity : null
    const category = params.category && params.category !== 'all' ? params.category : null
    const status = params.status && params.status !== 'all' ? params.status : null

    try {
      const rows = await fetchAllRows<SystemErrorRow>((from, to) => {
        let query = supabase
          .from('system_errors')
          .select('id, fingerprint, severity, category, operation, message, status, timestamp')
          .order('timestamp', { ascending: false })
          .range(from, to)
        if (severity) query = query.eq('severity', severity)
        if (category) query = query.eq('category', category)
        if (status) query = query.eq('status', status)
        return query
      })

      // Rows arrive newest-first, so the first row per fingerprint carries the
      // current severity/status; older rows only widen first/last seen.
      const groups = new Map<string, AdminErrorGroup>()
      for (const row of rows) {
        const existing = groups.get(row.fingerprint)
        if (existing) {
          existing.occurrences += 1
          if (row.timestamp < existing.firstSeen) existing.firstSeen = row.timestamp
        } else {
          groups.set(row.fingerprint, {
            fingerprint: row.fingerprint,
            severity: row.severity as AdminErrorGroup['severity'],
            category: row.category,
            operation: row.operation,
            message: row.message,
            status: row.status as AdminErrorGroup['status'],
            firstSeen: row.timestamp,
            lastSeen: row.timestamp,
            occurrences: 1,
          })
        }
      }

      const all = Array.from(groups.values()).sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1))
      const total = all.length
      const start = (page - 1) * pageSize
      return {
        groups: all.slice(start, start + pageSize),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }
    } catch (err) {
      console.warn('[SystemService] getErrorGroups failed:', err)
      return { groups: [], total: 0, page, pageSize, totalPages: 1, failed: true }
    }
  }

  /**
   * Paginated audit log from `admin_audit_logs` with admin/action/target/date
   * filters. Note: writes are not yet wired (see `logAdminAction`), so the
   * table is expected to be empty until persistence is enabled.
   */
  public static async getAuditLog(params: {
    admin?: string
    action?: string
    target?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }): Promise<AdminAuditLogResult> {
    const supabase = createServiceRoleClient()
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(5, Number(params.pageSize) || 25))
    const admin = params.admin?.trim() || null
    const action = params.action?.trim() || null
    const target = params.target?.trim() || null
    const from = params.from || null
    const to = params.to || null

    try {
      let query = supabase
        .from('admin_audit_logs')
        .select('id, admin_user_id, admin_email, action, target_resource, target_id, metadata, created_at', {
          count: 'exact',
        })
      if (admin) query = query.ilike('admin_email', `%${admin}%`)
      if (action) query = query.ilike('action', `%${action}%`)
      if (target) {
        // Sanitize target for PostgREST filter syntax to prevent injection.
        // Escape single quotes and percent signs used in ILIKE patterns.
        const sanitized = target.replace(/'/g, "''").replace(/%/g, '\\%')
        query = query.or(`target_resource.ilike.%${sanitized}%,target_id.ilike.%${sanitized}%`)
      }
      if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`)
      if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`)
      query = query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)

      const { data, count, error } = await query
      if (error) throw new Error(error.message)

      const entries: AdminAuditEntry[] = ((data || []) as unknown as Array<{
        id: string
        admin_user_id: string | null
        admin_email: string
        action: string
        target_resource: string
        target_id: string | null
        metadata: Record<string, unknown> | null
        created_at: string
      }>).map((r) => ({
        id: String(r.id),
        adminId: r.admin_user_id ? String(r.admin_user_id) : null,
        adminEmail: String(r.admin_email),
        action: String(r.action),
        targetResource: String(r.target_resource),
        targetId: r.target_id ? String(r.target_id) : null,
        details: r.metadata && typeof r.metadata === 'object' ? r.metadata : null,
        createdAt: String(r.created_at),
      }))

      const total = count || 0
      return { entries, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    } catch (err) {
      console.warn('[SystemService] getAuditLog failed:', err)
      return { entries: [], total: 0, page, pageSize, totalPages: 1, failed: true }
    }
  }

  /* ─── Private helpers ─────────────────────────────────────────────────── */

  private static async getBaseTelemetry() {
    const supabase = createServiceRoleClient()
    const [health, queue, authAvailable, notificationEvents24h] = await Promise.all([
      AdminConsoleService.getSystemHealth(),
      AdminConsoleService.getEmailQueueOverview(),
      this.checkAuthAvailability(supabase),
      this.countRecentNotificationEvents(supabase),
    ])
    return { supabase, health, queue, authAvailable, notificationEvents24h }
  }

  /** Whether the Supabase Auth admin API is reachable (drives Auth status). */
  private static async checkAuthAvailability(
    supabase: ReturnType<typeof createServiceRoleClient>
  ): Promise<boolean> {
    try {
      const { data } = await supabase.auth.admin.listUsers({ perPage: 1 })
      return Boolean(data?.users)
    } catch {
      return false
    }
  }

  /** Real activity proxy for the notification platform (no health telemetry). */
  private static async countRecentNotificationEvents(
    supabase: ReturnType<typeof createServiceRoleClient>
  ): Promise<number> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('notification_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since)
      return count || 0
    } catch {
      return 0
    }
  }

  /** Recent `system_errors` rows for a set of categories (service detail). */
  private static async fetchRecentErrors(
    supabase: ReturnType<typeof createServiceRoleClient>,
    categories: string[],
    limit: number
  ): Promise<AdminSystemRecentError[]> {
    try {
      const { data, error } = await supabase
        .from('system_errors')
        .select('id, timestamp, severity, operation, message')
        .in('category', categories)
        .order('timestamp', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return ((data || []) as unknown as Array<{
        id: string
        timestamp: string
        severity: string
        operation: string
        message: string
      }>).map((r) => ({
        id: String(r.id),
        timestamp: String(r.timestamp),
        severity: String(r.severity),
        operation: String(r.operation),
        message: String(r.message),
      }))
    } catch {
      return []
    }
  }

  /** External platform integration status from environment key presence and live health. */
  private static getIntegrationStatus(dbHealthy: boolean) {
    const hasResendKey = Boolean(process.env.RESEND_API_KEY)
    const hasCronSecret = Boolean(process.env.CRON_SECRET)
    const hasVercelToken = Boolean(process.env.VERCEL_API_TOKEN)
    const hasSupabaseMgmt = Boolean(process.env.SUPABASE_MANAGEMENT_API_KEY)

    return [
      {
        id: 'database',
        name: 'Supabase PostgreSQL Database',
        description: dbHealthy
          ? 'Live SQL ping latency query'
          : 'Database unreachable — live ping failed',
        configured: true,
        monitored: true,
        healthy: dbHealthy,
      },
      {
        id: 'resend',
        name: 'Resend Transactional Email REST API',
        description: hasResendKey
          ? 'RESEND_API_KEY present — outbound error logger instrumented'
          : 'Requires RESEND_API_KEY in environment',
        configured: hasResendKey,
        monitored: false,
        healthy: hasResendKey,
      },
      {
        id: 'cron',
        name: 'GitHub Actions Cron Scheduler',
        description: hasCronSecret
          ? 'CRON_SECRET present — authorization instrumented'
          : 'Requires CRON_SECRET in repository secrets',
        configured: hasCronSecret,
        monitored: false,
        healthy: hasCronSecret,
      },
      {
        id: 'vercel',
        name: 'Vercel Deployment Platform',
        description: hasVercelToken
          ? 'VERCEL_API_TOKEN present'
          : 'Requires VERCEL_API_TOKEN for Vercel REST telemetry',
        configured: hasVercelToken,
        monitored: false,
        healthy: hasVercelToken,
      },
      {
        id: 'supabase-mgmt',
        name: 'Supabase Management API',
        description: hasSupabaseMgmt
          ? 'SUPABASE_MANAGEMENT_API_KEY present'
          : 'Requires SUPABASE_MANAGEMENT_API_KEY',
        configured: hasSupabaseMgmt,
        monitored: false,
        healthy: hasSupabaseMgmt,
      },
    ]
  }
}