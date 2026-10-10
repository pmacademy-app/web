import { parseNotificationSecondaryAction, type NotificationSecondaryAction } from './secondary-action'
import { createServiceRoleClient } from '@/lib/supabase'
import { globalFeatureFlagService } from '../feature-flags/service'
import {
  createDefaultNotificationPreferences,
  isChannelEnabledByPreferences,
  getResolvedUserNotificationPreferences,
} from '../preferences/defaults'
import type { UserNotificationPreferences } from '../preferences/types'
import { PRIORITY_MATRIX } from '../constants'
import type { EventEnvelope } from '../types'
import { PORTFOLIO_SETTINGS_HREF } from '@/lib/portfolio'
import { isTestCertificateCode } from '@/lib/certificates'
import { buildLinkedInCertificationUrl } from '@/lib/certificates/linkedin-url'

/** Spreads a second action into in-app content only when there is a valid one (Growth R5 B2). */
function withAction(action: NotificationSecondaryAction | null): { secondaryAction?: NotificationSecondaryAction } {
  const valid = parseNotificationSecondaryAction(action)
  return valid ? { secondaryAction: valid } : {}
}

/** Share the learner's portfolio; null without a usable username (the parser rejects it). */
function shareAction(username: string, context: 'portfolio' | 'fellow'): NotificationSecondaryAction | null {
  const trimmed = username.trim()
  return trimmed ? { kind: 'share_portfolio', label: 'Share portfolio', username: trimmed, context } : null
}

/** LinkedIn add-to-profile for a real certificate, from the certificate.generated payload. */
function linkedInAction(payload: Record<string, unknown>, code: string): NotificationSecondaryAction {
  return {
    kind: 'linkedin_add_to_profile',
    label: 'Add to LinkedIn',
    url: buildLinkedInCertificationUrl({
      certificateCode: code,
      careerTitle: typeof payload.careerTitle === 'string' ? payload.careerTitle : '',
      type: payload.certificateType === 'full_curriculum' ? 'full_curriculum' : 'module',
      issuedAt: typeof payload.issuedAt === 'string' ? payload.issuedAt : undefined,
      verificationUrl: typeof payload.verificationUrl === 'string' ? payload.verificationUrl : '',
    }),
  }
}

/** `/p/<username>` when the payload names a public portfolio, otherwise null. */
function publicPortfolioPath(payload: Record<string, unknown>): string | null {
  const username = typeof payload.username === 'string' ? payload.username.trim() : ''
  if (!username || payload.isPortfolioPublic !== true) return null
  return `/p/${encodeURIComponent(username)}`
}

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
  idempotencyKey?: string
  category: string
  title: string
  body: string
  actionUrl?: string
  /** Optional second action (e.g. share); dropped unless it is a valid shape. */
  secondaryAction?: NotificationSecondaryAction | null
  priority?: keyof typeof PRIORITY_MATRIX
  preloadedPreferences?: UserNotificationPreferences
}

/**
 * Persists an in-app notification row for a user.
 *
 * Follows the platform's communication hierarchy: In-App is the primary
 * channel for learning lifecycle events. This write-path:
 *  1. Checks the IN_APP_NOTIFICATIONS_ENABLED feature flag.
 *  2. Evaluates the user's per-category in-app preferences.
 *  3. Verifies idempotency key to prevent duplicate notification creation.
 *  4. Inserts a row into the `in_app_notifications` table (RLS-scoped, service role bypasses RLS).
 *
 * Gracefully no-ops when Supabase env vars are not configured (e.g. unit tests).
 */
export async function createInAppNotification(params: InAppNotificationWriteParams): Promise<InAppNotificationResult> {
  try {
    const inAppEnabled = await globalFeatureFlagService.isEnabledAsync('IN_APP_NOTIFICATIONS_ENABLED')
    if (!inAppEnabled) {
      return { success: false, reason: 'in_app_notifications_disabled' }
    }

    let supabaseClient: ReturnType<typeof createServiceRoleClient> | null = null
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        supabaseClient = createServiceRoleClient()
      } catch {
        // fallback in mocked or isolated test run
      }
    }

    const prefs =
      params.preloadedPreferences ||
      (supabaseClient
        ? await getResolvedUserNotificationPreferences(supabaseClient, params.userId)
        : createDefaultNotificationPreferences(params.userId))

    const isAllowed = isChannelEnabledByPreferences(prefs, params.category as never, 'in_app')
    if (!isAllowed) {
      return { success: false, reason: `user_disabled_${params.category}_in_app` }
    }

    if (!supabaseClient) {
      return { success: false, reason: 'supabase_env_missing' }
    }

    const priorityNumber = PRIORITY_MATRIX[params.priority || 'medium'].numericValue
    const idempotencyKey = params.idempotencyKey || params.eventId || null

    const supabase = supabaseClient

    // 3. Idempotency verification: avoid creating duplicate in-app rows
    if (idempotencyKey) {
      const { data: existing } = (await (supabase
        .from('in_app_notifications') as unknown as DBChain)
        .select('id')
        .eq('user_id', params.userId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()) as unknown as { data: { id: string } | null }

      if (existing && existing.id) {
        return { success: true, id: existing.id, reason: 'duplicate_idempotent' }
      }
    }

    const { data, error } = (await (supabase
      .from('in_app_notifications') as unknown as DBChain)
      .insert({
        user_id: params.userId,
        event_id: (params.eventId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.eventId)) ? params.eventId : null,
        idempotency_key: idempotencyKey,
        category: params.category,
        title: params.title,
        body: params.body,
        action_url: params.actionUrl || null,
        secondary_action: parseNotificationSecondaryAction(params.secondaryAction),
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
  secondaryAction?: NotificationSecondaryAction
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
      return { title: `Module complete: ${name}`, body: `You completed every lesson in ${name}.`, actionUrl: '/academy' }
    }
    case 'quiz.completed': {
      const rawTitle = String(payload.lessonTitle || '')
      // Guard against raw internal IDs like 'les_4kpbq6' leaking if passed as lessonTitle or fallback
      const cleanTitle = rawTitle && !/^les_[a-z0-9]+$/i.test(rawTitle) ? rawTitle : 'Lesson'
      const actionUrl =
        payload.moduleSlug && payload.lessonId
          ? `/academy/${String(payload.moduleSlug)}/${String(payload.lessonId)}`
          : '/academy'
      return { title: 'Quiz complete', body: `You scored ${payload.score || 0} on the ${cleanTitle} quiz.`, actionUrl }
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
      return { title: `Welcome back: Day ${payload.currentStreak || 1}!`, body: 'Your study streak continues. Keep the momentum going.', actionUrl: '/dashboard' }
    }
    case 'portfolio.published': {
      return {
        title: 'Public portfolio published',
        body: `Your public portfolio is live at /${String(payload.username || '')}.`,
        actionUrl: `/p/${String(payload.username || '')}`,
        ...withAction(shareAction(String(payload.username || ''), 'portfolio')),
      }
    }
    case 'certificate.generated': {
      const code = String(payload.certificateCode || '')
      return {
        title: 'Certificate issued',
        body: `Your official certificate is ready. Verify it online with code ${code}.`,
        actionUrl: '/progress/certificates',
        // Admin TEST- certificates are never a learner's credential.
        ...withAction(code && !isTestCertificateCode(code) ? linkedInAction(payload, code) : null),
      }
    }
    case 'capstone.submitted': {
      return { title: 'Capstone submitted', body: `Your ${String(payload.moduleTitle || 'module')} capstone has been submitted for review.`, actionUrl: '/capstones' }
    }
    case 'capstone.reviewed': {
      const moduleTitle = String(payload.moduleTitle || 'module')
      const moduleSlug = String(payload.moduleSlug || '')
      const published = payload.isPublished === true
      const capstoneUrl = moduleSlug ? `/capstones/${moduleSlug}` : '/capstones'
      // A published review is now visible on the public portfolio, so send the learner there
      // when we know it is public; otherwise (or when not published) keep the capstone page.
      const portfolioPath = published ? publicPortfolioPath(payload) : null
      return {
        title: 'Capstone reviewed',
        body: published
          ? `The Prodily team reviewed your ${moduleTitle} capstone and published it to your portfolio.`
          : `The Prodily team reviewed your ${moduleTitle} capstone. It stays in your portfolio; the public listing is off for now.`,
        actionUrl: portfolioPath ?? capstoneUrl,
        ...withAction(portfolioPath ? shareAction(String(payload.username || ''), 'portfolio') : null),
      }
    }
    case 'fellow.granted': {
      // Fellow shares the portfolio (Fellow wording) when it is public, otherwise asks to publish
      // it. Never a LinkedIn add-to-profile action: Fellow is not a credential (ADR-011).
      const portfolioPath = publicPortfolioPath(payload)
      return {
        title: 'You are now a PM Fellow!',
        body: 'Congratulations! Your PM Fellow badge is now live on your public portfolio.',
        actionUrl: portfolioPath ?? PORTFOLIO_SETTINGS_HREF,
        ...withAction(
          portfolioPath
            ? shareAction(String(payload.username || ''), 'fellow')
            : { kind: 'link', label: 'Publish portfolio', href: PORTFOLIO_SETTINGS_HREF },
        ),
      }
    }
    case 'user.registered': {
      return { title: 'Welcome to Prodily', body: `Thanks for joining, ${userName || 'learner'}! Start your first lesson now.`, actionUrl: '/academy' }
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
      return { title: 'Prodily update', body: 'You have a new update in your notification center.', actionUrl: '/dashboard' }
  }
}
