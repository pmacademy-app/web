import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getUserFellowState, submitFellowRequest } from '@/lib/fellow-requests-db'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Authenticated session required.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const state = await getUserFellowState(supabase, user.id)

    return NextResponse.json({ success: true, ...state })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Fellow request status.'
    console.error('[API GET /api/fellow-requests] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Authenticated session required.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const result = await submitFellowRequest(supabase, user.id)

    return NextResponse.json({ success: true, request: result.request })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to submit Fellow request.'
    console.error('[API POST /api/fellow-requests] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
