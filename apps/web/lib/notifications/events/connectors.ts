import type { EventEnvelope } from '../types'
import { globalNotificationDispatcher } from '../dispatcher'
import { enqueueNotificationItem } from '../queue/processor'
import { createInAppNotification, buildInAppContentFromEvent } from '../in-app/service'
import { BRAND } from '@/lib/brand'

let isConnectorsInitialized = false

/**
 * Registers default system event handlers that map Notification Events to
 * In-App rows (primary channel) and Email Queue entries (secondary channel).
 */
export function initializeNotificationConnectors(force: boolean = false): void {
  if (isConnectorsInitialized && !force) return
  isConnectorsInitialized = true

  const d = globalNotificationDispatcher

  // ── In-App write handlers (primary channel for all platform events) ─────────
  const IN_APP_EVENTS = [
    'user.registered',
    'user.verified',
    'password.reset_requested',
    'module.completed',
    'badge.earned',
    'xp.level_up',
    'certificate.generated',
    'portfolio.published',
    'lesson.completed',
    'srs.review_due',
    'capstone.submitted',
    'quiz.completed',
    'streak.updated',
    'review.completed',
  ] as const

  for (const eventType of IN_APP_EVENTS) {
    d.registerHandler(
      eventType,
      `connector.in_app.${eventType}`,
      async (event: EventEnvelope<Record<string, unknown>>) => {
        const content = buildInAppContentFromEvent(event)
        await createInAppNotification({
          userId: event.userId,
          eventId: event.id,
          idempotencyKey: event.id,
          category: event.category,
          title: content.title,
          body: content.body,
          actionUrl: content.actionUrl,
          priority: event.priority,
        })
      }
    )
  }

  // 1. Auth: user.registered -> auth.welcome
  d.registerHandler('user.registered', 'connector.auth.welcome', async (event: EventEnvelope<Record<string, unknown>>) => {
    await enqueueNotificationItem({
      userId: event.userId,
      toEmail: event.userEmail,
      toName: event.userName,
      channel: 'email',
      templateKey: 'auth.welcome',
      templateVariables: {
        userName: event.userName || event.payload.name || 'Learner',
      },
      eventId: event.id,
      eventType: event.event,
      category: 'security',
      priorityLevel: 'high',
    })
  })

  // Note: user.verified is decoupled from sending auth.verify_email (which sent a verification link).
  // Verification emails are delivered via Supabase Auth hook (/api/auth/send-email-hook).
  // user.verified is handled strictly as an in-app notification upon confirmation.

  // 3. Auth: password.reset_requested -> auth.password_reset
  d.registerHandler('password.reset_requested', 'connector.auth.password_reset', async (event: EventEnvelope<Record<string, unknown>>) => {
    await enqueueNotificationItem({
      userId: event.userId,
      toEmail: event.userEmail,
      toName: event.userName,
      channel: 'email',
      templateKey: 'auth.password_reset',
      templateVariables: {
        userName: event.userName || 'Learner',
        resetUrl: event.payload.resetUrl || `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/auth/reset-password`,
      },
      eventId: event.id,
      eventType: event.event,
      category: 'security',
      priorityLevel: 'critical',
    })
  })

  // 4. Learning: module.completed -> learning.module_complete
  d.registerHandler('module.completed', 'connector.learning.module_complete', async (event: EventEnvelope<Record<string, unknown>>) => {
    await enqueueNotificationItem({
      userId: event.userId,
      toEmail: event.userEmail,
      toName: event.userName,
      channel: 'email',
      templateKey: 'learning.module_complete',
      templateVariables: {
        userName: event.userName || 'Learner',
        moduleName: event.payload.moduleName || 'Module',
        moduleSlug: event.payload.moduleSlug || 'foundations',
        xpBonus: event.payload.xpBonusEarned || 200,
      },
      eventId: event.id,
      eventType: event.event,
      category: 'learning',
      priorityLevel: 'medium',
    })
  })

  // 5. Achievement: badge.earned -> achievement.badge_earned
  d.registerHandler('badge.earned', 'connector.achievement.badge_earned', async (event: EventEnvelope<Record<string, unknown>>) => {
    await enqueueNotificationItem({
      userId: event.userId,
      toEmail: event.userEmail,
      toName: event.userName,
      channel: 'email',
      templateKey: 'achievement.badge_earned',
      templateVariables: {
        userName: event.userName || 'Learner',
        badgeName: event.payload.badgeName,
        badgeDescription: event.payload.badgeDescription,
        badgeIcon: event.payload.badgeIcon || '🏅',
      },
      eventId: event.id,
      eventType: event.event,
      category: 'achievements',
      priorityLevel: 'medium',
    })
  })

  // 6. Achievement: xp.level_up -> achievement.level_up
  d.registerHandler('xp.level_up', 'connector.achievement.level_up', async (event: EventEnvelope<Record<string, unknown>>) => {
    await enqueueNotificationItem({
      userId: event.userId,
      toEmail: event.userEmail,
      toName: event.userName,
      channel: 'email',
      templateKey: 'achievement.level_up',
      templateVariables: {
        userName: event.userName || 'Learner',
        newLevel: event.payload.newLevel,
        levelTitle: event.payload.levelTitle || 'PM',
        totalXp: event.payload.totalXp,
      },
      eventId: event.id,
      eventType: event.event,
      category: 'achievements',
      priorityLevel: 'high',
    })
  })

  // 7. Achievement: certificate.generated -> achievement.certificate
  d.registerHandler('certificate.generated', 'connector.achievement.certificate', async (event: EventEnvelope<Record<string, unknown>>) => {
    await enqueueNotificationItem({
      userId: event.userId,
      toEmail: event.userEmail,
      toName: event.userName,
      channel: 'email',
      templateKey: 'achievement.certificate',
      templateVariables: {
        userName: event.userName || 'Learner',
        certificateCode: event.payload.certificateCode,
        verificationUrl: event.payload.verificationUrl || `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/verify/${event.payload.certificateCode}`,
      },
      eventId: event.id,
      eventType: event.event,
      category: 'certificates',
      priorityLevel: 'high',
    })
  })

  // 8. Achievement: portfolio.published -> achievement.portfolio_published
  d.registerHandler('portfolio.published', 'connector.achievement.portfolio_published', async (event: EventEnvelope<Record<string, unknown>>) => {
    await enqueueNotificationItem({
      userId: event.userId,
      toEmail: event.userEmail,
      toName: event.userName,
      channel: 'email',
      templateKey: 'achievement.portfolio_published',
      templateVariables: {
        userName: event.userName || 'Learner',
        username: event.payload.username,
        portfolioUrl: event.payload.portfolioUrl || `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/p/${event.payload.username}`,
      },
      eventId: event.id,
      eventType: event.event,
      category: 'portfolio',
      priorityLevel: 'medium',
    })
  })
}
