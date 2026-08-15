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
  /** Curriculum completion percentage (0–100). */
  progressPct: number
  createdAt: string
  lastActiveAt: string | null
}

/** Server-side filter set for the Users workspace (Phase 3). */
export interface AdminUserFilters {
  verification?: 'verified' | 'unverified'
  role?: 'admin' | 'learner'
  /** `active` = earned XP within the last 30 days. */
  activity?: 'active' | 'inactive'
  /** `none` = 0 lessons, `started` = 1–99%, `completed` = 100%. */
  progress?: 'none' | 'started' | 'completed'
  /** Minimum level (inclusive). */
  minLevel?: number
  /** YYYY-MM-DD bounds on the signup date. */
  joinedFrom?: string
  joinedTo?: string
  /** YYYY-MM-DD bounds on the last-active date. */
  activeFrom?: string
  activeTo?: string
  sort?: 'createdAt' | 'lastActiveAt' | 'totalXp' | 'level' | 'streakDays' | 'progressPct'
  sortDir?: 'asc' | 'desc'
}

/** Paginated result of the Users workspace list query. */
export interface AdminUserListResult {
  users: AdminUserOverview[]
  total: number
  /** True when the query failed and `users`/`total` are empty fallbacks. */
  failed?: boolean
}

/** Per-module progress row for the Learning tab. */
export interface AdminUserModuleProgress {
  slug: string
  title: string
  lessonsCompleted: number
  lessonsTotal: number
  completedPct: number
}

export type AdminUserActivityType =
  | 'lesson_completed'
  | 'quiz_attempted'
  | 'badge_earned'
  | 'certificate_issued'
  | 'reflection_created'
  | 'capstone_submitted'

/** One row in the user Activity timeline. */
export interface AdminUserActivityItem {
  id: string
  type: AdminUserActivityType
  label: string
  detail: string
  timestamp: string
}

export interface AdminUserBadge {
  id: string
  key: string
  name: string
  description: string
  icon: string
  earnedAt: string
}

export interface AdminUserCertificate {
  id: string
  code: string
  type: string
  issuedAt: string
}

export interface AdminUserCapstone {
  id: string
  moduleSlug: string
  moduleTitle: string
  status: string
  isPublic: boolean
  submittedAt: string
}

export interface AdminUserEmail {
  id: string
  templateKey: string
  status: string
  createdAt: string
}

export interface AdminUserNotification {
  id: string
  title: string
  category: string
  isRead: boolean
  createdAt: string
}

export interface AdminUserContact {
  id: string
  subject: string
  category: string
  status: string
  createdAt: string
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
  /* ─── Phase 3 — User detail tabs ─────────────────────────────────────── */
  kpis: {
    level: number
    xp: number
    streakDays: number
    courseProgressPct: number
  }
  learning: {
    courseProgressPct: number
    lessonsCompleted: number
    lessonsTotal: number
    quizAttempts: number
    quizAvgScore: number | null
    srsReviews: number
    modules: AdminUserModuleProgress[]
  }
  activity: AdminUserActivityItem[]
  achievements: {
    badges: AdminUserBadge[]
    certificates: AdminUserCertificate[]
    capstone: AdminUserCapstone | null
    portfolio: { hasPortfolio: boolean; url: string | null; isPublic: boolean }
  }
  communications: {
    emails: AdminUserEmail[]
    notifications: AdminUserNotification[]
    contacts: AdminUserContact[]
  }
  account: {
    email: string
    verified: boolean
    emailConfirmedAt: string | null
    createdAt: string
    lastActiveAt: string | null
    role: string
    isAdmin: boolean
    goal: string | null
    timezone: string | null
    authProvider: string | null
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
  /** Timezone the window and day buckets are expressed in. */
  timeZone: string
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
  /** `unknown` = no telemetry source wired up yet (rendered as neutral, not degraded). */
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
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
