import { NextResponse } from 'next/server'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createDefaultNotificationPreferences } from '@/lib/notifications/preferences/defaults'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export async function GET(request: Request) {
  const authUser = await getAuthenticatedUserFromRequest(request)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('timezone')
      .eq('id', authUser.id)
      .single()

    const { data: prefRow } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', authUser.id)
      .maybeSingle()

    if (!prefRow) {
      const defaultPrefs = createDefaultNotificationPreferences(authUser.id)
      return NextResponse.json({
        success: true,
        preferences: defaultPrefs,
        timezone: (userRow as unknown as { timezone?: string })?.timezone || 'UTC',
      })
    }

    return NextResponse.json({
      success: true,
      preferences: prefRow,
      timezone: (userRow as unknown as { timezone?: string })?.timezone || 'UTC',
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch preferences'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const authUser = await getAuthenticatedUserFromRequest(request)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const supabase = createServerSupabaseClient()

    const { error } = await (supabase
      .from('user_notification_preferences') as unknown as DBChain)
      .upsert(
        {
          user_id: authUser.id,
          ...body,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('[API:settings/notifications] Error updating preferences:', error)
    }

    return NextResponse.json({ success: true, updated: body })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update preferences'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}
