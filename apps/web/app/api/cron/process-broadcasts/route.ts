import { NextResponse } from 'next/server'

import { BroadcastService } from '@/lib/broadcasts/broadcast-service'
import { InAppManagerService } from '@/lib/broadcasts/in-app-manager-service'
import { withRoute } from '@/lib/api/with-route'
import { withCronHeartbeat } from '@/lib/monitoring/cron-heartbeat'

export const runtime = 'nodejs'

/**
 * POST /api/cron/process-broadcasts
 * GET /api/cron/process-broadcasts (legacy alias; retired in AG-15)
 *
 * Finds scheduled email and in-app broadcasts past their `scheduled_at` time and
 * executes their delivery.
 *
 * Authentication accepts only the `CRON_SECRET` bearer token (the scheduler, or the
 * admin console calling from its server); anything else is rejected. Before B7-C the secret
 * was compared with `===` in this file, which is now a constant-time comparison
 * inside `resolveActor`.
 */
export const POST = withRoute(
  {
    actor: { allow: ['cron'] },
    operation: 'cron.process_broadcasts',
    domain: 'cron',
    summary: 'Unexpected failure while processing scheduled broadcasts',
  },
  async () => withCronHeartbeat('process-broadcasts', async () => {
    const [emailResult, inAppResult] = await Promise.all([
      BroadcastService.processScheduledBroadcasts(),
      InAppManagerService.processScheduledInAppBroadcasts(),
    ])

    return NextResponse.json({
      success: true,
      emailBroadcasts: {
        processed: emailResult.processed,
        errors: emailResult.errors,
      },
      inAppBroadcasts: {
        processed: inAppResult.processed,
        errors: inAppResult.errors,
      },
      timestamp: new Date().toISOString(),
    })
  })
)
