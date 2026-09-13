import { NextResponse } from 'next/server'

import { BroadcastService } from '@/lib/admin/broadcast-service'
import { InAppManagerService } from '@/lib/admin/in-app-manager-service'
import { withRoute } from '@/lib/api/with-route'

export const runtime = 'nodejs'

/**
 * GET /api/cron/process-broadcasts
 *
 * Finds scheduled email and in-app broadcasts past their `scheduled_at` time and
 * executes their delivery.
 *
 * Authentication accepts the scheduler's `CRON_SECRET` bearer token or an
 * authenticated admin session; anything else is rejected. Before B7-C the secret
 * was compared with `===` in this file, which is now a constant-time comparison
 * inside `resolveActor`.
 *
 * This route has no POST handler, matching the workflow, which calls it with GET.
 */
export const GET = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.process_broadcasts',
    domain: 'cron',
    summary: 'Unexpected failure while processing scheduled broadcasts',
  },
  async () => {
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
  }
)
