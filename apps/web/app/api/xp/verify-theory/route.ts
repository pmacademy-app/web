import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { recordTheoryReadAction } from '@/lib/lessons-db'
import { createServiceRoleClient } from '@/lib/supabase'

const verifyTheorySchema = z.object({
  lessonId: z.string().min(1, 'Missing or invalid parameters: lessonId, activeSeconds, scrollPercentage.'),
  activeSeconds: z.number({ message: 'Missing or invalid parameters: lessonId, activeSeconds, scrollPercentage.' }),
  scrollPercentage: z.number({ message: 'Missing or invalid parameters: lessonId, activeSeconds, scrollPercentage.' }),
})

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'xp.verify_theory',
    summary: 'Unexpected failure recording a theory read',
    body: verifyTheorySchema,
  },
  async ({ actor, body }) => {
    const supabase = createServiceRoleClient()

    // A failed engagement check raises `PublicError` from the service, so the
    // learner still sees the specific reason ("Engagement threshold not met.")
    // rather than generic copy. Anything else is a genuine fault.
    const result = await recordTheoryReadAction(
      supabase,
      requireUserId(actor),
      body.lessonId,
      body.activeSeconds,
      body.scrollPercentage
    )

    return NextResponse.json({ success: true, result })
  }
)
