import type { NotificationMetricEvent, NotificationAnalyticsAggregate } from './types'

export * from './types'

export function computeAnalyticsAggregate(
  templateKey: string,
  events: NotificationMetricEvent[]
): NotificationAnalyticsAggregate {
  let queuedCount = 0
  let deliveredCount = 0
  let openedCount = 0
  let clickedCount = 0
  let failedCount = 0
  let suppressedCount = 0

  for (const ev of events) {
    if (ev.templateKey !== templateKey) continue
    switch (ev.status) {
      case 'queued':
        queuedCount++
        break
      case 'delivered':
        deliveredCount++
        break
      case 'opened':
        openedCount++
        break
      case 'clicked':
        clickedCount++
        break
      case 'failed':
        failedCount++
        break
      case 'suppressed':
        suppressedCount++
        break
    }
  }

  const openRatePercent = deliveredCount > 0 ? (openedCount / deliveredCount) * 100 : 0
  const clickRatePercent = openedCount > 0 ? (clickedCount / openedCount) * 100 : 0

  return {
    templateKey,
    queuedCount,
    deliveredCount,
    openedCount,
    clickedCount,
    failedCount,
    suppressedCount,
    openRatePercent: Math.round(openRatePercent * 10) / 10,
    clickRatePercent: Math.round(clickRatePercent * 10) / 10,
  }
}
