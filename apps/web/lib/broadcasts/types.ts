/**
 * Recipient filter set for email and in-app broadcasts. The admin console (separate
 * repository) authors broadcasts with it, and the learner app's
 * /api/cron/process-broadcasts resolves recipients from the stored JSON.
 */
export interface AudienceFilters {
  verification?: 'verified' | 'unverified'
  role?: 'admin' | 'learner'
  /** `active` = earned XP within the last 30 days (legacy). Use activeLastDays for configurable periods. */
  activity?: 'active' | 'inactive'
  /** `none` = 0 lessons, `started` = 1–99%, `completed` = 100%. */
  progress?: 'none' | 'started' | 'completed'
  /** Minimum level (inclusive). */
  minLevel?: number
  /** YYYY-MM-DD bounds on the signup date. */
  joinedFrom?: string
  joinedTo?: string
  /** YYYY-MM-DD bounds on the last XP-activity date. */
  activeFrom?: string
  activeTo?: string
  /** Server-sortable columns only (lastActiveAt and progressPct are computed client-side). */
  sort?: 'createdAt' | 'totalXp' | 'level' | 'streakDays'
  sortDir?: 'asc' | 'desc'

  /* ─── Extended filters (used by both Users workspace and Broadcasts) ─── */

  /** Filter by onboarding completion status. */
  onboardingStatus?: 'completed' | 'incomplete'
  /** Filter by experience level IDs (OR logic within this array). e.g. ['beginner', 'learning'] */
  experienceLevels?: string[]
  /** Filter by goal IDs (OR logic within this array). e.g. ['become_pm', 'transition_pm'] */
  goals?: string[]
  /** Filter by interest topic IDs (OR logic: any of these topics). */
  topics?: string[]
  /** Filter by learning preference ID. */
  learningPreference?: string
  /** Active in last N days (supersedes `activity` for broadcast targeting). */
  activeLastDays?: number
  /** Inactive for at least N days. */
  inactiveLastDays?: number
  /** Only include users who opted in to marketing emails. */
  marketingEmailOptIn?: boolean
  /** Exclude users who have received this template_key (delivered). */
  excludeIfReceivedTemplate?: string
  /** Only users who have received this template_key (delivered). */
  onlyIfReceivedTemplate?: string
  /** Exclude users who were targeted by this broadcast ID. */
  excludeBroadcastId?: string
  /** Target only these specific user IDs (Individual audience mode). Intersected with any other filters. */
  userIds?: string[]
}
