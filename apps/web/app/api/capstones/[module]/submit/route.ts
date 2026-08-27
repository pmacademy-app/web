import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
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
    const { content, reflectionContent, reflectionIsPublic, isPublic } = body ?? {}

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
    const result = await submitCapstoneAction(
      supabase,
      user.id,
      moduleSlug,
      content,
      typeof reflectionContent === 'string' ? reflectionContent : '',
      Boolean(reflectionIsPublic),
      typeof isPublic === 'boolean' ? isPublic : undefined
    )

    try {
      revalidatePath('/capstones')
      revalidatePath(`/capstones/${moduleSlug}`)
      revalidatePath('/progress')
      revalidatePath('/dashboard')
      revalidatePath('/admin/moderation')
    } catch {
      // Revalidation warning is non-fatal
    }

    return NextResponse.json({
      success: true,
      submission: result.submission,
      xpEarned: result.xpEarned,
      message: result.message,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error processing submission.'
    console.error('[API POST /api/capstones/[module]/submit] Error:', error)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
