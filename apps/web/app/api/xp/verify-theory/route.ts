import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { recordTheoryReadAction } from '@/lib/lessons-db'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const supabase = createServiceRoleClient()
    let userId: string | null = null

    if (token) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)
      if (!userError && user) {
        userId = user.id
      }
    }

    if (!userId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!authError && user) {
        userId = user.id
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { lessonId, activeSeconds, scrollPercentage } = body

    if (!lessonId || typeof activeSeconds !== 'number' || typeof scrollPercentage !== 'number') {
      return NextResponse.json(
        { error: 'Missing or invalid parameters: lessonId, activeSeconds, scrollPercentage.' },
        { status: 400 }
      )
    }

    const result = await recordTheoryReadAction(
      supabase,
      userId,
      lessonId,
      activeSeconds,
      scrollPercentage
    )

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Engagement threshold not met.'
    return NextResponse.json(
      { error: errorMessage },
      { status: 400 }
    )
  }
}
