/**
 * Typed Event Payloads for PM Academy Notification Platform
 */

export interface LessonCompletedPayload {
  lessonId: string
  lessonTitle: string
  lessonOrder: number
  moduleSlug: string
  moduleName: string
  quizScore: number
  xpEarned: number
  totalXp: number
  completedAt: string
}

export interface ModuleCompletedPayload {
  moduleSlug: string
  moduleName: string
  totalLessonsCompleted: number
  completedAt: string
}

export interface QuizCompletedPayload {
  lessonId: string
  lessonTitle?: string
  score: number
  totalQuestions: number
  isPerfectScore: boolean
  xpEarned: number
  attemptNumber: number
}

export interface ReviewCompletedPayload {
  cardsReviewedCount: number
  correctCount: number
  xpEarned: number
  sessionDurationSeconds: number
}

export interface BadgeEarnedPayload {
  badgeKey: string
  badgeName: string
  badgeDescription: string
  badgeIcon: string
  badgeCategory: string
  earnedAt: string
}

export interface XpLevelUpPayload {
  previousLevel: number
  newLevel: number
  levelTitle: string
  totalXp: number
  unlockedFeatures?: string[]
  levelUpAt: string
}

export interface StreakUpdatedPayload {
  currentStreak: number
  longestStreak: number
  streakFreezesAvailable: number
  isMilestone: boolean
  lastStreakDate: string
}

export interface PortfolioPublishedPayload {
  username: string
  portfolioUrl: string
  publicReflectionsCount: number
  publicCapstonesCount: number
  publishedAt: string
}

export interface CertificateGeneratedPayload {
  certificateCode: string
  certificateType: 'full_curriculum' | 'module_completion'
  learnerName: string
  moduleSlug?: string
  verificationUrl: string
  issuedAt: string
}

export interface CapstoneSubmittedPayload {
  submissionId: string
  moduleSlug: string
  moduleTitle: string
  isPublic: boolean
  submittedAt: string
}

export interface CapstoneReviewedPayload {
  submissionId: string
  moduleSlug: string
  moduleTitle: string
  /** Whether the review published the capstone to the learner's public portfolio. */
  isPublished: boolean
  reviewedAt: string
  /** Learner's portfolio handle, when known — lets a published review deep-link to `/p/<username>`. */
  username?: string | null
  isPortfolioPublic?: boolean
}

export interface FellowGrantedPayload {
  /** Null only if the learner has no handle yet; a grant normally requires a public portfolio. */
  username: string | null
  isPortfolioPublic: boolean
  /** Absolute public portfolio URL, or null when there is no username to build it from. */
  portfolioUrl: string | null
  grantedAt: string
}

export interface UserRegisteredPayload {
  userId: string
  email: string
  name?: string
  goal?: string
  registeredAt: string
}

export interface UserVerifiedPayload {
  userId: string
  email: string
  verifiedAt: string
}

export interface PasswordResetRequestedPayload {
  userId: string
  email: string
  resetTokenHash: string
  expiresAt: string
}
