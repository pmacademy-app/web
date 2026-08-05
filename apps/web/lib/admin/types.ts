/**
 * PM Academy Admin Console Types
 */

export type AdminModuleKey =
  | 'dashboard'
  | 'users'
  | 'notifications'
  | 'emails'
  | 'analytics'
  | 'content'
  | 'certificates'
  | 'portfolios'
  | 'leaderboards'
  | 'system'

export interface AdminUserOverview {
  id: string
  email: string
  fullName: string
  role: string
  isAdmin: boolean
  totalXp: number
  level: number
  streakDays: number
  createdAt: string
  lastActiveAt: string | null
}

export interface AdminSystemHealth {
  status: 'healthy' | 'degraded' | 'down'
  databaseLatencyMs: number
  activeCronJobsCount: number
  queuePendingItemsCount: number
  failedNotifications24h: number
  lastCheckedAt: string
}

export interface AdminDashboardSummary {
  totalUsers: number
  activeLearners7d: number
  totalLessonsCompleted: number
  totalCapstonesSubmitted: number
  totalCertificatesIssued: number
  notificationsSent24h: number
  systemHealth: AdminSystemHealth
}
