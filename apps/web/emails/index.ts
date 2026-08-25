import React from 'react'
import { WelcomeEmail } from './templates/auth/Welcome'
import { VerifyEmail } from './templates/auth/VerifyEmail'
import { PasswordReset } from './templates/auth/PasswordReset'
import { ModuleCompletedEmail } from './templates/learning/ModuleCompleted'
import { WeeklyRecap } from './templates/learning/WeeklyRecap'
import { DailyReminder } from './templates/learning/DailyReminder'
import { BadgeEarnedEmail } from './templates/achievement/BadgeEarned'
import { LevelUpEmail } from './templates/achievement/LevelUp'
import { CertificateEarned } from './templates/achievement/CertificateEarned'
import { PortfolioPublished } from './templates/achievement/PortfolioPublished'
import { DirectMessageEmail } from './templates/admin/DirectMessage'
import { BRAND } from '@/lib/brand'

export const EMAIL_TEMPLATE_MAP: Record<string, { component: React.ComponentType<Record<string, unknown>>; subjectLine: string }> = {
  // Critical Auth (Always On - Direct / Hook)
  'auth.verify_email': {
    component: VerifyEmail,
    subjectLine: `Confirm your ${BRAND.shortName} email address`,
  },
  'auth.password_reset': {
    component: PasswordReset,
    subjectLine: `Reset your ${BRAND.company} password`,
  },

  // Direct Admin Messages
  'admin.direct_message': {
    component: DirectMessageEmail,
    subjectLine: '{{subject}}',
  },

  // Optional Transactional Automations
  'auth.welcome': {
    component: WelcomeEmail,
    subjectLine: `Welcome to ${BRAND.company}!`,
  },
  'learning.module_complete': {
    component: ModuleCompletedEmail,
    subjectLine: 'Module Complete: {{moduleName}}!',
  },
  'achievement.badge_earned': {
    component: BadgeEarnedEmail,
    subjectLine: 'New Badge Unlocked: {{badgeName}}!',
  },
  'achievement.level_up': {
    component: LevelUpEmail,
    subjectLine: 'Level Up Unlocked: Level {{newLevel}}!',
  },
  'achievement.certificate': {
    component: CertificateEarned,
    subjectLine: `Your ${BRAND.company} Certificate is Ready!`,
  },
  'achievement.portfolio_published': {
    component: PortfolioPublished,
    subjectLine: 'Your Public Portfolio is Live!',
  },

  // Scheduled Digests & Reminders
  'learning.weekly_recap': {
    component: WeeklyRecap,
    subjectLine: `Your Week in ${BRAND.company}`,
  },
  'system.weekly_recap': {
    component: WeeklyRecap,
    subjectLine: `Your Week in ${BRAND.company}`,
  },
  'learning.daily_reminder': {
    component: DailyReminder,
    subjectLine: `Keep your learning streak alive on ${BRAND.shortName}!`,
  },
  'inactive.resume_learning': {
    component: WelcomeEmail,
    subjectLine: `Resume your learning path on ${BRAND.shortName}`,
  },
}

export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function renderEmailTemplate(
  templateKey: string,
  variables: Record<string, unknown>
): Promise<{ html: string; text: string; subject: string }> {
  const entry = EMAIL_TEMPLATE_MAP[templateKey]
  if (!entry) {
    throw new Error(`Email template '${templateKey}' is not registered in EMAIL_TEMPLATE_MAP.`)
  }

  const Component = entry.component
  const element = React.createElement(Component, variables)
  const { renderToStaticMarkup } = await import('react-dom/server')
  const rawHtml = renderToStaticMarkup(element)
  const html = `<!DOCTYPE html>${rawHtml}`
  const text = stripHtmlToPlainText(rawHtml)

  let subject = entry.subjectLine
  for (const [k, v] of Object.entries(variables)) {
    subject = subject.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
  }

  return { html, text, subject }
}
