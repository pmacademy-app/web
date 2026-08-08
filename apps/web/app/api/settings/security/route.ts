import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
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

    const { password } = await request.json()

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      console.error('[API POST /api/settings/security] Password update error:', error)
      return NextResponse.json({ error: error.message || 'Failed to update password.' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
