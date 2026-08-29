/**
 * Portfolio Completeness & Share-Readiness Model (Phase 1 Unit 4)
 *
 * Evaluates whether a user's portfolio has the essential baseline elements
 * to be confidently shared with recruiters, hiring managers, and professional networks.
 *
 * Core Principles:
 * 1. SHARE-READINESS != GAMIFICATION: XP, streaks, levels, and badges have 0 weight in readiness.
 * 2. EARLY-CAREER FAIR: Does NOT require years of employment, corporate experience, or client references.
 *    An applied project/capstone + bio + photo + LinkedIn is 100% share-ready.
 * 3. ZERO PUBLIC LEAKAGE: Readiness calculations and checklists are private to the portfolio owner.
 */

export interface PortfolioReadinessCheckItem {
  id: 'name' | 'username' | 'bio' | 'avatar' | 'project' | 'social' | 'visibility'
  label: string
  description: string
  isComplete: boolean
  importance: 'essential' | 'recommended'
  actionAnchor?: string
}

export interface PortfolioReadinessSummary {
  isReadyToShare: boolean
  completedCount: number
  totalCount: number
  items: PortfolioReadinessCheckItem[]
  missingEssentialCount: number
  missingRecommendedCount: number
  statusLabel: 'Ready to Share' | 'Needs Attention' | 'Incomplete'
  recommendation: string
}

export interface PortfolioReadinessInput {
  name?: string | null
  username?: string | null
  bio?: string | null
  avatarUrl?: string | null
  linkedinUrl?: string | null
  githubUrl?: string | null
  websiteUrl?: string | null
  isPortfolioPublic?: boolean
  publicCapstonesCount?: number
}

/**
 * Calculates portfolio readiness from existing loaded profile and capstone data.
 * Pure function with zero side effects or database coupling.
 */
export function calculatePortfolioReadiness(input: PortfolioReadinessInput): PortfolioReadinessSummary {
  const hasName = Boolean(input.name && input.name.trim().length >= 2)
  const hasUsername = Boolean(input.username && input.username.trim().length >= 3)
  const hasBio = Boolean(input.bio && input.bio.trim().length >= 10)
  const hasAvatar = Boolean(input.avatarUrl && input.avatarUrl.trim().length > 0)
  const hasProject = Boolean((input.publicCapstonesCount ?? 0) > 0)
  const hasSocial = Boolean(
    (input.linkedinUrl && input.linkedinUrl.trim().length > 0) ||
    (input.githubUrl && input.githubUrl.trim().length > 0) ||
    (input.websiteUrl && input.websiteUrl.trim().length > 0)
  )
  const isPublic = Boolean(input.isPortfolioPublic ?? true)

  const items: PortfolioReadinessCheckItem[] = [
    {
      id: 'name',
      label: 'Display Name',
      description: 'Your real full name for professional identification.',
      isComplete: hasName,
      importance: 'essential',
      actionAnchor: 'setting-name',
    },
    {
      id: 'username',
      label: 'Portfolio Handle',
      description: 'A clean vanity handle for your public /p/[username] link.',
      isComplete: hasUsername,
      importance: 'essential',
      actionAnchor: 'setting-username',
    },
    {
      id: 'visibility',
      label: 'Public Visibility',
      description: 'Portfolio must be set to public so recruiters can open your link.',
      isComplete: isPublic,
      importance: 'essential',
      actionAnchor: 'visibility-toggle',
    },
    {
      id: 'bio',
      label: 'Professional Headline / Bio',
      description: 'A concise summary of your product focus, domain expertise, or career goals.',
      isComplete: hasBio,
      importance: 'essential',
      actionAnchor: 'setting-bio',
    },
    {
      id: 'project',
      label: 'Applied Project / Capstone',
      description: 'At least one published case study or applied deliverable showcasing your PM craft.',
      isComplete: hasProject,
      importance: 'essential',
      actionAnchor: 'featured-capstone-section',
    },
    {
      id: 'avatar',
      label: 'Profile Photo',
      description: 'A clear photo or avatar for a professional first impression.',
      isComplete: hasAvatar,
      importance: 'recommended',
      actionAnchor: 'setting-avatar-section',
    },
    {
      id: 'social',
      label: 'Professional Links',
      description: 'Optional external links (LinkedIn, GitHub, or personal website) for recruiters to connect.',
      isComplete: hasSocial,
      importance: 'recommended',
      actionAnchor: 'setting-linkedin',
    },
  ]

  const completedCount = items.filter((i) => i.isComplete).length
  const totalCount = items.length
  const missingEssentialCount = items.filter((i) => !i.isComplete && i.importance === 'essential').length
  const missingRecommendedCount = items.filter((i) => !i.isComplete && i.importance === 'recommended').length

  // A portfolio is ready to share ONLY if all essential requirements AND required proof of work (public project) are met
  const isReadyToShare = missingEssentialCount === 0

  let statusLabel: PortfolioReadinessSummary['statusLabel'] = 'Incomplete'
  let recommendation = 'Complete the essential profile details and publish an applied capstone project to make your portfolio share-ready.'

  if (isReadyToShare) {
    statusLabel = 'Ready to Share'
    recommendation = 'Your portfolio has the essential information and proof of work needed to share publicly.'
  } else if (!isPublic) {
    statusLabel = 'Incomplete'
    recommendation = 'Your portfolio is currently private. Turn on public visibility and publish your proof of work before sharing.'
  } else if (!hasProject) {
    statusLabel = 'Needs Attention'
    recommendation = 'Publish at least one public capstone or case study deliverable to provide proof of work before sharing.'
  } else {
    statusLabel = 'Incomplete'
    recommendation = 'Add your display name, handle, and a short professional bio to make your portfolio share-ready.'
  }

  return {
    isReadyToShare,
    completedCount,
    totalCount,
    items,
    missingEssentialCount,
    missingRecommendedCount,
    statusLabel,
    recommendation,
  }
}
