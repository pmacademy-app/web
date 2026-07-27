/**
 * XP & Progression Business Logic Module (PRD.md §4.6, Architecture.md §6).
 */

export const XP_VALUES = {
  THEORY_READ: 10,
  QUIZ_CORRECT: 5,
  QUIZ_PERFECT_BONUS: 25,
  FLASHCARD_REVIEW: 2,
  REFLECTION_SUBMITTED: 15,
  CAPSTONE_SUBMITTED: 150,
  DAILY_STREAK_BASE: 5,
} as const

export const LEVEL_TITLES: { level: number; title: string; minXp: number }[] = [
  { level: 1, title: 'Associate PM Trainee', minXp: 0 },
  { level: 2, title: 'Junior PM', minXp: 250 },
  { level: 3, title: 'PM', minXp: 750 },
  { level: 4, title: 'Senior PM', minXp: 1500 },
  { level: 5, title: 'Lead PM', minXp: 2750 },
  { level: 6, title: 'Group PM', minXp: 4500 },
  { level: 7, title: 'Principal PM', minXp: 7000 },
  { level: 8, title: 'VP Product', minXp: 10000 },
  { level: 9, title: 'Chief Product Officer', minXp: 14000 },
]

export function getTitleForXp(xp: number): { level: number; title: string } {
  let currentLevel = LEVEL_TITLES[0]
  for (const entry of LEVEL_TITLES) {
    if (xp >= entry.minXp) {
      currentLevel = entry
    } else {
      break
    }
  }
  return { level: currentLevel.level, title: currentLevel.title }
}

/**
 * Anti-gaming verification for Theory reading XP.
 * Requires minimum active dwell time (e.g. 60 seconds) AND scroll depth percentage >= 80%.
 */
export function verifyTheoryReadEngagement(
  activeDwellTimeSeconds: number,
  scrollDepthPercent: number,
  estMinutesReading: number = 25
): { isEligible: boolean; reason?: string } {
  // Minimum required time is 20% of estimated reading time or at least 45s
  const minRequiredTimeSeconds = Math.max(45, Math.floor(estMinutesReading * 60 * 0.2))

  if (activeDwellTimeSeconds < minRequiredTimeSeconds) {
    return {
      isEligible: false,
      reason: `Minimum active reading time not met (${activeDwellTimeSeconds}s / ${minRequiredTimeSeconds}s required).`,
    }
  }

  if (scrollDepthPercent < 80) {
    return {
      isEligible: false,
      reason: `Insufficient scroll depth (${Math.round(scrollDepthPercent)}% / 80% required).`,
    }
  }

  return { isEligible: true }
}
