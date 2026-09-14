import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'
import type { AdminUserFilters } from '@/lib/admin/types'

export const runtime = 'nodejs'

/**
 * POST /api/admin/emails/broadcasts/recipient-sample
 * Returns a sample of matching users for admin preview before sending.
 * Only exposes name + email (no sensitive data).
 */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.recipient_sample.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/broadcasts/recipient-sample',
  },
  async ({ request }) => {
    try {
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
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)
