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
