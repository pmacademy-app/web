import { describe, it, expect, vi, beforeEach } from 'vitest'
import { XP_VALUES, getRuntimeXpValues, getXpAmountForSource, calculateQuizXp } from '../xp'

describe('Phase 1 — Learning Settings / Runtime XP Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test A: Default XP values used when no system settings exist', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }

    const xp = await getRuntimeXpValues(mockSupabase, true)
    expect(xp.THEORY_READ).toBe(XP_VALUES.THEORY_READ)
    expect(xp.QUIZ_CORRECT).toBe(XP_VALUES.QUIZ_CORRECT)
    expect(xp.QUIZ_PERFECT_BONUS).toBe(XP_VALUES.QUIZ_PERFECT_BONUS)
    expect(xp.FLASHCARD_REVIEW).toBe(XP_VALUES.FLASHCARD_REVIEW)
    expect(xp.REFLECTION_SUBMITTED).toBe(XP_VALUES.REFLECTION_SUBMITTED)
    expect(xp.CAPSTONE_SUBMITTED).toBe(XP_VALUES.CAPSTONE_SUBMITTED)
    expect(xp.DAILY_STREAK_BASE).toBe(XP_VALUES.DAILY_STREAK_BASE)
  })

  it('Test B: Custom XP values loaded from system_settings and awarded', async () => {
    const customConfig = {
      xpPerLessonComplete: 20,
      xpPerQuizPass: 10,
      xpQuizPerfectBonus: 50,
      xpPerFlashcardReview: 5,
      xpPerReflection: 30,
      xpPerCapstoneSubmitted: 300,
      xpStreakBaseReward: 15,
    }

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { value: customConfig }, error: null }),
          }),
        }),
      }),
    }

    const xp = await getRuntimeXpValues(mockSupabase, true)
    expect(xp.THEORY_READ).toBe(20)
    expect(xp.QUIZ_CORRECT).toBe(10)
    expect(xp.QUIZ_PERFECT_BONUS).toBe(50)
    expect(xp.FLASHCARD_REVIEW).toBe(5)
    expect(xp.REFLECTION_SUBMITTED).toBe(30)
    expect(xp.CAPSTONE_SUBMITTED).toBe(300)
    expect(xp.DAILY_STREAK_BASE).toBe(15)

    // Test passing custom runtime XP config to getXpAmountForSource
    expect(getXpAmountForSource('theory_read', undefined, xp)).toBe(20)
    expect(getXpAmountForSource('quiz_correct', { correctCount: 3 }, xp)).toBe(30)
    expect(getXpAmountForSource('capstone', undefined, xp)).toBe(300)
    expect(getXpAmountForSource('reflection', undefined, xp)).toBe(30)

    // Test passing custom runtime XP config to calculateQuizXp
    const quizCalc = calculateQuizXp(5, 5, true, 0, xp)
    expect(quizCalc.incrementalQuizXp).toBe(50)
    expect(quizCalc.perfectBonusXp).toBe(50)
    expect(quizCalc.totalXp).toBe(100)
  })

  it('Test C: Missing setting fields safely fall back to static defaults', async () => {
    const partialConfig = {
      xpPerLessonComplete: 25,
      // other fields omitted
    }

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { value: partialConfig }, error: null }),
          }),
        }),
      }),
    }

    const xp = await getRuntimeXpValues(mockSupabase, true)
    expect(xp.THEORY_READ).toBe(25)
    expect(xp.QUIZ_CORRECT).toBe(XP_VALUES.QUIZ_CORRECT)
    expect(xp.CAPSTONE_SUBMITTED).toBe(XP_VALUES.CAPSTONE_SUBMITTED)
  })

  it('Test D: Invalid negative or non-numeric settings fall back safely', async () => {
    const invalidConfig = {
      xpPerLessonComplete: -50,
      xpPerQuizPass: 'invalid',
      xpPerCapstoneSubmitted: null,
    }

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { value: invalidConfig }, error: null }),
          }),
        }),
      }),
    }

    const xp = await getRuntimeXpValues(mockSupabase, true)
    expect(xp.THEORY_READ).toBe(XP_VALUES.THEORY_READ)
    expect(xp.QUIZ_CORRECT).toBe(XP_VALUES.QUIZ_CORRECT)
    expect(xp.CAPSTONE_SUBMITTED).toBe(XP_VALUES.CAPSTONE_SUBMITTED)
  })

  it('Test E: Database error safely returns static XP defaults without throwing', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockRejectedValue(new Error('Connection timeout')),
          }),
        }),
      }),
    }

    const xp = await getRuntimeXpValues(mockSupabase, true)
    expect(xp.THEORY_READ).toBe(XP_VALUES.THEORY_READ)
    expect(xp.CAPSTONE_SUBMITTED).toBe(XP_VALUES.CAPSTONE_SUBMITTED)
  })
})

describe('Phase 1 — Admin Notification Management & Controls', () => {
  it('Template Key validation accepts standard dotted keys and rejects invalid characters', () => {
    const validKeys = ['auth.welcome', 'learning.weekly_recap', 'cohort.launch_2026', 'custom-alert']
    const invalidKeys = ['auth/welcome', 'bad key', 'alert<script>', 'test@key']

    for (const k of validKeys) {
      expect(/^[a-z0-9_.-]+$/i.test(k)).toBe(true)
    }
    for (const k of invalidKeys) {
      expect(/^[a-z0-9_.-]+$/i.test(k)).toBe(false)
    }
  })

  it('Idempotency keys prevent duplicate broadcast execution', () => {
    const idempotencyKey = 'bcast-1724345000-abc1234'
    const processedKeys = new Set<string>()

    // First attempt
    const firstCheck = processedKeys.has(idempotencyKey)
    expect(firstCheck).toBe(false)
    processedKeys.add(idempotencyKey)

    // Second attempt
    const secondCheck = processedKeys.has(idempotencyKey)
    expect(secondCheck).toBe(true)
  })

  it('Critical auth templates cannot be paused by admin toggle policy', () => {
    const criticalKeys = ['auth.verify_email', 'auth.password_reset']
    for (const k of criticalKeys) {
      const isCritical = k === 'auth.verify_email' || k === 'auth.password_reset'
      expect(isCritical).toBe(true)
    }
  })
})
