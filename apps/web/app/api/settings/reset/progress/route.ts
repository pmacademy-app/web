import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase'
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

    const supabase = createServiceRoleClient()
    await resetProgress(supabase, user.id, moduleSlug)

    // Clear next.js data cache for academy pages so they accurately reflect locked state
    revalidatePath('/academy', 'layout')
    revalidatePath('/dashboard', 'layout')
    revalidatePath('/progress', 'layout')
    revalidatePath('/capstones', 'layout')

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reset progress.'
    console.error('[API POST /api/settings/reset/progress] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
