import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { saveDraftAction } from '@/lib/capstones-db'
import { getCapstoneDefinition } from '@/config/capstones'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
) {
  try {
    const { module: moduleSlug } = await params
    if (!getCapstoneDefinition(moduleSlug)) {
      return NextResponse.json({ error: 'Invalid module capstone slug.' }, { status: 404 })
    }

    const body = await request.json()
    const { content } = body ?? {}

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Content payload must be a string.' }, { status: 400 })
    }

    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServiceRoleClient()
    const result = await saveDraftAction(supabase, user.id, moduleSlug, content)

    return NextResponse.json({
      success: true,
      submission: result.submission,
      savedAt: result.submission.submitted_at,
    })
  } catch (error) {
    console.error('[API POST /api/capstones/[module]/draft] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error saving draft.' },
      { status: 500 }
    )
  }
}
