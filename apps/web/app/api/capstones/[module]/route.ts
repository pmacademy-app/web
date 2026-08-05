import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { loadCapstoneSubmission } from '@/lib/capstones-db'
import { getCapstoneDefinition } from '@/config/capstones'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
) {
  try {
    const { module: moduleSlug } = await params
    const capstoneDef = getCapstoneDefinition(moduleSlug)

    if (!capstoneDef) {
      return NextResponse.json({ error: 'Invalid module capstone slug.' }, { status: 404 })
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

    const data = await loadCapstoneSubmission(supabase, userId, moduleSlug)

    return NextResponse.json({
      success: true,
      definition: capstoneDef,
      submission: data.submission,
      reflection: data.reflection,
      status: data.status,
    })
  } catch (error) {
    console.error('[API GET /api/capstones/[module]] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error fetching capstone detail.' },
      { status: 500 }
    )
  }
}
