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
  isVerified: boolean
  emailConfirmedAt?: string | null
  totalXp: number
  level: number
  streakDays: number
  hasPublicPortfolio?: boolean
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

/* ─── Phase 2 — Dashboard / Operations Center ─────────────────────────────── */

/** Date range presets supported by the dashboard header selector. */
export type AdminDateRangeKey = 'today' | '7d' | '30d' | '90d' | 'custom'

/** Resolved inclusive window for a dashboard query. */
export interface AdminDateRange {
  key: AdminDateRangeKey
  start: Date
  end: Date
}

/** One actionable item in the dashboard Attention Center. */
export interface AdminAttentionItem {
  id: string
  label: string
  count: number
  severity: 'critical' | 'warning' | 'healthy'
  href: string
  actionLabel: string
}

/** KPI values for the dashboard grid (all scoped to the selected range). */
export interface AdminDashboardKpis {
  totalUsers: number
  activeLearners: number
  newUsers: number
  verifiedUsers: number
  lessonsCompleted: number
  courseCompletionPct: number
  xpEarned: number
  certificatesIssued: number
  /** Prior-period deltas for trend display (percentage change). */
  trends: {
    totalUsers: number | null
    activeLearners: number | null
    newUsers: number | null
    verifiedUsers: number | null
    lessonsCompleted: number | null
    courseCompletionPct: number | null
    xpEarned: number | null
    certificatesIssued: number | null
  }
}

/** One point in a dashboard time-series chart. */
export interface AdminTimeSeriesPoint {
  date: string // ISO date (YYYY-MM-DD)
  label: string // short display label
  newUsers: number
  activeLearners: number
  returningLearners: number
  lessonsCompleted: number
  quizAttempts: number
  capstonesSubmitted: number
}

/** One stage in the learning funnel. */
export interface AdminFunnelStage {
  key: string
  label: string
  count: number
  /** Percentage of the previous stage (null for the first stage). */
  pctOfPrevious: number | null
  /** Percentage of the registered baseline. */
  pctOverall: number
}

/** One row in the dashboard recent-activity timeline. */
export interface AdminRecentActivityItem {
  id: string
  userId: string | null
  userName: string
  activity: string
  entity: string
  href: string
  timestamp: string
}

/** One service in the dashboard system snapshot. */
export interface AdminSystemSnapshotItem {
  id: string
  label: string
  status: 'healthy' | 'degraded' | 'down'
  lastChecked: string
  summary: string
  href: string
}

/** Complete payload for the Phase 2 dashboard page. */
export interface AdminDashboardData {
  range: AdminDateRange
  kpis: AdminDashboardKpis
  attention: AdminAttentionItem[]
  series: AdminTimeSeriesPoint[]
  funnel: AdminFunnelStage[]
  recentActivity: AdminRecentActivityItem[]
  systemSnapshot: AdminSystemSnapshotItem[]
}
