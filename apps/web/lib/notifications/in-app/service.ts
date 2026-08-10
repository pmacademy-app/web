import { createServerSupabaseClient } from '@/lib/supabase'
import { globalFeatureFlagService } from '../feature-flags/service'
import {
  createDefaultNotificationPreferences,
  isChannelEnabledByPreferences,
} from '../preferences/defaults'
import { PRIORITY_MATRIX } from '../constants'
import type { EventEnvelope } from '../types'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface InAppNotificationResult {
  success: boolean
  id?: string
  reason?: string
}

export interface InAppNotificationWriteParams {
  userId: string
  eventId?: string
  category: string
  title: string
  body: string
  actionUrl?: string
  priority?: keyof typeof PRIORITY_MATRIX
}

/**
 * Persists an in-app notification row for a user.
 *
 * Follows the platform's communication hierarchy: In-App is the primary
 * channel for learning lifecycle events. This write-path:
 *  1. Checks the IN_APP_NOTIFICATIONS_ENABLED feature flag.
 *  2. Evaluates the user's per-category in-app preferences.
 *  3. Inserts a row into the `in_app_notifications` table (RLS-scoped, service role bypasses RLS).
 *
 * Gracefully no-ops when Supabase env vars are not configured (e.g. unit tests).
 */
export async function createInAppNotification(params: InAppNotificationWriteParams): Promise<InAppNotificationResult> {
  try {
    const inAppEnabled = globalFeatureFlagService.isEnabled('IN_APP_NOTIFICATIONS_ENABLED')
    if (!inAppEnabled) {
      return { success: false, reason: 'in_app_notifications_disabled' }
    }

    const prefs = createDefaultNotificationPreferences(params.userId)
    const isAllowed = isChannelEnabledByPreferences(prefs, params.category as never, 'in_app')
    if (!isAllowed) {
      return { success: false, reason: `user_disabled_${params.category}_in_app` }
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { success: false, reason: 'supabase_env_missing' }
    }

    const priorityNumber = PRIORITY_MATRIX[params.priority || 'medium'].numericValue

    const supabase = createServerSupabaseClient()
    const { data, error } = (await (supabase
      .from('in_app_notifications') as unknown as DBChain)
      .insert({
        user_id: params.userId,
        event_id: (params.eventId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.eventId)) ? params.eventId : null,
        category: params.category,
        title: params.title,
        body: params.body,
        action_url: params.actionUrl || null,
        priority: priorityNumber,
        is_read: false,
      })
      .select()
      .single()) as unknown as { data: { id: string } | null; error: unknown }

    if (error || !data) {
      console.error('[in-app/service] Error persisting in-app notification:', error)
      return { success: false, reason: 'insert_failed' }
    }

    return { success: true, id: data.id }
  } catch (err) {
    console.error('[in-app/service] createInAppNotification failed:', err)
    return { success: false, reason: 'error' }
  }
}

/**
 * Builds the display content (title / body / deep-link) for an in-app notification
 * from a dispatched event envelope.
 */
export function buildInAppContentFromEvent(event: EventEnvelope<Record<string, unknown>>): {
  title: string
  body: string
  actionUrl?: string
} {
  const payload = event.payload || {}
  const { userName } = event

  switch (event.event) {
    case 'lesson.completed': {
      const title = String(payload.lessonTitle || 'Lesson completed')
      return { title, body: `${userName || 'You'} completed "${title}" (+${payload.xpEarned || 0} XP).`, actionUrl: '/academy' }
    }
    case 'module.completed': {
      const name = String(payload.moduleName || 'Module')
      return { title: `Module complete: ${name}`, body: `You completed the ${name} module. ${payload.xpBonusEarned || 0} bonus XP earned.`, actionUrl: '/academy' }
    }
    case 'quiz.completed': {
      return { title: 'Quiz complete', body: `You scored ${payload.score || 0} on the ${String(payload.lessonId || 'lesson')} quiz.`, actionUrl: '/academy' }
    }
    case 'review.completed': {
      return { title: 'Review session finished', body: `${payload.cardsReviewedCount || 0} cards reviewed with +${payload.xpEarned || 0} XP.`, actionUrl: '/review' }
    }
    case 'badge.earned': {
      return { title: `Badge earned: ${String(payload.badgeName || 'New badge')}`, body: String(payload.badgeDescription || 'Congratulations on your new achievement!'), actionUrl: '/badges' }
    }
    case 'xp.level_up': {
      return { title: `Level ${payload.newLevel} reached!`, body: `You advanced to level ${payload.newLevel} (${String(payload.levelTitle || 'PM')}). Keep it up!`, actionUrl: '/progress' }
    }
    case 'streak.updated': {
      return { title: `Welcome back — day ${payload.currentStreak || 1}!`, body: 'Your study streak continues. Keep the momentum going.', actionUrl: '/dashboard' }
    }
    case 'portfolio.published': {
      return { title: 'Public portfolio published', body: `Your public portfolio is live at /${String(payload.username || '')}.`, actionUrl: `/p/${String(payload.username || '')}` }
    }
    case 'certificate.generated': {
      const code = String(payload.certificateCode || '')
      return { title: 'Certificate issued', body: `Your official certificate is ready. Verify it online with code ${code}.`, actionUrl: code ? `/verify/${code}` : '/progress' }
    }
    case 'capstone.submitted': {
      return { title: 'Capstone submitted', body: `Your ${String(payload.moduleTitle || 'module')} capstone has been submitted for review.`, actionUrl: '/capstones' }
    }
    case 'user.registered': {
      return { title: 'Welcome to PM Academy', body: `Thanks for joining, ${userName || 'learner'}! Start your first lesson now.`, actionUrl: '/academy' }
    }
    case 'user.verified': {
      return { title: 'Email verified', body: 'Your email address has been confirmed. Your account is fully active.', actionUrl: '/dashboard' }
    }
    case 'password.reset_requested': {
      return { title: 'Password reset requested', body: 'We sent a reset link to your email. Use it within 30 minutes.', actionUrl: '/auth/reset-password' }
    }
    case 'srs.review_due': {
      return { title: 'Flashcards due for review', body: 'Your spaced-repetition queue has cards ready. Keep your memory fresh!', actionUrl: '/review' }
    }
    default:
      return { title: 'PM Academy update', body: 'You have a new update in your notification center.', actionUrl: '/dashboard' }
  }
}