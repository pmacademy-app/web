import type { UserNotificationPreferences } from './types'
import type { NotificationCategory, NotificationChannel } from '../types'

/**
 * Default notification preferences aligned with the finalized PM Academy communication strategy.
 *
 * Communication hierarchy:
 *   PRIMARY  → In-App Notifications (all learning events)
 *   SECONDARY → Email (Auth/Security, Major Milestones, Weekly Recap, Admin broadcasts only)
 *
 * Email is disabled by default for:
 *   - lesson.completed, quiz.completed, review.completed (In-App only)
 *   - badge.earned, xp.level_up, streak.* (In-App only)
 *
 * Email is enabled by default for:
 *   - Security: welcome, verify, password reset, suspicious login (always on)
 *   - Major milestones: module.completed, certificate.generated, portfolio.published
 *   - Weekly learning recap (max once/week, meaningful activity required)
 *   - Admin product announcements (manually triggered)
 */
export function createDefaultNotificationPreferences(userId: string): UserNotificationPreferences {
  return {
    userId,
    allNotifications: true,
    allEmail: true,
    allInApp: true,
    // Security: always email + in-app (non-negotiable)
    security: { email: true, inApp: true },
    // Learning events: In-App only. Email disabled (lesson/quiz/review/streak/flashcard are in-app)
    learning: { email: false, inApp: true },
    // Achievements: In-App only. Badge earned, XP level up are in-app.
    // Major module completion emails handled by certificates/portfolio channels.
    achievements: { email: false, inApp: true },
    // Portfolio published: email + in-app (major milestone)
    portfolio: { email: true, inApp: true },
    // Certificate generated: email + in-app (major milestone)
    certificates: { email: true, inApp: true },
    // Product updates / Admin broadcasts: email + in-app (manually initiated by admin)
    productUpdates: { email: true, inApp: true },
    // Marketing: explicit opt-in only, default OFF
    marketing: { email: false, inApp: false },
    preferredReminderHour: 9,
    preferredRecapDay: 0, // Sunday
    preferredRecapHour: 18, // 6 PM local
    timezone: 'UTC',
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Checks if a channel is permitted by the user's preferences for a given category.
 */
export function isChannelEnabledByPreferences(
  prefs: UserNotificationPreferences,
  category: NotificationCategory,
  channel: NotificationChannel
): boolean {
  if (!prefs.allNotifications) return false

  if (channel === 'email') {
    if (!prefs.allEmail) return false
    const catPref = prefs[categoryToProperty(category)]
    return catPref ? catPref.email : true
  }

  if (channel === 'in_app') {
    if (!prefs.allInApp) return false
    const catPref = prefs[categoryToProperty(category)]
    return catPref ? catPref.inApp : true
  }

  // Future channels (push, SMS, etc.) default to false unless explicitly configured
  return false
}

function categoryToProperty(
  category: NotificationCategory
): keyof Pick<
  UserNotificationPreferences,
  'security' | 'learning' | 'achievements' | 'portfolio' | 'certificates' | 'productUpdates' | 'marketing'
> {
  switch (category) {
    case 'security':
      return 'security'
    case 'learning':
      return 'learning'
    case 'achievements':
      return 'achievements'
    case 'portfolio':
      return 'portfolio'
    case 'certificates':
      return 'certificates'
    case 'product_updates':
      return 'productUpdates'
    case 'marketing':
      return 'marketing'
    default:
      return 'learning'
  }
}

/**
 * Maps a database row from `user_notification_preferences` to the application-level
 * `UserNotificationPreferences` structure. Falls back to defaults for any unconfigured fields.
 */
export function mapDbRowToNotificationPreferences(
  userId: string,
  row?: Record<string, unknown> | null
): UserNotificationPreferences {
  const defaults = createDefaultNotificationPreferences(userId)
  if (!row) {
    return defaults
  }

  const allNotifications =
    typeof row.all_notifications === 'boolean'
      ? row.all_notifications
      : typeof row.allNotifications === 'boolean'
      ? row.allNotifications
      : defaults.allNotifications

  const allEmail =
    typeof row.all_email === 'boolean'
      ? row.all_email
      : typeof row.email_enabled === 'boolean'
      ? row.email_enabled
      : typeof row.allEmail === 'boolean'
      ? row.allEmail
      : defaults.allEmail

  const allInApp =
    typeof row.all_in_app === 'boolean'
      ? row.all_in_app
      : typeof row.in_app_enabled === 'boolean'
      ? row.in_app_enabled
      : typeof row.allInApp === 'boolean'
      ? row.allInApp
      : defaults.allInApp

  const resolveCategory = (
    prefix: string,
    defaultVal: { email: boolean; inApp: boolean }
  ) => {
    const emailVal =
      typeof row[`${prefix}_email`] === 'boolean'
        ? (row[`${prefix}_email`] as boolean)
        : defaultVal.email
    const inAppVal =
      typeof row[`${prefix}_in_app`] === 'boolean'
        ? (row[`${prefix}_in_app`] as boolean)
        : defaultVal.inApp
    return { email: emailVal, inApp: inAppVal }
  }

  return {
    userId,
    allNotifications,
    allEmail,
    allInApp,
    security: { email: true, inApp: true }, // Security is always non-negotiable
    learning: resolveCategory('learning', defaults.learning),
    achievements: resolveCategory('achievements', defaults.achievements),
    portfolio: resolveCategory('portfolio', defaults.portfolio),
    certificates: resolveCategory('certificates', defaults.certificates),
    productUpdates: resolveCategory('product_updates', defaults.productUpdates),
    marketing: resolveCategory('marketing', defaults.marketing),
    preferredReminderHour:
      typeof row.preferred_reminder_hour === 'number'
        ? (row.preferred_reminder_hour as number)
        : defaults.preferredReminderHour,
    preferredRecapDay: defaults.preferredRecapDay,
    preferredRecapHour: defaults.preferredRecapHour,
    timezone: typeof row.timezone === 'string' ? (row.timezone as string) : defaults.timezone,
    unsubscribeToken:
      typeof row.unsubscribe_token === 'string' ? (row.unsubscribe_token as string) : undefined,
    updatedAt:
      typeof row.updated_at === 'string' ? (row.updated_at as string) : defaults.updatedAt,
  }
}

/**
 * Resolves persisted notification preferences for a user from `user_notification_preferences`.
 * If no record is found or an error occurs, cleanly falls back to default preferences.
 */
export async function getResolvedUserNotificationPreferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<UserNotificationPreferences> {
  const defaults = createDefaultNotificationPreferences(userId)
  if (!userId || !supabase) return defaults

  try {
    const { data: row, error } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !row) {
      return defaults
    }

    return mapDbRowToNotificationPreferences(userId, row as Record<string, unknown>)
  } catch {
    return defaults
  }
}

/**
 * Resolves persisted notification preferences for multiple users in a single query.
 * Prevents N+1 database queries during batch queue processing or broadcasts.
 */
export async function getBatchUserNotificationPreferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userIds: string[]
): Promise<Map<string, UserNotificationPreferences>> {
  const resultMap = new Map<string, UserNotificationPreferences>()
  if (!userIds || userIds.length === 0) return resultMap

  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  uniqueIds.forEach((id) => {
    resultMap.set(id, createDefaultNotificationPreferences(id))
  })

  if (!supabase) return resultMap

  try {
    const { data: rows, error } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .in('user_id', uniqueIds)

    if (!error && rows) {
      for (const row of rows as Record<string, unknown>[]) {
        const uid = String(row.user_id)
        resultMap.set(uid, mapDbRowToNotificationPreferences(uid, row))
      }
    }
  } catch {
    // Graceful fallback to default preferences already in map
  }

  return resultMap
}

