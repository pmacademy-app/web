import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { recordTheoryReadAction } from '@/lib/lessons-db'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const userId = user.id
    const supabase = createServiceRoleClient()

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
