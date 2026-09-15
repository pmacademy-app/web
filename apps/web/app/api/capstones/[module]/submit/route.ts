import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { getCapstoneDefinition } from '@/config/capstones'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { submitCapstoneAction } from '@/lib/capstones-db'
import { createServiceRoleClient } from '@/lib/supabase'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'capstones.submit',
    summary: 'Unexpected failure processing a capstone submission',
    // N-4: the write the audit named first. A capstone is submitted once per module
    // and there are nine modules, so 20/hour cannot obstruct a real learner while
    // still bounding a scripted resubmission loop over the XP award path.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `capstone_submit_${actor.userId}` : null),
        limit: 20,
        windowMs: 60 * 60 * 1000,
      },
    ],
  },
  async ({ request, actor, params }) => {
    const moduleSlug = params.module
    if (!getCapstoneDefinition(moduleSlug)) {
      throw new RouteError(404, 'NOT_FOUND', 'Invalid module capstone slug.')
    }

    const body = (await request.json()) as {
      content?: unknown
      reflectionContent?: unknown
      reflectionIsPublic?: unknown
      isPublic?: unknown
    }
    const { content, reflectionContent, reflectionIsPublic, isPublic } = body ?? {}

    if (typeof content !== 'string') {
      throw new RouteError(400, 'VALIDATION', 'Content payload must be a string.')
    }

    const supabase = createServiceRoleClient()
    // Gating failures (module locked, bad state, requirements unmet) reach the
    // learner as their own copy: `submitCapstoneAction` raises `PublicError` for
    // those, so the wrapper publishes the reason instead of generic copy.
    const result = await submitCapstoneAction(
      supabase,
      requireUserId(actor),
      moduleSlug,
      content,
      typeof reflectionContent === 'string' ? reflectionContent : '',
      Boolean(reflectionIsPublic),
      typeof isPublic === 'boolean' ? isPublic : undefined
    )

    try {
      revalidatePath('/capstones')
      revalidatePath(`/capstones/${moduleSlug}`)
      revalidatePath('/progress')
      revalidatePath('/dashboard')
      revalidatePath('/admin/moderation')
    } catch {
      // Revalidation warning is non-fatal
    }

    return NextResponse.json({
      success: true,
      submission: result.submission,
      xpEarned: result.xpEarned,
      message: result.message,
    })
  }
)
