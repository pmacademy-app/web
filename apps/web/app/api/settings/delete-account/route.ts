import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { deleteAccount } from '@/lib/settings/settings-service'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()
    await deleteAccount(supabase, user.id)

    // Sign out session
    await supabase.auth.signOut()

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete account.'
    console.error('[API POST /api/settings/delete-account] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
