/**
 * GET /api/user/curriculum-access
 *
 * Phase 6 — per-learner inputs the client needs to render lesson lock state (Search overlay).
 *
 * The public search index (`/api/search-index`) is edge-cached and shared across all visitors,
 * so it cannot carry per-user access. This small authenticated endpoint returns the minimal,
 * private inputs — the learner's completed and opened lesson ids, their module-entry unlock
 * variant, and the curriculum override — from which the client computes each result's state
 * with the same pure `resolveLessonAccess` used server-side. Read-only: it exposes no lesson
 * body, progress mutation, quiz, or XP surface.
 */

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { isModuleEntryUnlockTreatment } from '@/lib/academy/module-entry-unlock'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'user.curriculum_access.read',
    summary: 'Unexpected failure reading curriculum access state',
  },
  async ({ actor }) => {
    const userId = requireUserId(actor)
    const supabase = createServiceRoleClient()

    const [{ data: userRow }, { data: progressRows }] = await Promise.all([
      supabase.from('users').select('created_at, curriculum_access_override').eq('id', userId).maybeSingle(),
      supabase.from('user_lesson_progress').select('lesson_id, status').eq('user_id', userId),
    ])

    const completedIds: string[] = []
    const openedIds: string[] = []
    for (const r of (progressRows ?? []) as { lesson_id: string; status: string }[]) {
      openedIds.push(r.lesson_id)
      if (r.status === 'completed') completedIds.push(r.lesson_id)
    }

    const treatment = isModuleEntryUnlockTreatment({
      id: userId,
      createdAt: (userRow as { created_at?: string } | null)?.created_at,
    })

    return Response.json({
      completedIds,
      openedIds,
      treatment,
      override: Boolean((userRow as { curriculum_access_override?: boolean } | null)?.curriculum_access_override),
    })
  }
)
