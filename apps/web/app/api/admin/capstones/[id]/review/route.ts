import { NextResponse } from 'next/server'

import { revalidateAdminShell } from '@/lib/admin/cache-tags'
import { ModerationService } from '@/lib/admin/moderation-service'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { capstoneReviewSchema, validateRubricScores } from '@/lib/capstones/rubric'
import { createServiceRoleClient } from '@/lib/supabase'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.capstones.id.review.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/capstones/[id]/review',
    body: capstoneReviewSchema,
  },
  async ({ actor, body, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params
    const supabase = createServiceRoleClient()

    // 1. Fetch submission to resolve module_slug
    const { data: current, error: readError } = await supabase
      .from('capstone_submissions')
      .select('id, module_slug')
      .eq('id', id)
      .maybeSingle()

    if (readError) {
      throw new Error('Failed to read capstone submission.')
    }
    if (!current) {
      throw new RouteError(404, 'NOT_FOUND', 'Capstone submission not found.')
    }

    // 2. Validate requirement IDs and scores against config/capstones.ts for that module
    const rubricValidation = validateRubricScores(current.module_slug, body.scores)
    if (!rubricValidation.valid) {
      throw new RouteError(400, 'INVALID_RUBRIC_SCORES', rubricValidation.error ?? 'Invalid rubric scores.')
    }

    // 3. Apply review
    const success = await ModerationService.reviewCapstone(
      admin.userId,
      admin.email,
      id,
      body.action,
      {
        scores: body.scores,
        feedback: body.feedback,
      },
      supabase
    )

    if (!success) {
      throw new RouteError(500, 'INTERNAL_ERROR', 'Failed to review capstone submission.')
    }

    revalidateAdminShell()
    return NextResponse.json({ success: true })
  }
)
