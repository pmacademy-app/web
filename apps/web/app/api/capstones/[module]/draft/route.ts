import { NextResponse } from 'next/server'

import { getCapstoneDefinition } from '@/config/capstones'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { capstoneDraftBodySchema } from '@/lib/api/contracts/learner-writes'
import { saveDraftAction } from '@/lib/capstones/capstones-db'
import { createServiceRoleClient } from '@/lib/supabase'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'capstones.draft.save',
    summary: 'Unexpected failure saving a capstone draft',
    body: capstoneDraftBodySchema,
    // N-4: an authenticated write with no ceiling before this batch. Drafts are
    // autosaved as the learner types, so the ceiling has to sit well above a normal
    // writing session — 120/hour is one save every 30 seconds, sustained.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `capstone_draft_${actor.userId}` : null),
        limit: 120,
        windowMs: 60 * 60 * 1000,
      },
    ],
  },
  async ({ actor, body, params }) => {
    const moduleSlug = params.module
    if (!getCapstoneDefinition(moduleSlug)) {
      throw new RouteError(404, 'NOT_FOUND', 'Invalid module capstone slug.')
    }

    const supabase = createServiceRoleClient()
    const result = await saveDraftAction(supabase, requireUserId(actor), moduleSlug, body.content)

    return NextResponse.json({
      success: true,
      submission: result.submission,
      savedAt: result.submission.submitted_at,
    })
  }
)
