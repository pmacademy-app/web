import { BADGE_DEFINITIONS, type BadgeDefinition } from '../../config/badges'

export interface UserStatsForBadges {
  lessonsCompletedCount: number
  modulesCompletedCount: number
  perfectFirstAttemptQuizCount: number
  perfectQuizCount: number
  totalXp: number
  level: number
  currentStreak: number
  longestStreak: number
  capstonesSubmittedCount: number
  isPortfolioPublic: boolean
  usedStreakFreeze?: boolean
  email?: string
  name?: string
}

export interface BadgeProgressItem {
  definition: BadgeDefinition
  isEarned: boolean
  earnedAt: string | null
  currentValue: number
  targetValue: number
  progressPercentage: number
}

export function calculateBadgeProgress(
  badge: BadgeDefinition,
  stats: UserStatsForBadges,
  isEarned: boolean = false,
  earnedAt: string | null = null
): BadgeProgressItem {
  let currentValue = 0

  switch (badge.key) {
    case 'first_lesson':
    case 'curriculum_explorer':
    case 'pm_academy_graduate':
      currentValue = stats.lessonsCompletedCount
      break
    case 'module_complete':
      currentValue = stats.modulesCompletedCount
      break
    case 'first_perfect_quiz':
      currentValue = stats.perfectFirstAttemptQuizCount
      break
    case 'quiz_master':
      currentValue = stats.perfectQuizCount
      break
    case 'first_level_up':
      currentValue = stats.level
      break
    case 'xp_1000':
    case 'xp_5000':
      currentValue = stats.totalXp
      break
    case 'streak_7':
    case 'streak_30':
      currentValue = Math.max(stats.currentStreak, stats.longestStreak)
      break
    case 'streak_comeback':
      currentValue = stats.usedStreakFreeze ? 1 : 0
      break
    case 'first_capstone':
    case 'capstones_all':
      currentValue = stats.capstonesSubmittedCount
      break
    case 'portfolio_published':
      currentValue = stats.isPortfolioPublic ? 1 : 0
      break
    default:
      currentValue = 0
  }

  const targetValue = badge.targetGoal
  const clampedValue = Math.min(targetValue, Math.max(0, currentValue))
  const progressPercentage = isEarned
    ? 100
    : Math.min(100, Math.round((clampedValue / targetValue) * 100))

  return {
    definition: badge,
    isEarned: isEarned || clampedValue >= targetValue,
    earnedAt,
    currentValue: clampedValue,
    targetValue,
    progressPercentage,
  }
}

export function evaluateEligibleBadges(
  stats: UserStatsForBadges,
  alreadyEarnedKeys: Set<string>
): BadgeDefinition[] {
  const newlyEarned: BadgeDefinition[] = []

  for (const badge of BADGE_DEFINITIONS) {
    if (alreadyEarnedKeys.has(badge.key)) {
      continue
    }

    const progress = calculateBadgeProgress(badge, stats)
    if (progress.isEarned) {
      newlyEarned.push(badge)
    }
  }

  return newlyEarned
}
