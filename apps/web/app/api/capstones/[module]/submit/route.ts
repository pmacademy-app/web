import { revalidatePath } from 'next/cache'
import { after, NextResponse } from 'next/server'
import { z } from 'zod'

import { getCapstoneDefinition } from '@/config/capstones'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { evaluateBadgesAfterXp } from '@/lib/badges/evaluate-after-xp'
import { submitCapstoneAction } from '@/lib/capstones-db'
import { trackProductEvent } from '@/lib/events/product-events'
import { createServiceRoleClient } from '@/lib/supabase'
import { hasXpEvent } from '@/lib/xp-service'

// CQ-12: declared on the wrapper, so a malformed or mistyped body is a clean 400 rather
// than a hand-parsed cast (or a 500 incident on invalid JSON).
const submitSchema = z.object({
  content: z.string({ message: 'Content payload must be a string.' }),
  reflectionContent: z.string().optional(),
  reflectionIsPublic: z.boolean().optional(),
  isPublic: z.boolean().optional(),
})

type ServiceClient = ReturnType<typeof createServiceRoleClient>

interface PriorSubmission {
  /** The latest row was already submitted, so this call is an idempotent no-op. */
  alreadySubmitted: boolean
  /** A submission was made before (the capstone XP ledger has an entry), so this one is a revision. */
  isRevision: boolean
}

/**
 * What existed before this submit, read only for PROD-15 analytics. Never fails the request:
 * when the state cannot be read it returns null and no event is recorded for this call.
 */
async function readPriorSubmission(
  supabase: ServiceClient,
  userId: string,
  moduleSlug: string
): Promise<PriorSubmission | null> {
  try {
    const [latest, xpAwarded] = await Promise.all([
      supabase
        .from('capstone_submissions')
        .select('status')
        .eq('user_id', userId)
        .eq('module_slug', moduleSlug)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      hasXpEvent(supabase, userId, 'capstone', moduleSlug),
    ])
    if (latest.error) {
      console.warn('[api/capstones/submit] Prior submission could not be read:', latest.error.message)
      return null
    }
    return {
      alreadySubmitted: latest.data?.status === 'submitted',
      isRevision: xpAwarded,
    }
  } catch (err) {
    console.warn('[api/capstones/submit] Prior submission could not be read:', err)
    return null
  }
}

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'capstones.submit',
    summary: 'Unexpected failure processing a capstone submission',
    body: submitSchema,
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
  async ({ actor, body, params }) => {
    const moduleSlug = params.module
    if (!getCapstoneDefinition(moduleSlug)) {
      throw new RouteError(404, 'NOT_FOUND', 'Invalid module capstone slug.')
    }

    const userId = requireUserId(actor)
    const supabase = createServiceRoleClient()
    const prior = await readPriorSubmission(supabase, userId, moduleSlug)

    // Gating failures (module locked, bad state, requirements unmet) reach the
    // learner as their own copy: `submitCapstoneAction` raises `PublicError` for
    // those, so the wrapper publishes the reason instead of generic copy.
    const result = await submitCapstoneAction(
      supabase,
      userId,
      moduleSlug,
      body.content,
      body.reflectionContent ?? '',
      body.reflectionIsPublic ?? false,
      body.isPublic
    )

    // ISSUE-23: XP-driven badges are granted when the XP is earned. Idempotent, never throws.
    if (result.xpEarned > 0) {
      after(() => evaluateBadgesAfterXp(userId))
    }

    // PROD-15: a first submission or a revision both count; a repeat of an already submitted
    // capstone wrote nothing, so it is not an event.
    if (prior && !prior.alreadySubmitted) {
      after(() =>
        trackProductEvent('capstone_submitted', userId, {
          module: moduleSlug,
          revision: prior.isRevision,
        })
      )
    }

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
