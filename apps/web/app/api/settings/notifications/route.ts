import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { createDefaultNotificationPreferences } from '@/lib/notifications/preferences/defaults'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.notifications.read',
    domain: 'api',
    summary: 'Unexpected failure reading notification preferences',
  },
  async ({ actor }) => {
    const authUserId = requireUserId(actor)

  const supabase = createServiceRoleClient()

  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('timezone')
      .eq('id', authUserId)
      .single()

    const { data: prefRow } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', authUserId)
      .maybeSingle()

    if (!prefRow) {
      const defaultPrefs = createDefaultNotificationPreferences(authUserId)
      return NextResponse.json({
        success: true,
        preferences: defaultPrefs,
        timezone: (userRow)?.timezone || 'UTC',
      })
    }

    return NextResponse.json({
      success: true,
      preferences: prefRow,
      timezone: (userRow)?.timezone || 'UTC',
    })
  } catch (err) {
    // Rethrown: the wrapper records the incident and returns generic copy with an
    // errorId. This branch previously sent err.message to the client.
    throw err
  }
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.notifications.update',
    domain: 'api',
    summary: 'Unexpected failure updating notification preferences',
  },
  async ({ request, actor }) => {
    const authUserId = requireUserId(actor)

  try {
    const body = await request.json()
    const supabase = createServiceRoleClient()

    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert(
        {
          user_id: authUserId,
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
    // Rethrown: the wrapper records the incident and returns generic copy with an
    // errorId. This branch previously sent err.message to the client.
    throw err
  }
  }
)
