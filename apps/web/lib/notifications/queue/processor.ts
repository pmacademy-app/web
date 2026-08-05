import type { QueuedNotificationItem, DeadLetterRecord } from './types'
import type { NotificationPriorityLevel, NotificationChannel, NotificationCategory } from '../types'
import { PRIORITY_MATRIX } from '../constants'
import { globalFeatureFlagService } from '../feature-flags/service'
import { createDefaultNotificationPreferences, isChannelEnabledByPreferences } from '../preferences/defaults'
import { globalPriorityMatrix } from '../priority/matrix'
import { globalProviderRegistry } from '../providers'
import { renderEmailTemplate } from '../../../emails'
import { sortQueueItemsByPriority } from './helpers'

// In-Memory Queue Store (used when DB is not connected in tests/dev)
const inMemoryQueue: Map<string, QueuedNotificationItem> = new Map()
const inMemoryDeadLetter: Map<string, DeadLetterRecord> = new Map()
const inMemorySuppressions: Set<string> = new Set()

export interface EnqueueNotificationParams {
  userId: string
  toEmail: string
  toName?: string
  channel: NotificationChannel
  templateKey: string
  templateVariables: Record<string, unknown>
  eventId?: string
  eventType: string
  category: NotificationCategory
  priorityLevel?: NotificationPriorityLevel
}

/**
 * Enqueues a notification item into the queue.
 * Checks Feature Flags, User Preferences, and Duplicate Prevention.
 */
export async function enqueueNotificationItem(
  params: EnqueueNotificationParams
): Promise<{ success: boolean; queueId?: string; reason?: string }> {
  const priorityLevel = params.priorityLevel || 'medium'
  const priorityDef = PRIORITY_MATRIX[priorityLevel]

  // 1. Feature Flag Check
  const emailEnabled = globalFeatureFlagService.isEnabled('EMAIL_ENABLED')
  if (params.channel === 'email' && !emailEnabled) {
    return { success: false, reason: 'Email system is disabled via Feature Flags' }
  }

  // 2. User Preferences & Bypass Check
  const allowBypass = globalPriorityMatrix.evaluatePreferenceBypass(priorityLevel)
  if (!allowBypass) {
    const userPrefs = createDefaultNotificationPreferences(params.userId)
    const isAllowed = isChannelEnabledByPreferences(userPrefs, params.category, params.channel)
    if (!isAllowed) {
      return { success: false, reason: `User disabled '${params.category}' notifications for channel '${params.channel}'` }
    }
  }

  // 3. Duplicate Prevention
  if (params.eventId) {
    const existing = Array.from(inMemoryQueue.values()).find(
      (item) => item.eventId === params.eventId && item.templateKey === params.templateKey && item.status === 'pending'
    )
    if (existing) {
      return { success: false, reason: 'Duplicate pending notification already exists in queue', queueId: existing.id }
    }
  }

  // 4. Create Queue Item
  const now = new Date().toISOString()
  const queueId = `queue-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

  const item: QueuedNotificationItem = {
    id: queueId,
    userId: params.userId,
    toEmail: params.toEmail,
    toName: params.toName,
    channel: params.channel,
    templateKey: params.templateKey,
    templateVariables: params.templateVariables,
    eventId: params.eventId,
    eventType: params.eventType,
    priority: priorityDef.numericValue,
    priorityLevel,
    status: 'pending',
    retry: {
      attemptCount: 0,
      maxAttempts: priorityDef.maxRetries,
    },
    scheduledAt: now,
    createdAt: now,
    updatedAt: now,
  }

  inMemoryQueue.set(queueId, item)

  return {
    success: true,
    queueId,
  }
}

/**
 * Processes a batch of pending emails from the queue.
 */
export async function processEmailQueue(
  batchSize: number = 50
): Promise<{ processed: number; delivered: number; failed: number; suppressed: number }> {
  // Check Global Queue Processing Feature Flag
  const processingEnabled = globalFeatureFlagService.isEnabled('QUEUE_PROCESSING_ENABLED')
  if (!processingEnabled) {
    return { processed: 0, delivered: 0, failed: 0, suppressed: 0 }
  }

  const pendingItems = filterPendingQueueItems(batchSize)
  const sortedItems = sortQueueItemsByPriority(pendingItems)

  let deliveredCount = 0
  let failedCount = 0
  let suppressedCount = 0

  for (const item of sortedItems) {
    item.status = 'processing'
    item.processingAt = new Date().toISOString()

    // 1. Suppression Check
    if (item.toEmail && inMemorySuppressions.has(item.toEmail)) {
      item.status = 'suppressed'
      suppressedCount++
      continue
    }

    // 2. Render Template
    let renderedHtml = ''
    let renderedText = ''
    let subject = ''
    try {
      const rendered = await renderEmailTemplate(item.templateKey, item.templateVariables)
      renderedHtml = rendered.html
      renderedText = rendered.text
      subject = rendered.subject
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Template rendering failed'
      await handlePermanentFailure(item, `Template Render Error: ${errorMsg}`)
      failedCount++
      continue
    }

    // 3. Dispatch via Provider
    const provider = globalProviderRegistry.getProvider('resend')
    if (!provider) {
      await handleRetryableFailure(item, 'Resend provider not registered')
      failedCount++
      continue
    }

    const sendResult = await provider.send({
      recipient: {
        userId: item.userId,
        email: item.toEmail,
        name: item.toName,
      },
      channel: item.channel,
      templateKey: item.templateKey,
      templateVersion: 1,
      variables: {
        ...item.templateVariables,
        subject,
        html: renderedHtml,
        text: renderedText,
      },
    })

    if (sendResult.success) {
      item.status = 'delivered'
      item.deliveredAt = new Date().toISOString()
      item.resendId = sendResult.externalId
      deliveredCount++
    } else {
      await handleRetryableFailure(item, sendResult.error || 'Provider send failed')
      failedCount++
    }
  }

  return {
    processed: sortedItems.length,
    delivered: deliveredCount,
    failed: failedCount,
    suppressed: suppressedCount,
  }
}

/**
 * Handles temporary retryable send failures.
 */
async function handleRetryableFailure(item: QueuedNotificationItem, errorMessage: string): Promise<void> {
  item.retry.attemptCount += 1
  item.errorMessage = errorMessage
  item.failedAt = new Date().toISOString()

  const retryPolicy = globalPriorityMatrix.calculateRetryDelay(
    item.priorityLevel,
    item.retry.attemptCount
  )

  if (retryPolicy.isMaxAttemptsExceeded) {
    await handlePermanentFailure(item, `Max retries (${item.retry.maxAttempts}) exceeded. Last error: ${errorMessage}`)
  } else {
    item.status = 'retrying'
    item.retry.nextRetryAt = retryPolicy.nextRetryAt.toISOString()
  }
}

/**
 * Moves a permanently failed queue item to the dead-letter queue.
 */
async function handlePermanentFailure(item: QueuedNotificationItem, failureReason: string): Promise<void> {
  item.status = 'dead_letter'
  item.errorMessage = failureReason

  const deadLetterRecord: DeadLetterRecord = {
    id: `dl-${item.id}`,
    originalQueueId: item.id,
    userId: item.userId,
    templateKey: item.templateKey,
    templateVariables: item.templateVariables,
    failureReason,
    allErrors: [
      {
        attempt: item.retry.attemptCount,
        error: failureReason,
        timestamp: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  }

  inMemoryDeadLetter.set(deadLetterRecord.id, deadLetterRecord)
}

function filterPendingQueueItems(limit: number): QueuedNotificationItem[] {
  const now = new Date()
  const ready: QueuedNotificationItem[] = []

  for (const item of inMemoryQueue.values()) {
    if (ready.length >= limit) break

    const isPending = item.status === 'pending'
    const isRetryingReady =
      item.status === 'retrying' && item.retry.nextRetryAt && new Date(item.retry.nextRetryAt) <= now

    if (isPending || isRetryingReady) {
      if (new Date(item.scheduledAt) <= now) {
        ready.push(item)
      }
    }
  }

  return ready
}

export function clearInMemoryQueue(): void {
  inMemoryQueue.clear()
  inMemoryDeadLetter.clear()
  inMemorySuppressions.clear()
}

export function getInMemoryQueue(): QueuedNotificationItem[] {
  return Array.from(inMemoryQueue.values())
}

export function getInMemoryDeadLetter(): DeadLetterRecord[] {
  return Array.from(inMemoryDeadLetter.values())
}

export function addInMemorySuppression(email: string): void {
  inMemorySuppressions.add(email)
}
