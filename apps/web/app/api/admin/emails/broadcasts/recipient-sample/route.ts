import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { BroadcastService } from '@/lib/admin/broadcast-service'
import type { AdminUserFilters } from '@/lib/admin/types'

export const runtime = 'nodejs'

/**
 * POST /api/admin/emails/broadcasts/recipient-sample
 * Returns a sample of matching users for admin preview before sending.
 * Only exposes name + email (no sensitive data).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const filters = (body.filters ?? {}) as AdminUserFilters
    const limit = Math.min(100, Math.max(1, parseInt(body.limit || '50', 10)))

    const sample = await BroadcastService.previewRecipientSample(filters, limit)

    // Only return safe fields — no sensitive data
    const safeSample = sample.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      career_role: u.career_role,
      onboarding_completed: u.onboarding_completed,
    }))

    return NextResponse.json({ success: true, sample: safeSample, count: safeSample.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
