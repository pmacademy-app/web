import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { choosableFrames, FRAME_KINDS } from '@/lib/avatar/frames'
import { logSystemError } from '@/lib/monitoring/logger'
import { revalidatePublicPortfolioForUser } from '@/lib/portfolio/portfolio-revalidate'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * The learner's chosen avatar frame (users.avatar_frame, NULL = automatic).
 *
 * Only frames a learner can freely pick are accepted (lib/avatar/frames.ts
 * choosableFrames): the level ring always, the streak ring and the Fellow frame once
 * earned. Verified, certified and weekly top 3 appear automatically when earned.
 */
const bodySchema = z.object({ frame: z.enum(FRAME_KINDS).nullable() }).strict()

type FrameRow = { avatar_frame: string | null; current_streak: number | null; is_fellow: boolean | null; total_xp: number | null }

async function readRow(request: Request, userId: string): Promise<FrameRow> {
  const db = await getLearnerDbForRequest(request)
  const { data, error } = await db
    .from('users')
    .select('avatar_frame, current_streak, is_fellow, total_xp')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) throw new RouteError(500, 'SERVER_ERROR', 'Failed to load your avatar frame.')
  return data as FrameRow
}

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.avatar_frame.read',
    summary: 'Unexpected failure reading the avatar frame',
  },
  async ({ request, actor }) => {
    const row = await readRow(request, requireUserId(actor))
    return NextResponse.json({
      success: true,
      chosen: row.avatar_frame,
      totalXp: row.total_xp ?? 0,
      currentStreak: row.current_streak ?? 0,
      choosable: choosableFrames({ currentStreak: row.current_streak, isFellow: Boolean(row.is_fellow) }),
    })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.avatar_frame.update',
    summary: 'Unexpected failure saving the avatar frame',
    body: bodySchema,
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `avatar_frame_${actor.userId}` : null),
        limit: 30,
        windowMs: 10 * 60 * 1000,
      },
    ],
  },
  async ({ request, actor, body }) => {
    const userId = requireUserId(actor)
    if (body.frame !== null) {
      const row = await readRow(request, userId)
      const allowed = choosableFrames({ currentStreak: row.current_streak, isFellow: Boolean(row.is_fellow) })
      if (!allowed.includes(body.frame)) {
        throw new RouteError(400, 'VALIDATION', 'You have not earned that frame yet.')
      }
    }

    // Writes to public.users are server-only (20261027000002).
    const supabase = createServiceRoleClient()
    const { error } = await supabase.from('users').update({ avatar_frame: body.frame }).eq('id', userId)
    if (error) {
      void logSystemError({
        severity: 'error',
        category: 'db',
        operation: 'settings.avatar_frame.update',
        message: `Failed to save avatar frame: ${error.message}`,
        userId,
      })
      throw new RouteError(500, 'SERVER_ERROR', 'Failed to save your avatar frame.')
    }

    // The frame shows on the cached public portfolio.
    await revalidatePublicPortfolioForUser(supabase, userId)
    return NextResponse.json({ success: true, chosen: body.frame })
  }
)
