import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Public by necessity — an uptime probe cannot authenticate. The payload carries no
 * caller data and no configuration values, only a reachability verdict and a
 * latency figure, which is what it reported before migration.
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
    let dbStatus = 'connected'

    try {
      const supabase = createServiceRoleClient()
      const { error } = await supabase.from('users').select('id').limit(1)
      if (error && !error.message?.includes('JWT')) {
        dbStatus = 'degraded'
      }
    } catch {
      dbStatus = 'unreachable'
    }

    const responseTimeMs = Date.now() - startTime

    return NextResponse.json(
      {
        status: dbStatus === 'unreachable' ? 'error' : 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime ? Math.floor(process.uptime()) : null,
        database: dbStatus,
        latencyMs: responseTimeMs,
        environment: process.env.NODE_ENV || 'production',
      },
      {
        status: dbStatus === 'unreachable' ? 503 : 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    )
  }
)
