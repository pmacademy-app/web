import type { NotificationEventDefinition } from '../types'
import type {
  LessonCompletedPayload,
  ModuleCompletedPayload,
  QuizCompletedPayload,
  ReviewCompletedPayload,
  BadgeEarnedPayload,
  XpLevelUpPayload,
  StreakUpdatedPayload,
  PortfolioPublishedPayload,
  CertificateGeneratedPayload,
  CapstoneSubmittedPayload,
  UserRegisteredPayload,
  UserVerifiedPayload,
  PasswordResetRequestedPayload,
} from './types'

export * from './types'

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null
}

export const EVENT_DEFINITIONS: Record<string, NotificationEventDefinition> = {
  'lesson.completed': {
    eventName: 'lesson.completed',
    category: 'learning',
    defaultPriority: 'medium',
    description: 'Triggered when a learner completes all sections of a lesson',
    validatePayload: (p): p is LessonCompletedPayload =>
      isObject(p) && typeof p.lessonId === 'string' && typeof p.xpEarned === 'number',
  },
  'module.completed': {
    eventName: 'module.completed',
    category: 'learning',
    defaultPriority: 'medium',
    description: 'Triggered when a learner completes the final lesson of a module',
    validatePayload: (p): p is ModuleCompletedPayload =>
      isObject(p) && typeof p.moduleSlug === 'string',
  },
  'quiz.completed': {
    eventName: 'quiz.completed',
    category: 'learning',
    defaultPriority: 'low',
    description: 'Triggered upon completion of a lesson quiz attempt',
    validatePayload: (p): p is QuizCompletedPayload =>
      isObject(p) && typeof p.lessonId === 'string' && typeof p.score === 'number',
  },
  'review.completed': {
    eventName: 'review.completed',
    category: 'learning',
    defaultPriority: 'low',
    description: 'Triggered when a flashcard SRS review session is finished',
    validatePayload: (p): p is ReviewCompletedPayload =>
      isObject(p) && typeof p.cardsReviewedCount === 'number',
  },
  'badge.earned': {
    eventName: 'badge.earned',
    category: 'achievements',
    defaultPriority: 'medium',
    description: 'Triggered when a learner meets badge criteria and earns a badge',
    validatePayload: (p): p is BadgeEarnedPayload =>
      isObject(p) && typeof p.badgeKey === 'string' && typeof p.badgeName === 'string',
  },
  'xp.level_up': {
    eventName: 'xp.level_up',
    category: 'achievements',
    defaultPriority: 'high',
    description: 'Triggered when XP total crosses a new level boundary',
    validatePayload: (p): p is XpLevelUpPayload =>
      isObject(p) && typeof p.newLevel === 'number',
  },
  'streak.updated': {
    eventName: 'streak.updated',
    category: 'learning',
    defaultPriority: 'low',
    description: 'Triggered when daily streak is incremented',
    validatePayload: (p): p is StreakUpdatedPayload =>
      isObject(p) && typeof p.currentStreak === 'number',
  },
  'portfolio.published': {
    eventName: 'portfolio.published',
    category: 'portfolio',
    defaultPriority: 'medium',
    description: 'Triggered when a learner toggles their public portfolio link active',
    validatePayload: (p): p is PortfolioPublishedPayload =>
      isObject(p) && typeof p.username === 'string',
  },
  'certificate.generated': {
    eventName: 'certificate.generated',
    category: 'certificates',
    defaultPriority: 'high',
    description: 'Triggered when a module or full curriculum certificate is issued',
    validatePayload: (p): p is CertificateGeneratedPayload =>
      isObject(p) && typeof p.certificateCode === 'string',
  },
  'capstone.submitted': {
    eventName: 'capstone.submitted',
    category: 'portfolio',
    defaultPriority: 'medium',
    description: 'Triggered when a capstone deliverable is submitted',
    validatePayload: (p): p is CapstoneSubmittedPayload =>
      isObject(p) && typeof p.submissionId === 'string',
  },
  'user.registered': {
    eventName: 'user.registered',
    category: 'security',
    defaultPriority: 'high',
    description: 'Triggered when a new user account registration occurs',
    validatePayload: (p): p is UserRegisteredPayload =>
      isObject(p) && typeof p.email === 'string',
  },
  'user.verified': {
    eventName: 'user.verified',
    category: 'security',
    defaultPriority: 'high',
    description: 'Triggered when user email is verified',
    validatePayload: (p): p is UserVerifiedPayload =>
      isObject(p) && typeof p.email === 'string',
  },
  'password.reset_requested': {
    eventName: 'password.reset_requested',
    category: 'security',
    defaultPriority: 'critical',
    description: 'Triggered when password recovery flow is requested',
    validatePayload: (p): p is PasswordResetRequestedPayload =>
      isObject(p) && typeof p.email === 'string' && typeof p.resetTokenHash === 'string',
  },
}

export function validateEventPayload(eventName: string, payload: unknown): boolean {
  const def = EVENT_DEFINITIONS[eventName]
  if (!def) return false
  return def.validatePayload(payload)
}

export function getEventDefinition(eventName: string): NotificationEventDefinition | null {
  return EVENT_DEFINITIONS[eventName] || null
}
