import { NextResponse } from 'next/server'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: true, eligiblePrompts: [] })
    }

    const supabase = createServiceRoleClient()

    // 1. Fetch completed/dismissed prompts for this user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: promptsData } = await (supabase.from('user_feedback_prompts' as any) as any)
      .select('prompt_key')
      .eq('user_id', user.id)

    const completedKeys = new Set((promptsData || []).map((p: { prompt_key: string }) => p.prompt_key))

    // 2. Fetch user's total active usage seconds from DB
    const { data: userRow } = await supabase
      .from('users')
      .select('total_active_seconds')
      .eq('id', user.id)
      .single()

    const activeSeconds = userRow ? (userRow as unknown as { total_active_seconds?: number }).total_active_seconds || 0 : 0
    const eligiblePrompts: string[] = []

    // 3. Check 1-hour milestone eligibility (3600 seconds)
    if (activeSeconds >= 3600 && !completedKeys.has('usage_1hr')) {
      eligiblePrompts.push('usage_1hr')
    }

    return NextResponse.json({
      success: true,
      activeSeconds,
      eligiblePrompts,
    })
  } catch (err) {
    console.error('[api/feedback/eligibility] Error checking eligibility:', err)
    return NextResponse.json({ success: false, eligiblePrompts: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const activeIncrementSeconds = typeof body.incrementSeconds === 'number' && body.incrementSeconds > 0 ? body.incrementSeconds : 0

    if (activeIncrementSeconds > 0) {
      const supabase = createServiceRoleClient()
      
      // Fetch current total_active_seconds
      const { data: userRow } = await supabase
        .from('users')
        .select('total_active_seconds')
        .eq('id', user.id)
        .single()

      const currentSec = userRow ? (userRow as unknown as { total_active_seconds?: number }).total_active_seconds || 0 : 0
      const newTotal = currentSec + activeIncrementSeconds

      // Update total_active_seconds
      type DBUpdateChain = { update: (data: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } }
      await (supabase.from('users') as unknown as DBUpdateChain)
        .update({ total_active_seconds: newTotal })
        .eq('id', user.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/feedback/eligibility] Error updating usage time:', err)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
