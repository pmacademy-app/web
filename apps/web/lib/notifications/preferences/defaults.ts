import type { UserNotificationPreferences } from './types'
import type { NotificationCategory, NotificationChannel } from '../types'

export function createDefaultNotificationPreferences(userId: string): UserNotificationPreferences {
  return {
    userId,
    allNotifications: true,
    allEmail: true,
    allInApp: true,
    security: { email: true, inApp: true },
    learning: { email: true, inApp: true },
    achievements: { email: true, inApp: true },
    portfolio: { email: true, inApp: true },
    certificates: { email: true, inApp: true },
    productUpdates: { email: true, inApp: true },
    marketing: { email: false, inApp: false }, // Explicit opt-in
    preferredReminderHour: 9,
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
