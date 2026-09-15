import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * GET is open to `anonymous` on purpose: a signed-out visitor is not eligible for
 * any prompt, and the pre-migration route answered that with a 200 and an empty
 * list rather than a 401. The client polls this on every page, so refusing would
 * turn a quiet no-op into console noise for every logged-out visitor.
 */
export const GET = withRoute(
  {
    actor: { allow: ['learner', 'anonymous'] },
    operation: 'feedback.eligibility.read',
    summary: 'Unexpected failure checking feedback prompt eligibility',
  },
  async ({ actor }) => {
    if (actor.kind !== 'learner') {
      return NextResponse.json({ success: true, eligiblePrompts: [] })
    }

    const supabase = createServiceRoleClient()

    // 1. Fetch completed/dismissed prompts for this user
    const { data: promptsData } = await supabase
      .from('user_feedback_prompts')
      .select('prompt_key')
      .eq('user_id', actor.userId)

    const completedKeys = new Set((promptsData || []).map((p: { prompt_key: string }) => p.prompt_key))

    // 2. Fetch user's total active usage seconds from DB
    const { data: userRow } = await supabase
      .from('users')
      .select('total_active_seconds')
      .eq('id', actor.userId)
      .single()

    const activeSeconds = userRow ? (userRow as unknown as { total_active_seconds?: number }).total_active_seconds || 0 : 0
    const eligiblePrompts: string[] = []

    // 3. Check 1-hour milestone eligibility (3600 seconds)
    if (activeSeconds >= 3600 && !completedKeys.has('usage_1hr')) {
      eligiblePrompts.push('usage_1hr')
    }

    return NextResponse.json({ success: true, activeSeconds, eligiblePrompts })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'feedback.eligibility.sync',
    summary: 'Unexpected failure syncing learner usage time',
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)

    const body = (await request.json().catch(() => ({}))) as { incrementSeconds?: unknown }
    const rawIncrement =
      typeof body.incrementSeconds === 'number' &&
      Number.isFinite(body.incrementSeconds) &&
      body.incrementSeconds > 0
        ? Math.floor(body.incrementSeconds)
        : 0
    // Bound increment to max 300 seconds (5 minutes) per sync call to prevent spoofing
    const activeIncrementSeconds = Math.min(rawIncrement, 300)

    const supabase = createServiceRoleClient()
    let newTotal = 0

    if (activeIncrementSeconds > 0) {
      // Fetch current total_active_seconds
      const { data: userRow } = await supabase
        .from('users')
        .select('total_active_seconds')
        .eq('id', userId)
        .single()

      const currentSec = userRow ? (userRow as unknown as { total_active_seconds?: number }).total_active_seconds || 0 : 0
      newTotal = currentSec + activeIncrementSeconds

      // Update total_active_seconds
      type DBUpdateChain = { update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } }
      await (supabase.from('users') as unknown as DBUpdateChain)
        .update({ total_active_seconds: newTotal })
        .eq('id', userId)
    } else {
      const { data: userRow } = await supabase
        .from('users')
        .select('total_active_seconds')
        .eq('id', userId)
        .single()
      newTotal = userRow ? (userRow as unknown as { total_active_seconds?: number }).total_active_seconds || 0 : 0
    }

    // Evaluate 1-hour prompt eligibility directly to avoid a redundant secondary GET request
    const { data: promptsData } = await supabase
      .from('user_feedback_prompts')
      .select('prompt_key')
      .eq('user_id', userId)

    const completedKeys = new Set((promptsData || []).map((p: { prompt_key: string }) => p.prompt_key))
    const eligiblePrompts: string[] = []

    if (newTotal >= 3600 && !completedKeys.has('usage_1hr')) {
      eligiblePrompts.push('usage_1hr')
    }

    return NextResponse.json({
      success: true,
      activeSeconds: newTotal,
      eligiblePrompts,
      completedPrompts: Array.from(completedKeys),
    })
  }
)
