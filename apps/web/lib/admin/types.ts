/**
 * PM Academy Admin Console Data Types & Interfaces
 */

export type AdminModuleKey =
  | 'dashboard'
  | 'users'
  | 'content'
  | 'notifications'
  | 'emails'
  | 'templates'
  | 'analytics'
  | 'certificates'
  | 'portfolios'
  | 'feature_flags'
  | 'system'
  | 'settings'

export interface AdminUserOverview {
  id: string
  email: string
  fullName: string
  username?: string | null
  role: string
  isAdmin: boolean
  totalXp: number
  level: number
  streakDays: number
  createdAt: string
  lastActiveAt: string | null
}

export interface AdminUserDetail extends AdminUserOverview {
  lessonsCompleted: number
  quizzesCompleted: number
  capstonesSubmitted: number
  certificatesCount: number
  hasPublicPortfolio: boolean
  goal?: string
  notificationPreferences?: {
    allNotifications: boolean
    allEmail: boolean
    allInApp: boolean
    timezone: string
  }
}

export interface AdminSystemHealth {
  status: 'healthy' | 'degraded' | 'down'
  databaseLatencyMs: number
  activeCronJobsCount: number
  queuePendingItemsCount: number
  failedNotifications24h: number
  lastCheckedAt: string
  environment: string
  nextVersion: string
}

export interface AdminDashboardSummary {
  totalUsers: number
  activeLearners7d: number
  newSignups24h: number
  totalLessonsCompleted: number
  totalCapstonesSubmitted: number
  totalCertificatesIssued: number
  totalPublicPortfolios: number
  totalXpAwarded: number
  notificationsSent24h: number
  queuePendingCount: number
  systemHealth: AdminSystemHealth
}

export interface AdminAuditLog {
  id: string
  adminId: string
  adminEmail: string
  action: string
  targetType: string
  targetId?: string
  details?: Record<string, unknown>
  createdAt: string
}

export interface AdminContentOverview {
  totalModules: number
  totalLessons: number
  publishedLessons: number
  draftLessons: number
  archivedLessons: number
  totalQuizzes: number
  totalFlashcards: number
  totalCapstones: number
}

export interface AdminEmailQueueOverview {
  pendingCount: number
  processingCount: number
  deliveredCount: number
  failedCount: number
  deadLetterCount: number
  recentLogs: Array<{
    id: string
    toEmail: string
    templateKey: string
    status: string
    createdAt: string
  }>
}
