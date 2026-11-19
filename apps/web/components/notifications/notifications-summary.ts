/**
 * The bell's SWR key: the unread count only (GET /api/notifications?summary=1, one head count
 * query). AchievementCelebrationHost reads the same key, so one request serves both.
 */
export const NOTIFICATIONS_SUMMARY_KEY = '/api/notifications?summary=1'

/** What GET /api/notifications?summary=1 answers. */
export interface NotificationsSummaryResponse {
  success: boolean
  unreadCount: number
}
