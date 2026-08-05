import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { submitCapstoneAction } from '@/lib/capstones-db'
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
    const { content, reflectionContent, reflectionIsPublic } = body ?? {}

    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content cannot be empty.' }, { status: 400 })
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

    const result = await submitCapstoneAction(
      supabase,
      userId,
      moduleSlug,
      content,
      reflectionContent,
      Boolean(reflectionIsPublic)
    )

    return NextResponse.json({
      success: true,
      submission: result.submission,
      xpEarned: result.xpEarned,
      message: result.message,
    })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Internal server error submitting capstone.'
    console.error('[API POST /api/capstones/[module]/submit] Error:', error)
    return NextResponse.json(
      { error: errMsg },
      { status: 400 }
    )
  }
}
