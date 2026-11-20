import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { CRON_JOB_DEFINITIONS, evaluateHeartbeat, readCronHeartbeats } from '@/lib/monitoring/cron-heartbeat'

export const dynamic = 'force-dynamic'

/**
 * Public by necessity — an uptime probe cannot authenticate. The payload carries no
 * caller data, no configuration values, and no secrets; only a machine-readable
 * dependency reachability verdict and latency figure.
 */
export const GET = withRoute(
  {
    actor: { allow: ['anonymous', 'learner'] },
    operation: 'health.check',
    domain: 'api',
    summary: 'Unexpected failure serving the health check',
  },
  async () => {
    const startTime = Date.now()
    let dbStatus: 'connected' | 'degraded' | 'unreachable' = 'connected'
    let dbLatencyMs = 0

    try {
      const supabase = createServiceRoleClient()
      const dbStart = Date.now()
      const { error } = await supabase.from('users').select('id').limit(1)
      dbLatencyMs = Date.now() - dbStart

      if (error && !error.message?.includes('JWT')) {
        dbStatus = 'degraded'
      }
    } catch {
      dbStatus = 'unreachable'
    }

    // Scheduled jobs. The heartbeat check used to run only inside the email-queue job,
    // so a stopped scheduler could never report itself. Here an outside uptime monitor
    // sees it: a job past twice its interval turns this endpoint into a 503. A job with
    // no heartbeat yet (fresh environment) or an unreadable heartbeat is reported but
    // does not fail the check.
    let jobsStatus: 'healthy' | 'stale' | 'unknown' = 'unknown'
    let staleJobs: string[] = []
    if (dbStatus === 'connected') {
      try {
        const heartbeats = await readCronHeartbeats(createServiceRoleClient())
        const now = new Date()
        staleJobs = CRON_JOB_DEFINITIONS.filter(
          (j) => evaluateHeartbeat(heartbeats.get(j.job) ?? null, j.intervalMinutes, now).state === 'stale'
        ).map((j) => j.job)
        jobsStatus = staleJobs.length > 0 ? 'stale' : 'healthy'
      } catch {
        jobsStatus = 'unknown'
      }
    }

    const responseTimeMs = Date.now() - startTime
    const isHealthy = dbStatus === 'connected' && jobsStatus !== 'stale'

    if (!isHealthy) {
      try {
        const { logErrorReport } = await import('@/lib/monitoring/logger')
        void logErrorReport({
          domain: 'db',
          kind: 'db_unavailable',
          operation: 'health.check_failure',
          summary:
            dbStatus === 'connected'
              ? 'System health check failed: scheduled jobs are stale'
              : `System health check failed: database connectivity is ${dbStatus}`,
          details: { dbStatus, staleJobs, latencyMs: responseTimeMs },
        })
      } catch {
        // Non-fatal logging fallback
      }
    }

    return NextResponse.json(
      {
        status: isHealthy ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime ? Math.floor(process.uptime()) : null,
        database: dbStatus,
        latencyMs: responseTimeMs,
        services: {
          application: {
            status: 'healthy',
            uptime: process.uptime ? Math.floor(process.uptime()) : null,
          },
          database: {
            status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
            latencyMs: dbLatencyMs,
          },
          jobs: {
            status: jobsStatus,
            stale: staleJobs,
          },
        },
        environment: process.env.NODE_ENV || 'production',
      },
      {
        status: isHealthy ? 200 : 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  }
)

