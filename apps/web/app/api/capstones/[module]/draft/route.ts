import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
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

    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const supabase = createServerSupabaseClient()
    let userId: string | null = null

    if (token) {
      const { data: { user }, error: tokenErr } = await supabase.auth.getUser(token)
      if (!tokenErr && user) {
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

    const result = await saveDraftAction(supabase, userId, moduleSlug, content)

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
