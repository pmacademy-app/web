import { NextRequest, NextResponse } from 'next/server'
import { BroadcastService } from '@/lib/admin/broadcast-service'
import { requireAdminUser } from '@/lib/admin/guard'

export const runtime = 'nodejs'

/**
 * GET /api/cron/process-broadcasts
 *
 * Cron endpoint that finds scheduled broadcasts past their scheduled_at time
 * and executes their next batch.
 *
 * Authentication:
 * 1. Checks Authorization header against CRON_SECRET (standard for Vercel Cron or external schedulers).
 * 2. If CRON_SECRET is not provided or not configured, falls back to requiring an authenticated Admin user.
 * 3. Rejects any unauthenticated public access.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const providedSecret = authHeader?.replace('Bearer ', '')

  const isCronAuthorized = Boolean(cronSecret && providedSecret && providedSecret === cronSecret)

  if (!isCronAuthorized) {
    // Fall back to verifying admin user session
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized: Valid CRON_SECRET or Admin session required.' }, { status: 401 })
    }
  }

  try {
    const result = await BroadcastService.processScheduledBroadcasts()
    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
