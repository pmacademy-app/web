import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { resetProgress } from '@/lib/settings/settings-service'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const moduleSlug = body.module_slug

    const supabase = createServerSupabaseClient()
    await resetProgress(supabase, user.id, moduleSlug)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reset progress.'
    console.error('[API POST /api/settings/reset/progress] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
