import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getPortfolioSettings, updatePortfolioSettings } from '@/lib/portfolio-db'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()
    const settings = await getPortfolioSettings(supabase, user.id)
    return NextResponse.json({ success: true, settings })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch portfolio settings.'
    console.error('[API GET /api/settings/portfolio] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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
    const body = await request.json()
    const result = await updatePortfolioSettings(supabase, user.id, body)

    return NextResponse.json({ success: true, settings: result.settings })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update portfolio settings.'
    console.error('[API POST /api/settings/portfolio] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
