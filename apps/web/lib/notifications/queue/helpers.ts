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
