/**
 * Client-safe contract for POST /api/notifications/celebrations.
 * Types and constants only. No server imports, and no import of '@/lib/api/client'.
 */
export const ACHIEVEMENT_CELEBRATIONS_PATH = '/api/notifications/celebrations'

export const ACHIEVEMENT_CELEBRATION_KINDS = ['certificate', 'capstone', 'fellow', 'module'] as const
export type AchievementCelebrationKind = (typeof ACHIEVEMENT_CELEBRATION_KINDS)[number]

/** The caller's own portfolio state, read at claim time. */
export interface CelebrationPortfolio {
  username: string | null
  displayName: string | null
  isPublic: boolean
}

interface CelebrationBase {
  /** The in_app_notifications row this claim marked read. */
  notificationId: string
  portfolio: CelebrationPortfolio
}

export interface CertificateCelebration extends CelebrationBase {
  kind: 'certificate'
  certificate: {
    code: string
    /** Normalised server-side: anything that is not 'full_curriculum' is 'module'. */
    type: 'full_curriculum' | 'module'
    moduleSlug: string | null
    moduleTitle: string | null
    issuedAt: string
    careerTitle: string
    /** Absolute `${origin}/verify/<code>`. */
    verificationUrl: string
  }
}

export interface CapstoneCelebration extends CelebrationBase {
  kind: 'capstone'
  capstone: { moduleSlug: string; moduleTitle: string }
}

export interface FellowCelebration extends CelebrationBase {
  kind: 'fellow'
}

/** Every lesson in a curriculum module completed. */
export interface ModuleCelebration extends CelebrationBase {
  kind: 'module'
  module: { slug: string; title: string }
  /** The module's capstone, or null when it has none. `submitted`: already submitted or reviewed. */
  capstone: { slug: string; title: string; submitted: boolean } | null
}

export type AchievementCelebration =
  | CertificateCelebration
  | CapstoneCelebration
  | FellowCelebration
  | ModuleCelebration

/** `celebration` is null when nothing is claimable or the kill switch is off. */
export interface AchievementCelebrationClaimResponse {
  success: true
  celebration: AchievementCelebration | null
}
