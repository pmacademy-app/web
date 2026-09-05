/**
 * Email template variable catalog + pure helpers.
 *
 * Deliberately isomorphic (no server-only imports) so it can be shared by
 * BOTH the server-side communications service (preview/test-send rendering)
 * AND the client-side template editor (variable picker, validation) —
 * previously the editor kept its own separate, slightly-drifted copy of the
 * sample variables, which this file eliminates as the single source of truth.
 */
import { BRAND } from '@/lib/brand'

export interface AdminTemplateVariable {
  name: string
  description: string
  sample: string
}

/** Sample values used for preview rendering and admin test sends. */
export const TEMPLATE_SAMPLE_VARIABLES: Record<string, unknown> = {
  userName: 'Aditya',
  email: 'aditya@example.com',
  confirmationUrl: `${BRAND.siteUrl}/api/auth/callback?token_hash=test_token_hash&type=signup`,
  resetUrl: `${BRAND.siteUrl}/reset-password?token=test_reset_token`,
  verificationUrl: `${BRAND.siteUrl}/verify/PMA-2026-TEST01`,
  moduleName: 'Product Strategy & Vision',
  moduleSlug: 'product-strategy',
  badgeName: 'Visionary Strategist',
  badgeDescription: 'Completed the Product Strategy module',
  badgeIcon: '🏅',
  newLevel: 5,
  levelTitle: 'Senior Product Manager',
  totalXp: 1250,
  certificateCode: 'PMA-2026-TEST01',
  portfolioUrl: `${BRAND.siteUrl}/p/aditya`,
  weeklyXp: 450,
  lessonsCompleted: 8,
  streakDays: 12,
  currentStreak: 12,
  dueCount: 5,
  xpBonus: 200,
  daysStudiedThisWeek: 5,
  lessonsCompletedThisWeek: 8,
  xpEarnedThisWeek: 450,
  appUrl: BRAND.siteUrl,
}

/** Curated catalog of variables available to email templates. */
export const TEMPLATE_VARIABLE_CATALOG: AdminTemplateVariable[] = [
  { name: 'userName', description: 'Recipient display name', sample: 'Aditya' },
  { name: 'email', description: 'Recipient email address', sample: 'aditya@example.com' },
  { name: 'appUrl', description: 'Application base URL', sample: BRAND.siteUrl },
  { name: 'confirmationUrl', description: 'Email verification link', sample: `${BRAND.siteUrl}/api/auth/callback?token_hash=…` },
  { name: 'resetUrl', description: 'Password reset link', sample: `${BRAND.siteUrl}/reset-password?token=…` },
  { name: 'verificationUrl', description: 'Certificate verification link', sample: `${BRAND.siteUrl}/verify/PMA-2026-…` },
  { name: 'moduleName', description: 'Completed module name', sample: 'Product Strategy & Vision' },
  { name: 'moduleSlug', description: 'Module URL slug', sample: 'product-strategy' },
  { name: 'badgeName', description: 'Earned badge name', sample: 'Visionary Strategist' },
  { name: 'badgeDescription', description: 'Earned badge description', sample: 'Completed the strategy module' },
  { name: 'newLevel', description: 'New XP level reached', sample: '5' },
  { name: 'levelTitle', description: 'Level title', sample: 'Senior Product Manager' },
  { name: 'certificateCode', description: 'Certificate credential ID', sample: 'PMA-2026-TEST01' },
  { name: 'portfolioUrl', description: 'Public portfolio URL', sample: `${BRAND.siteUrl}/p/aditya` },
  { name: 'weeklyXp', description: 'XP earned this week', sample: '450' },
  { name: 'lessonsCompleted', description: 'Lessons completed this week', sample: '8' },
  { name: 'streakDays', description: 'Current streak length', sample: '12' },
  { name: 'currentStreak', description: 'Current streak length', sample: '12' },
  { name: 'dueCount', description: 'Flashcards due for review', sample: '5' },
  { name: 'xpBonus', description: 'Module completion XP bonus', sample: '200' },
  { name: 'totalXp', description: 'Cumulative XP', sample: '1250' },
  { name: 'daysStudiedThisWeek', description: 'Days studied this week', sample: '5' },
  { name: 'lessonsCompletedThisWeek', description: 'Lessons completed this week', sample: '8' },
  { name: 'xpEarnedThisWeek', description: 'XP earned this week', sample: '450' },
  { name: 'unsubscribeToken', description: 'Per-recipient unsubscribe token', sample: '…' },
]

const VARIABLE_TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Extracts every `{{variableName}}` token referenced in a string (subject or HTML body). */
export function extractVariableTokens(text: string): string[] {
  if (!text) return []
  const found = new Set<string>()
  let match: RegExpExecArray | null
  const pattern = new RegExp(VARIABLE_TOKEN_PATTERN)
  while ((match = pattern.exec(text)) !== null) {
    found.add(match[1])
  }
  return [...found]
}

/**
 * Returns variable names referenced in `text` that are NOT in `knownNames` —
 * i.e. likely typos or variables the notification system has no data source
 * for. Used to warn admins before they save/publish/send a template.
 */
export function findUnknownVariables(text: string, knownNames: string[]): string[] {
  const known = new Set(knownNames)
  return extractVariableTokens(text).filter((name) => !known.has(name))
}
