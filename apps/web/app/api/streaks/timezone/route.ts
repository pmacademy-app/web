import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

const timezoneSchema = z.object({
  timezone: z.string().min(1, 'Missing or invalid parameter: timezone string.'),
})

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'streaks.timezone.update',
    summary: 'Unexpected failure updating the learner timezone',
    body: timezoneSchema,
  },
  async ({ actor, body }) => {
    const { timezone } = body

    // Validate IANA timezone format. Kept in the handler rather than folded into
    // the schema so the refusal keeps naming the offending value, as before.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    } catch {
      throw new RouteError(400, 'VALIDATION', `Invalid IANA timezone string: '${timezone}'.`)
    }

    const supabase = createServiceRoleClient()
    const { error: updateError } = await (supabase
      .from('users') as unknown as DBChain)
      .update({ timezone })
      .eq('id', requireUserId(actor))

    if (updateError) {
      console.error('[API /api/streaks/timezone] Error:', updateError)
      throw new RouteError(500, 'SERVER_ERROR', 'Failed to update timezone.')
    }

    return NextResponse.json({ success: true, timezone })
  }
)
