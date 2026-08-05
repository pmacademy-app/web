import type { UserNotificationTimelineRecord } from './types'
import type { QueuedNotificationItem } from '../queue/types'

export function createTimelineRecordFromQueueItem(
  item: QueuedNotificationItem,
  templateVersion: number = 1
): UserNotificationTimelineRecord {
  return {
    id: `tl-${item.id}`,
    userId: item.userId,
    eventId: item.eventId,
    channel: item.channel,
    templateKey: item.templateKey,
    templateVersion,
    status: item.status,
    priority: item.priorityLevel,
    queuedAt: item.createdAt,
    sentAt: item.processingAt,
    deliveredAt: item.deliveredAt,
    failedAt: item.failedAt,
    errorDetails: item.errorMessage,
    resendId: item.resendId,
    metadata: {
      eventType: item.eventType,
    },
    createdAt: new Date().toISOString(),
  }
}
