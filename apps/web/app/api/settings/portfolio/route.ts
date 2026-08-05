import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getPortfolioSettings, updatePortfolioSettings } from '@/lib/portfolio-db'

export async function GET(request: Request) {
  try {
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

    const settings = await getPortfolioSettings(supabase, userId)
    return NextResponse.json({ success: true, settings })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch portfolio settings.'
    console.error('[API GET /api/settings/portfolio] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
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

    const body = await request.json()
    const result = await updatePortfolioSettings(supabase, userId, body)

    return NextResponse.json({ success: true, settings: result.settings })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update portfolio settings.'
    console.error('[API POST /api/settings/portfolio] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
