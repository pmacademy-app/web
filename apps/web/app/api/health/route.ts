import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Public by necessity — an uptime probe cannot authenticate. The payload carries no
 * caller data, no configuration values, and no secrets; only a machine-readable
 * dependency reachability verdict and latency figure.
 */
export const GET = withRoute(
  {
    actor: { allow: ['anonymous', 'learner', 'admin'] },
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

    const responseTimeMs = Date.now() - startTime
    const isHealthy = dbStatus === 'connected'

    if (!isHealthy) {
      try {
        const { logErrorReport } = await import('@/lib/monitoring/logger')
        void logErrorReport({
          domain: 'db',
          kind: 'db_unavailable',
          operation: 'health.check_failure',
          summary: `System health check failed: database connectivity is ${dbStatus}`,
          details: { dbStatus, latencyMs: responseTimeMs },
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
            status: isHealthy ? 'healthy' : 'unhealthy',
            latencyMs: dbLatencyMs,
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

