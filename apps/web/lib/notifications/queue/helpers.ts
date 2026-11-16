import type { QueuedNotificationItem, QueueStatus } from './types'

/**
 * Validates whether a status transition is permitted in the Queue lifecycle.
 */
export function isValidQueueStatusTransition(from: QueueStatus, to: QueueStatus): boolean {
  const allowedMap: Record<QueueStatus, QueueStatus[]> = {
    pending: ['processing', 'suppressed'],
    processing: ['delivered', 'retrying', 'dead_letter', 'suppressed', 'skipped'],
    failed: ['retrying', 'dead_letter', 'pending'],
    retrying: ['processing', 'pending'],
    delivered: [],
    dead_letter: ['pending'], // Manual admin retry
    skipped: ['pending'],     // Manual admin retry
    suppressed: ['pending'],  // Manual admin retry
  }

  return allowedMap[from]?.includes(to) ?? false
}

export interface RetryDelayOptions {
  maxDelayMinutes?: number
  jitterFactor?: number
  randomFn?: () => number
}

/**
 * Why a queue row's `template_variables` were scrubbed. Stored as the only key of the
 * scrubbed value, so an admin reading the row sees that the data was removed on purpose.
 */
export type TemplateVariablesScrubReason = 'dead_letter' | 'delivered'

/** Key of the marker that replaces scrubbed `template_variables`. */
export const SCRUBBED_TEMPLATE_VARIABLES_KEY = '_scrubbed'

/**
 * Shown to an admin who tries to requeue an auth email whose variables were scrubbed.
 * The one-time link is gone and had expired anyway, so a resend would carry a broken link.
 */
export const AUTH_EMAIL_EXPIRED_RETRY_MESSAGE =
  'This sign-in email expired. Ask the learner to request a new one.'

/**
 * True for every auth template (`auth.verify_email`, `auth.password_reset`,
 * `auth.email_change_verify` and the rest). Their variables can carry a one-time link
 * with a live token, so they are never kept once the row stops being sendable (ADR-005).
 */
export function isAuthTemplateKey(templateKey: unknown): boolean {
  return typeof templateKey === 'string' && templateKey.startsWith('auth.')
}

/** The value written in place of scrubbed `template_variables`. */
export function scrubbedTemplateVariables(
  reason: TemplateVariablesScrubReason
): Record<string, string> {
  return { [SCRUBBED_TEMPLATE_VARIABLES_KEY]: reason }
}

/**
 * Returns the `template_variables` a queue row may keep once it reaches `reason`.
 * Auth templates lose all of their variables (the one-time link included) and keep only
 * the scrub marker. Every other template keeps its variables unchanged, so a dead-lettered
 * broadcast or lifecycle email can still be re-rendered by an admin retry.
 */
export function scrubTemplateVariablesForDeadLetter(
  templateKey: string,
  templateVariables: Record<string, unknown>,
  reason: TemplateVariablesScrubReason = 'dead_letter'
): Record<string, unknown> {
  return isAuthTemplateKey(templateKey) ? scrubbedTemplateVariables(reason) : templateVariables
}

/**
 * True when a queue row is an auth email that can no longer be sent: its variables were
 * scrubbed by the processor (marker present) or by the one-off SQL scrub, or are missing.
 * Admin retry refuses these rows instead of sending a broken link.
 */
export function isExpiredAuthQueueRow(templateKey: unknown, templateVariables: unknown): boolean {
  if (!isAuthTemplateKey(templateKey)) return false
  if (!templateVariables || typeof templateVariables !== 'object' || Array.isArray(templateVariables)) {
    return true
  }
  const keys = Object.keys(templateVariables).filter((key) => key !== SCRUBBED_TEMPLATE_VARIABLES_KEY)
  return keys.length === 0
}

/**
 * Calculates exponential backoff retry delay with bounded jitter and ceiling.
 * Default backoff base: 5m -> 10m, 20m, 40m... capped at 120m.
 * Jitter factor (default +/-20%) prevents synchronized retry storms across concurrent failed jobs.
 */
export function calculateRetryDelayMinutes(
  attemptCount: number,
  baseMinutes: number = 5,
  options?: RetryDelayOptions
): number {
  const maxDelayMinutes = options?.maxDelayMinutes ?? 120
  const jitterFactor = options?.jitterFactor ?? 0.2 // +/-20%
  const randomFn = options?.randomFn ?? Math.random

  const safeBase = Number.isFinite(baseMinutes) && baseMinutes > 0 ? baseMinutes : 5
  const safeAttempts = Math.max(1, Math.min(attemptCount, 10))

  // Exponential growth capped at maxDelayMinutes
  const rawBackoff = Math.min(maxDelayMinutes, safeBase * Math.pow(2, safeAttempts))

  // Bounded jitter: [1 - jitterFactor, 1 + jitterFactor]
  const jitterMultiplier = (1 - jitterFactor) + (randomFn() * (2 * jitterFactor))
  const delayWithJitter = Math.min(maxDelayMinutes, Math.max(1, rawBackoff * jitterMultiplier))

  return Number(delayWithJitter.toFixed(2))
}

/**
 * Sorts queued items by priority (lower numeric value = higher urgency) and scheduled time.
 */
export function sortQueueItemsByPriority(items: QueuedNotificationItem[]): QueuedNotificationItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority // 1 (critical) comes before 10 (bulk)
    }
    return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  })
}

/**
 * Filters items that are ready for execution based on schedule.
 */
export function filterReadyQueueItems(
  items: QueuedNotificationItem[],
  now: Date = new Date()
): QueuedNotificationItem[] {
  return items.filter(
    (item) => item.status === 'pending' && new Date(item.scheduledAt) <= now
  )
}
