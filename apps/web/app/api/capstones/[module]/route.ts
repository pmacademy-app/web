import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
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

    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()
    const result = await loadCapstoneSubmission(supabase, user.id, moduleSlug)

    return NextResponse.json({
      success: true,
      definition: capstoneDef,
      submission: result.submission,
      reflection: result.reflection,
      status: result.status,
    })
  } catch (error) {
    console.error('[API GET /api/capstones/[module]] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error fetching capstone details.' },
      { status: 500 }
    )
  }
}
