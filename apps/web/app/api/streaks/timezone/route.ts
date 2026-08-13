import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const supabase = createServiceRoleClient()
    let userId: string | null = null

    if (token) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)
      if (!userError && user) {
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
    const { timezone } = body

    if (!timezone || typeof timezone !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid parameter: timezone string.' },
        { status: 400 }
      )
    }

    // Validate IANA timezone format
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    } catch {
      return NextResponse.json(
        { error: `Invalid IANA timezone string: '${timezone}'.` },
        { status: 400 }
      )
    }

    const { error: updateError } = await (supabase
      .from('users') as unknown as DBChain)
      .update({ timezone })
      .eq('id', userId)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      timezone,
    })
  } catch (error) {
    console.error('[API /api/streaks/timezone] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update timezone.' },
      { status: 500 }
    )
  }
}
