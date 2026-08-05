import React from 'react'
import { WelcomeEmail } from './templates/auth/Welcome'
import { VerifyEmail } from './templates/auth/VerifyEmail'
import { PasswordReset } from './templates/auth/PasswordReset'
import { ModuleCompletedEmail } from './templates/learning/ModuleCompleted'
import { WeeklyRecap } from './templates/learning/WeeklyRecap'
import { BadgeEarnedEmail } from './templates/achievement/BadgeEarned'
import { LevelUpEmail } from './templates/achievement/LevelUp'
import { CertificateEarned } from './templates/achievement/CertificateEarned'
import { PortfolioPublished } from './templates/achievement/PortfolioPublished'

export const EMAIL_TEMPLATE_MAP: Record<string, { component: React.ComponentType<Record<string, unknown>>; subjectLine: string }> = {
  'auth.welcome': {
    component: WelcomeEmail,
    subjectLine: 'Welcome to PM Academy! 🎉',
  },
  'auth.verify_email': {
    component: VerifyEmail,
    subjectLine: 'Confirm your PM Academy email address',
  },
  'auth.password_reset': {
    component: PasswordReset,
    subjectLine: 'Reset your PM Academy password',
  },
  'learning.module_complete': {
    component: ModuleCompletedEmail,
    subjectLine: 'Module Complete: {{moduleName}}! 🏆',
  },
  'learning.weekly_recap': {
    component: WeeklyRecap,
    subjectLine: 'Your Week in PM Academy 📊',
  },
  'achievement.badge_earned': {
    component: BadgeEarnedEmail,
    subjectLine: 'New Badge Unlocked: {{badgeName}}! 🏅',
  },
  'achievement.level_up': {
    component: LevelUpEmail,
    subjectLine: 'Level Up Unlocked: Level {{newLevel}}! 🚀',
  },
  'achievement.certificate': {
    component: CertificateEarned,
    subjectLine: 'Your PM Academy Certificate is Ready! 🎓',
  },
  'achievement.portfolio_published': {
    component: PortfolioPublished,
    subjectLine: 'Your Public Portfolio is Live! 🌐',
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

  // Replace subject line variables e.g. {{badgeName}}
  let subject = entry.subjectLine
  for (const [k, v] of Object.entries(variables)) {
    subject = subject.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
  }

  return { html, text, subject }
}
