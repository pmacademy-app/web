import type { QueuedNotificationItem, QueueStatus } from './types'

/**
 * Validates whether a status transition is permitted in the Queue lifecycle.
 */
export function isValidQueueStatusTransition(from: QueueStatus, to: QueueStatus): boolean {
  const allowedMap: Record<QueueStatus, QueueStatus[]> = {
    pending: ['processing', 'suppressed'],
    processing: ['delivered', 'failed', 'suppressed'],
    failed: ['retrying', 'dead_letter'],
    retrying: ['processing'],
    delivered: [],
    dead_letter: ['pending'], // Manual admin retry
    suppressed: [],
  }

  return allowedMap[from]?.includes(to) ?? false
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
