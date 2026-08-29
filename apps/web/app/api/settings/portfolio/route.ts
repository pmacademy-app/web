import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import {
  getPortfolioSettings,
  updatePortfolioSettings,
  getLearnerSubmittedCapstones,
} from '@/lib/portfolio-db'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServiceRoleClient()
    const [settings, submittedCapstones] = await Promise.all([
      getPortfolioSettings(supabase, user.id),
      getLearnerSubmittedCapstones(supabase, user.id),
    ])

    return NextResponse.json({ success: true, settings, submittedCapstones })
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

    const supabase = createServiceRoleClient()
    const body = await request.json()
    const result = await updatePortfolioSettings(supabase, user.id, body)

    if (result.settings.username) {
      revalidatePath(`/p/${result.settings.username}`)
      revalidatePath(`/api/og/portfolio/${result.settings.username}`)
    }
    revalidatePath('/settings')

    return NextResponse.json({ success: true, settings: result.settings })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update portfolio settings.'
    console.error('[API POST /api/settings/portfolio] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
