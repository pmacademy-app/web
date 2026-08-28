export interface XpValuesConfig {
  THEORY_READ: number
  QUIZ_CORRECT: number
  QUIZ_PERFECT_BONUS: number
  FLASHCARD_REVIEW: number
  REFLECTION_SUBMITTED: number
  CAPSTONE_SUBMITTED: number
  DAILY_STREAK_BASE: number
  REFERRAL_ACTIVATION: number
}

export const XP_VALUES: XpValuesConfig = {
  THEORY_READ: 10,
  QUIZ_CORRECT: 5,
  QUIZ_PERFECT_BONUS: 25,
  FLASHCARD_REVIEW: 2,
  REFLECTION_SUBMITTED: 15,
  CAPSTONE_SUBMITTED: 150,
  DAILY_STREAK_BASE: 5,
  REFERRAL_ACTIVATION: 50,
}

let cachedSettings: XpValuesConfig | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 30_000

/**
 * Loads dynamic XP settings configured by admins in system_settings,
 * falling back safely to static XP_VALUES defaults with a 30s cache TTL.
 */
export async function getRuntimeXpValues(
  supabaseClient?: unknown,
  forceFresh = false
): Promise<XpValuesConfig> {
  const now = Date.now()
  if (!forceFresh && cachedSettings && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return cachedSettings
  }

  if (!supabaseClient) return cachedSettings || XP_VALUES

  try {
    const client = supabaseClient as {
      from: (table: string) => {
        select: (col: string) => {
          eq: (k: string, v: string) => {
            maybeSingle: () => Promise<{ data: { value?: Record<string, unknown> } | null; error?: unknown }>
          }
        }
      }
    }
    const { data, error } = await client
      .from('system_settings')
      .select('value')
      .eq('key', 'learning')
      .maybeSingle()

    if (!error && data?.value && typeof data.value === 'object') {
      const v = data.value
      const resolved: XpValuesConfig = {
        THEORY_READ: typeof v.xpPerLessonComplete === 'number' && v.xpPerLessonComplete > 0
          ? v.xpPerLessonComplete
          : XP_VALUES.THEORY_READ,
        QUIZ_CORRECT: typeof v.xpPerQuizPass === 'number' && v.xpPerQuizPass > 0
          ? v.xpPerQuizPass
          : typeof v.xpPerQuizCorrect === 'number' && v.xpPerQuizCorrect > 0
          ? v.xpPerQuizCorrect
          : XP_VALUES.QUIZ_CORRECT,
        QUIZ_PERFECT_BONUS: typeof v.xpQuizPerfectBonus === 'number' && v.xpQuizPerfectBonus >= 0
          ? v.xpQuizPerfectBonus
          : XP_VALUES.QUIZ_PERFECT_BONUS,
        FLASHCARD_REVIEW: typeof v.xpPerFlashcardReview === 'number' && v.xpPerFlashcardReview > 0
          ? v.xpPerFlashcardReview
          : XP_VALUES.FLASHCARD_REVIEW,
        REFLECTION_SUBMITTED: typeof v.xpPerReflection === 'number' && v.xpPerReflection > 0
          ? v.xpPerReflection
          : XP_VALUES.REFLECTION_SUBMITTED,
        CAPSTONE_SUBMITTED: typeof v.xpPerCapstoneSubmitted === 'number' && v.xpPerCapstoneSubmitted > 0
          ? v.xpPerCapstoneSubmitted
          : XP_VALUES.CAPSTONE_SUBMITTED,
        DAILY_STREAK_BASE: typeof v.xpStreakBaseReward === 'number' && v.xpStreakBaseReward > 0
          ? v.xpStreakBaseReward
          : XP_VALUES.DAILY_STREAK_BASE,
        REFERRAL_ACTIVATION: typeof v.xpReferralReward === 'number' && v.xpReferralReward > 0
          ? v.xpReferralReward
          : XP_VALUES.REFERRAL_ACTIVATION,
      }
      cachedSettings = resolved
      cacheTimestamp = now
      return resolved
    }
  } catch (err) {
    console.warn('[getRuntimeXpValues] Fallback to static XP defaults:', err)
  }

  cachedSettings = XP_VALUES
  cacheTimestamp = now
  return XP_VALUES
}


export type XpSourceType =
  | 'theory_read'
  | 'quiz_correct'
  | 'quiz_bonus'
  | 'flashcard'
  | 'reflection'
  | 'capstone'
  | 'streak'
  | 'referral'
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
  payload?: { correctCount?: number; isPerfect?: boolean },
  config?: typeof XP_VALUES
): number {
  const values = config || XP_VALUES
  switch (sourceType) {
    case 'theory_read':
      return values.THEORY_READ
    case 'quiz_correct':
      return (payload?.correctCount ?? 1) * values.QUIZ_CORRECT
    case 'quiz_bonus':
      return values.QUIZ_PERFECT_BONUS
    case 'flashcard':
      return values.FLASHCARD_REVIEW
    case 'reflection':
      return values.REFLECTION_SUBMITTED
    case 'capstone':
      return values.CAPSTONE_SUBMITTED
    case 'streak':
      return values.DAILY_STREAK_BASE
    default:
      return 0
  }
}

export function calculateQuizXp(
  correctCount: number,
  totalQuestions: number,
  isFirstAttempt: boolean,
  alreadyAwardedQuizXp: number = 0,
  config?: typeof XP_VALUES
): { incrementalQuizXp: number; perfectBonusXp: number; totalXp: number } {
  const values = config || XP_VALUES
  const maxPossibleQuizXp = Math.max(0, correctCount) * values.QUIZ_CORRECT
  const incrementalQuizXp = Math.max(0, maxPossibleQuizXp - alreadyAwardedQuizXp)

  let perfectBonusXp = 0
  if (isFirstAttempt && totalQuestions > 0 && correctCount === totalQuestions) {
    perfectBonusXp = values.QUIZ_PERFECT_BONUS
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
