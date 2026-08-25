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
    capstones?: AdminUserCapstone[]
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
  /** True when the underlying queue queries failed and counts are unavailable. */
  failed?: boolean
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
  failed?: boolean
}

/* ─── Phase 4 — Learning Workspace ─────────────────────────────────────────── */

/** Content types a lesson contains (mirrors the learner tab shell). */
export type AdminLessonType = 'theory' | 'quiz' | 'flashcards' | 'reflection'

/** One module in the curriculum overview (module card). */
export interface AdminModuleOverview {
  slug: string
  number: number
  name: string
  description: string
  icon: string
  lessonCount: number
  /** Distinct learners who completed at least one lesson in this module. */
  learnersStarted: number
  /** Average per-lesson completion % among learners who started the module. */
  avgCompletionPct: number
  status: 'published'
}

/** One lesson row in the module detail lesson table. */
export interface AdminLessonOverview {
  id: string
  slug: string
  title: string
  order: number
  difficulty: number
  estimatedReadingTime: number
  estimatedCompletionTime: number
  types: AdminLessonType[]
  /** Distinct learners who completed this lesson. */
  completions: number
  /** Completion % of the module's started learners. */
  completionPct: number
  status: 'published'
}

/** Complete payload for the module detail page. */
export interface AdminModuleDetail extends AdminModuleOverview {
  lessons: AdminLessonOverview[]
}

/** Complete payload for the lesson detail page. */
export interface AdminLessonDetail {
  id: string
  slug: string
  title: string
  module: string
  moduleName: string
  moduleNumber: number
  order: number
  globalOrder: number
  difficulty: number
  estimatedReadingTime: number
  estimatedCompletionTime: number
  prerequisites: string[]
  types: AdminLessonType[]
  completions: number
  completionPct: number
  quizAttempts: number
  quizAvgScore: number | null
  status: 'published'
  /** Compiled block tree — rendered by the learner-facing preview. */
  blocks: Array<Record<string, unknown>>
}

/** Curriculum overview KPI values (spec §4.2). */
export interface AdminCurriculumKpis {
  modules: number
  lessons: number
  quizzes: number
  flashcards: number
  capstones: number
}

/** Complete payload for the curriculum overview page. */
export interface AdminCurriculumOverview {
  kpis: AdminCurriculumKpis
  modules: AdminModuleOverview[]
  /** Distinct learners with at least one completed lesson (completion denominator). */
  totalLearners: number
  /** Total completed-lesson events across the curriculum. */
  totalLessonsCompleted: number
}

/** One bucket in the streak-distribution histogram. */
export interface AdminStreakBucket {
  bucket: string
  count: number
}

/* ─── Phase 7 — System Workspace ─────────────────────────────────────────── */

/** One service in the System Health workspace (spec §44). */
export interface AdminSystemServiceStatus {
  id: 'database' | 'auth' | 'email' | 'notifications' | 'queue' | 'scheduler'
  label: string
  /** `unknown` = no telemetry source wired up (rendered as neutral, not healthy). */
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  lastChecked: string
  summary: string
  detail: string
}

/** One external platform integration row in the operational diagnostics panel. */
export interface AdminSystemIntegration {
  id: string
  name: string
  description: string
  configured: boolean
  monitored: boolean
  /** Whether the integration is currently healthy (live check passed). */
  healthy: boolean
}

/** One configured cron job (scheduler run telemetry is not available). */
export interface AdminCronJob {
  name: string
  path: string
}

/** Complete payload for the System Health tab (spec §44). */
export interface AdminSystemHealthOverview {
  overallStatus: 'healthy' | 'degraded' | 'down' | 'unknown'
  environment: string
  nextVersion: string
  lastCheckedAt: string
  databaseLatencyMs: number | null
  services: AdminSystemServiceStatus[]
  cronJobs: AdminCronJob[]
  integrations: AdminSystemIntegration[]
  /** True when the underlying queries failed and the payload is a fallback. */
  failed?: boolean
}

/** One recent error row shown in a service detail drawer (spec §7.3). */
export interface AdminSystemRecentError {
  id: string
  timestamp: string
  severity: string
  operation: string
  message: string
}

/** Detail payload for one service (spec §7.3). */
export interface AdminSystemServiceDetail {
  id: AdminSystemServiceStatus['id']
  label: string
  status: AdminSystemServiceStatus['status']
  lastChecked: string
  summary: string
  metrics: Array<{ label: string; value: string }>
  recentErrors: AdminSystemRecentError[]
  note?: string
}

/** Authentication health telemetry summary for Admin System observability (Phase 6). */
export interface AdminAuthHealthTelemetry {
  status: 'healthy' | 'degraded' | 'critical'
  failures24h: number
  failures7d: number
  providerFailures24h: number
  networkFailures24h: number
  isSpikeDetected: boolean
  topCategories: Array<{ category: string; count: number }>
  recentFailures: AdminSystemRecentError[]
  lastCheckedAt: string
}

/** One grouped error row in the Errors tab (spec §46 / §7.5). */
export interface AdminErrorGroup {
  fingerprint: string
  severity: 'critical' | 'error' | 'warning'
  category: string
  operation: string
  message: string
  status: 'new' | 'acknowledged' | 'resolved'
  firstSeen: string
  lastSeen: string
  occurrences: number
}

/** Paginated result of the Errors tab query. */
export interface AdminErrorGroupResult {
  groups: AdminErrorGroup[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** True when the query failed and the result is an empty fallback. */
  failed?: boolean
}

/** One row in the Audit Log tab (spec §47 / §7.6). */
export interface AdminAuditEntry {
  id: string
  adminId: string | null
  adminEmail: string
  action: string
  targetResource: string
  targetId: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

/** Paginated result of the Audit Log tab query. */
export interface AdminAuditLogResult {
  entries: AdminAuditEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** True when the query failed and the result is an empty fallback. */
  failed?: boolean
}

/** Complete payload for the learning analytics page (spec §4.7). */
export interface AdminLearningAnalytics {
  range: AdminDateRange
  learners: {
    dau: number
    wau: number
    mau: number
    newLearners: number
    returningLearners: number
    activeLearners: number
  }
  learning: {
    lessonsCompleted: number
    moduleCompletionPct: number
    courseCompletionPct: number
    quizAttempts: number
    quizAvgScore: number | null
    /** Average per-module completion % across learners with progress. */
    modules: Array<{ slug: string; title: string; completedPct: number }>
  }
  engagement: {
    streakDistribution: AdminStreakBucket[]
    xpEarned: number
    srsReviews: number
    activeFlashcardLearners: number
  }
  outcomes: {
    certificatesIssued: number
    capstonesSubmitted: number
    publicPortfolios: number
  }
  series: AdminTimeSeriesPoint[]
}

/* ─── Phase 8 — Settings & Configuration ───────────────────────────────────── */

export type SettingsSectionKey = 'product' | 'learning' | 'email' | 'notifications' | 'feature-flags' | 'onboarding'

export interface ProductSettings {
  // General
  siteName: string
  siteDescription: string
  contactEmail: string
  // Platform Behavior
  maintenanceMode: boolean
  allowSignups: boolean
  requireEmailVerification: boolean
  sessionTimeoutMinutes: number
}

export interface LearningSettings {
  // XP
  xpPerLessonComplete: number
  xpPerQuizPass: number
  xpPerFlashcardReview: number
  xpPerReflection: number
  // Streaks
  streakFreezeEnabled: boolean
  streakFreezeCostXp: number
  // Certificates
  certificateAutoIssue: boolean
  certificateExpiryDays: number | null
  // Learning Behavior
  lessonCompletionRequiredForProgress: boolean
  quizPassThreshold: number
}

export interface EmailSettings {
  // Sending
  fromName: string
  fromEmail: string
  replyToEmail: string
  // Limits
  dailySendLimit: number
  hourlySendLimit: number
  // Sender (read-only from env)
  resendApiKeyConfigured: boolean
  // Automation
  retryFailedEmails: boolean
  maxRetryAttempts: number
  retryDelayMinutes: number
}

export interface NotificationSettings {
  // Reminders
  dailyReminderEnabled: boolean
  dailyReminderTime: string // HH:MM
  inactivityReminderDays: number
  // Weekly Recap
  weeklyRecapEnabled: boolean
  weeklyRecapDay: number // 0-6 (Sunday=0)
  weeklyRecapTime: string // HH:MM
  // Defaults
  defaultInAppEnabled: boolean
  defaultEmailEnabled: boolean
}

export interface OnboardingFieldOption {
  id: string
  label: string
  description?: string
  badge?: string
  icon?: string
  enabled?: boolean
}

export interface OnboardingStepConfig {
  id: string
  title: string
  description: string
  requiredFields: string[]
  fieldOptions?: Record<string, OnboardingFieldOption[]>
}

export interface OnboardingSettings {
  enabled: boolean
  steps: OnboardingStepConfig[]
  fieldOptions?: Record<string, OnboardingFieldOption[]>
}

export interface SettingsResponse<T> {
  success: boolean
  data?: T
  error?: string
  failed?: boolean
}

/* ─── Phase 9 — Analytics & Insights Workspace ────────────────────────────── */

export type AdminAnalyticsTab = 'overview' | 'learners' | 'learning' | 'engagement' | 'outcomes'

export interface AdminXpSourceDistribution {
  source: string
  label: string
  xp: number
  percentage: number
}

export interface AdminLevelDistribution {
  level: number
  label: string
  count: number
  percentage: number
}

export interface AdminScoreBucket {
  range: string
  count: number
}

export interface AdminQuizPerformanceStats {
  totalAttempts: number
  passedAttempts: number
  passRatePct: number
  avgScorePct: number | null
  scoreDistribution: AdminScoreBucket[]
}

export interface AdminModuleDropOff {
  slug: string
  title: string
  order: number
  lessonCount: number
  learnersStarted: number
  learnersCompleted: number
  completionPct: number
  dropOffPct: number
}

export interface AdminDailyXpPoint {
  date: string
  label: string
  xp: number
}

export interface AdminDailyCertificatePoint {
  date: string
  label: string
  count: number
}

export interface AdminLearnerDemographics {
  dau: number
  wau: number
  mau: number
  newLearners: number
  returningLearners: number
  activeLearners: number
  totalUsers: number
  verifiedUsers: number
  levelDistribution: AdminLevelDistribution[]
  streakDistribution: AdminStreakBucket[]
  growthSeries: AdminTimeSeriesPoint[]
}

export interface AdminLearningDeepAnalytics {
  totalLessonsCompleted: number
  courseCompletionPct: number
  moduleCompletionPct: number
  quizStats: AdminQuizPerformanceStats
  moduleDropOffs: AdminModuleDropOff[]
  learningSeries: AdminTimeSeriesPoint[]
}

export interface AdminEngagementAnalytics {
  streakDistribution: AdminStreakBucket[]
  xpEarned: number
  xpBySource: AdminXpSourceDistribution[]
  srsReviews: number
  activeFlashcardLearners: number
  dailyXpSeries: AdminDailyXpPoint[]
}

export interface AdminOutcomesAnalytics {
  certificatesIssued: number
  capstonesSubmitted: number
  capstonesReviewed: number
  badgesAwarded: number
  publicPortfolios: number
  certificateSeries: AdminDailyCertificatePoint[]
}

export interface AdminExecutiveOverview {
  kpis: AdminDashboardKpis
  funnel: AdminFunnelStage[]
  consolidatedSeries: AdminTimeSeriesPoint[]
}

export interface AdminAnalyticsWorkspaceData {
  range: AdminDateRange
  tab: AdminAnalyticsTab
  overview: AdminExecutiveOverview
  learners: AdminLearnerDemographics
  learning: AdminLearningDeepAnalytics
  engagement: AdminEngagementAnalytics
  outcomes: AdminOutcomesAnalytics
  failed?: boolean
}

