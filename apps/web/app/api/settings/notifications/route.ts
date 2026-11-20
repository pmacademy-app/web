import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { createDefaultNotificationPreferences } from '@/lib/notifications/preferences/defaults'
import { logSystemError } from '@/lib/monitoring/logger'
import { notificationPreferencesUpdateSchema } from '@/lib/api/contracts/settings'

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
        preferences: {
          in_app_enabled: defaultPrefs.allInApp,
          email_enabled: defaultPrefs.allEmail,
          all_notifications: defaultPrefs.allNotifications,
          all_email: defaultPrefs.allEmail,
          all_in_app: defaultPrefs.allInApp,
          learning_email: defaultPrefs.learning.email,
          learning_in_app: defaultPrefs.learning.inApp,
          achievements_email: defaultPrefs.achievements.email,
          achievements_in_app: defaultPrefs.achievements.inApp,
          security_email: defaultPrefs.security.email,
          security_in_app: defaultPrefs.security.inApp,
          marketing_email: defaultPrefs.marketing.email,
          marketing_in_app: defaultPrefs.marketing.inApp,
          preferred_reminder_hour: defaultPrefs.preferredReminderHour,
        },
        timezone: (userRow)?.timezone || 'UTC',
      })
    }

    const typedPref = prefRow as Record<string, unknown>
    return NextResponse.json({
      success: true,
      preferences: {
        ...prefRow,
        in_app_enabled: typedPref.all_in_app ?? typedPref.in_app_enabled ?? true,
        email_enabled: typedPref.all_email ?? typedPref.email_enabled ?? true,
      },
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
    body: notificationPreferencesUpdateSchema,
  },
  async ({ actor, body }) => {
    const authUserId = requireUserId(actor)

  try {
    const supabase = createServiceRoleClient()

    // Normalize field names between UI form contract and database schema
    const {
      in_app_enabled,
      email_enabled,
      ...rest
    } = body

    // The schema is strict, so `rest` holds only preference columns. user_id is
    // still set last so nothing in the body can ever point the write at another row.
    const updatePayload: Record<string, unknown> = {
      ...rest,
      user_id: authUserId,
      updated_at: new Date().toISOString(),
    }

    if (in_app_enabled !== undefined) {
      updatePayload.all_in_app = in_app_enabled
    }
    if (email_enabled !== undefined) {
      updatePayload.all_email = email_enabled
    }

    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert(updatePayload as never, { onConflict: 'user_id' })

    if (error) {
      void logSystemError({
        severity: 'error',
        category: 'db',
        operation: 'settings.notifications.update_preferences',
        message: `Error updating preferences: ${error.message}`,
        userId: authUserId,
        details: { error: error.message },
      })
      throw new RouteError(500, 'SERVER_ERROR', 'Failed to update notification preferences')
    }

    return NextResponse.json({ success: true, updated: body })
  } catch (err) {
    // Rethrown: the wrapper records the incident and returns generic copy with an
    // errorId. This branch previously sent err.message to the client.
    throw err
  }
  }
)
