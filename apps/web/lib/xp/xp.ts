export const XP_VALUES = {
  THEORY_READ: 10,
  QUIZ_CORRECT: 5,
  QUIZ_PERFECT_BONUS: 25,
  FLASHCARD_REVIEW: 2,
  REFLECTION_SUBMITTED: 15,
  CAPSTONE_SUBMITTED: 150,
  DAILY_STREAK_BASE: 5,
} as const

export type XpSourceType =
  | 'theory_read'
  | 'quiz_correct'
  | 'quiz_bonus'
  | 'flashcard'
  | 'reflection'
  | 'capstone'
  | 'streak'
  | 'user_reset'
  | 'admin_reset'

export interface LevelThreshold {
  level: number
  title: string
  minXp: number
}

export const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 1, title: 'Associate PM Trainee', minXp: 0 },
  { level: 2, title: 'Junior PM', minXp: 250 },
  { level: 3, title: 'PM', minXp: 750 },
  { level: 4, title: 'Senior PM', minXp: 1500 },
  { level: 5, title: 'Group PM', minXp: 2750 },
  { level: 6, title: 'VP Product', minXp: 4500 },
  { level: 7, title: 'Chief Product Officer', minXp: 7000 },
  { level: 8, title: 'Chief Product Officer', minXp: 10000 },
  { level: 9, title: 'Chief Product Officer', minXp: 14000 },
]

export const LEVEL_TITLES = LEVEL_THRESHOLDS

export interface LevelInfo {
  level: number
  title: string
  progress: number
  progressRatio: number
  xpRemaining: number
  currentLevelMinXp: number
  nextLevelMinXp: number
}

export function calculateLevel(totalXp: number): LevelInfo {
  const sanitizedXp = Math.max(0, Math.floor(totalXp || 0))

  let currentThreshold = LEVEL_THRESHOLDS[0]
  let nextThreshold: LevelThreshold | null = LEVEL_THRESHOLDS[1] ?? null

  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (sanitizedXp >= LEVEL_THRESHOLDS[i].minXp) {
      currentThreshold = LEVEL_THRESHOLDS[i]
      nextThreshold = LEVEL_THRESHOLDS[i + 1] ?? null
    } else {
      break
    }
  }

  if (!nextThreshold) {
    return {
      level: currentThreshold.level,
      title: currentThreshold.title,
      progress: 100,
      progressRatio: 1.0,
      xpRemaining: 0,
      currentLevelMinXp: currentThreshold.minXp,
      nextLevelMinXp: currentThreshold.minXp,
    }
  }

  const xpInCurrentLevel = sanitizedXp - currentThreshold.minXp
  const xpNeededForNextLevel = nextThreshold.minXp - currentThreshold.minXp
  const xpRemaining = Math.max(0, nextThreshold.minXp - sanitizedXp)

  const progressRatio = Math.min(1.0, Math.max(0.0, xpInCurrentLevel / xpNeededForNextLevel))
  const progress = Math.min(100, Math.max(0, Math.round(progressRatio * 100)))

  return {
    level: currentThreshold.level,
    title: currentThreshold.title,
    progress,
    progressRatio,
    xpRemaining,
    currentLevelMinXp: currentThreshold.minXp,
    nextLevelMinXp: nextThreshold.minXp,
  }
}

export function getTitleForXp(xp: number): { level: number; title: string } {
  const info = calculateLevel(xp)
  return { level: info.level, title: info.title }
}

export function getLevelTitle(level: number): string {
  const entry = LEVEL_THRESHOLDS.find((e) => e.level === level)
  return entry?.title ?? LEVEL_THRESHOLDS[0].title
}

export function getXpAmountForSource(
  sourceType: XpSourceType,
  payload?: { correctCount?: number; isPerfect?: boolean }
): number {
  switch (sourceType) {
    case 'theory_read':
      return XP_VALUES.THEORY_READ
    case 'quiz_correct':
      return (payload?.correctCount ?? 1) * XP_VALUES.QUIZ_CORRECT
    case 'quiz_bonus':
      return XP_VALUES.QUIZ_PERFECT_BONUS
    case 'flashcard':
      return XP_VALUES.FLASHCARD_REVIEW
    case 'reflection':
      return XP_VALUES.REFLECTION_SUBMITTED
    case 'capstone':
      return XP_VALUES.CAPSTONE_SUBMITTED
    case 'streak':
      return XP_VALUES.DAILY_STREAK_BASE
    default:
      return 0
  }
}

export function calculateQuizXp(
  correctCount: number,
  totalQuestions: number,
  isFirstAttempt: boolean,
  alreadyAwardedQuizXp: number = 0
): { incrementalQuizXp: number; perfectBonusXp: number; totalXp: number } {
  const maxPossibleQuizXp = Math.max(0, correctCount) * XP_VALUES.QUIZ_CORRECT
  const incrementalQuizXp = Math.max(0, maxPossibleQuizXp - alreadyAwardedQuizXp)

  let perfectBonusXp = 0
  if (isFirstAttempt && totalQuestions > 0 && correctCount === totalQuestions) {
    perfectBonusXp = XP_VALUES.QUIZ_PERFECT_BONUS
  }

  return {
    incrementalQuizXp,
    perfectBonusXp,
    totalXp: incrementalQuizXp + perfectBonusXp,
  }
}

export function verifyTheoryReadEngagement(
  activeDwellTimeSeconds: number,
  scrollDepthPercent: number,
  estMinutesReading: number = 2
): { isEligible: boolean; reason?: string } {
  if (activeDwellTimeSeconds < 0 || scrollDepthPercent < 0) {
    return { isEligible: false, reason: 'Invalid negative engagement metrics.' }
  }

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
