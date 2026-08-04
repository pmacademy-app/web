import { readFile } from 'fs/promises'
import path from 'path'
import { verifyTheoryReadEngagement, XP_VALUES } from '@/lib/xp'
import { updateUserStreak } from '@/lib/streaks-db'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { awardXp, hasXpEvent } from '@/lib/xp-service'
import { completeLesson } from '@/lib/lessons-completion-service'


type ProgressRow = Database['public']['Tables']['user_lesson_progress']['Row']
type ReflectionRow = Database['public']['Tables']['reflections']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

// Path to v2 compiled lesson files (content/dist/lessons/*.json)
const DIST_LESSONS_DIR = path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'lessons')

/**
 * Handles the business logic for verifying theory reading engagement, updating lesson progress,
 * awarding XP, and logging the user activity for streak counts.
 *
 * v2 migration: accepts stable `lessonId` (les_XXXXXX) and queries `lesson_id` column.
 */
export async function recordTheoryReadAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,  // stable les_XXXXXX ID
  activeSeconds: number,
  scrollPercentage: number
) {
  // 1. Read v2 compiled JSON to get reading estimate
  let estMinutesReading = 2
  try {
    if (/^les_[a-z0-9]+$/.test(lessonId)) {
      const filePath = path.join(DIST_LESSONS_DIR, `${lessonId}.json`)
      const raw = await readFile(filePath, 'utf-8')
      const lesson = JSON.parse(raw)
      estMinutesReading = lesson?.estimatedReadingTime ?? 2
    }
  } catch (e) {
    console.warn(`[lessons-db] Lesson file not found for ${lessonId}. Defaulting to 2 mins.`, e)
  }

  // 2. Validate reading engagement anti-gaming thresholds
  const verifyResult = verifyTheoryReadEngagement(
    activeSeconds,
    scrollPercentage,
    estMinutesReading
  )

  if (!verifyResult.isEligible) {
    throw new Error(verifyResult.reason || 'Engagement threshold not met.')
  }

  // Check ledger for existing theory_read event first to ensure idempotency
  const existingRead = await hasXpEvent(supabase, userId, 'theory_read', lessonId)

  // 3. Retrieve current progress
  const { data: progress, error: fetchError } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  if (fetchError) throw fetchError

  // If theory has already been read, return early
  if (existingRead || progress?.theory_read_at) {
    return { success: true, xpEarned: 0, message: 'Theory already read.' }
  }

  const now = new Date().toISOString()
  const newStatus = progress?.status === 'completed' ? 'completed' : 'in_progress'
  const newXpEarned = (progress?.xp_earned ?? 0) + XP_VALUES.THEORY_READ

  // 4. Update progress and log theory read timestamp
  const { error: progressError } = await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .upsert({
      user_id: userId,
      lesson_id: lessonId,
      status: newStatus,
      theory_read_at: now,
      xp_earned: newXpEarned,
    }, { onConflict: 'user_id,lesson_id' })

  if (progressError) throw progressError

  // 5. Award theory read XP via canonical XP service
  try {
    await awardXp(
      supabase,
      userId,
      'theory_read',
      XP_VALUES.THEORY_READ,
      lessonId
    )
  } catch (xpError) {
    console.error(`[lessons-db] Error creating theory_read XP event:`, xpError)
  }

  // 6. Trigger streak update
  await updateUserStreak(supabase, userId)

  return { success: true, xpEarned: XP_VALUES.THEORY_READ }
}

/**
 * Handles the business logic for logging quiz attempts, computing scores, updating lesson completion,
 * awarding correct answer and perfect first-attempt bonus XP, and logging streak progress.
 *
 * v2 migration: accepts stable `lessonId` (les_XXXXXX) and queries `lesson_id` column.
 */
export async function recordQuizAttemptAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,  // stable les_XXXXXX ID
  attempts: { question_id: string; selected_option: number }[]
) {
  const totalQuestions = attempts.length
  if (totalQuestions === 0) {
    throw new Error('Attempts array cannot be empty')
  }

  // 1. Read compile lesson JSON to validate quiz responses
  let lesson
  try {
    const filePath = path.join(DIST_LESSONS_DIR, `${lessonId}.json`)
    const raw = await readFile(filePath, 'utf-8')
    lesson = JSON.parse(raw)
  } catch {
    throw new Error(`Lesson content file not found for ${lessonId}`)
  }

  const quizBlock = lesson?.blocks?.find((b: { type: string }) => b.type === 'quiz')
  if (!quizBlock) {
    throw new Error(`Quiz block not found in lesson content for ${lessonId}`)
  }

  const quizQuestions = quizBlock.questions || []
  const questionMap = new Map<string, number>()
  for (const q of quizQuestions) {
    questionMap.set(q.id, q.correctAnswer)
  }

  // Compute correctness server-side (ignore client inputs)
  const validatedAttempts = attempts.map((a) => {
    const correctAnswer = questionMap.get(a.question_id)
    if (correctAnswer === undefined) {
      throw new Error(`Question ID ${a.question_id} not found in quiz for lesson ${lessonId}`)
    }
    return {
      question_id: a.question_id,
      selected_option: a.selected_option,
      is_correct: a.selected_option === correctAnswer,
    }
  })

  const correctCount = validatedAttempts.filter((a) => a.is_correct).length
  const scorePercentage = Math.round((correctCount / totalQuestions) * 100)

  // 2. Insert individual question attempts (insert rows using validatedAttempts)
  const insertRows = validatedAttempts.map((a) => ({
    user_id: userId,
    lesson_id: lessonId,
    question_id: a.question_id,
    selected_option: a.selected_option,
    is_correct: a.is_correct,
  }))

  const { error: attemptsInsertError } = await (supabase
    .from('quiz_attempts') as unknown as DBChain)
    .insert(insertRows)

  if (attemptsInsertError) throw attemptsInsertError

  // 3. Fetch existing progress
  const { data: progress, error: progressFetchError } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  if (progressFetchError) throw progressFetchError

  const isFirstAttempt = !progress || progress.quiz_attempts === 0

  // 4. Query total quiz_correct XP already awarded from ledger
  const { data: existingQuizEvents } = await (supabase
    .from('xp_events') as unknown as DBChain)
    .select('xp_amount')
    .eq('user_id', userId)
    .eq('source_type', 'quiz_correct')
    .eq('source_id', lessonId) as unknown as { data: { xp_amount: number }[] | null }

  const alreadyAwardedXp = existingQuizEvents?.reduce((sum, e) => sum + e.xp_amount, 0) ?? 0
  const maxPossibleXp = correctCount * XP_VALUES.QUIZ_CORRECT
  const incrementalXp = Math.max(0, maxPossibleXp - alreadyAwardedXp)

  // 5. Award perfect score bonus on first attempt only (with ledger guard)
  let perfectBonusXp = 0
  if (isFirstAttempt && correctCount === totalQuestions) {
    const hasBonus = await hasXpEvent(supabase, userId, 'quiz_bonus', lessonId)
    if (!hasBonus) {
      perfectBonusXp = XP_VALUES.QUIZ_PERFECT_BONUS
    }
  }

  const totalXpToAward = incrementalXp + perfectBonusXp

  // 6. Persist lesson completion progress via canonical completion service
  await completeLesson(
    supabase,
    userId,
    lessonId,
    scorePercentage,
    totalXpToAward
  )

  // 7. Log XP events via canonical XP service
  if (incrementalXp > 0) {
    try {
      await awardXp(
        supabase,
        userId,
        'quiz_correct',
        incrementalXp,
        lessonId
      )
    } catch (xpError) {
      console.error(`[lessons-db] Error logging quiz_correct XP:`, xpError)
    }
  }

  if (perfectBonusXp > 0) {
    try {
      await awardXp(
        supabase,
        userId,
        'quiz_bonus',
        perfectBonusXp,
        lessonId
      )
    } catch (bonusError) {
      console.error(`[lessons-db] Error logging quiz_bonus XP:`, bonusError)
    }
  }

  // 8. Update user streak
  await updateUserStreak(supabase, userId)

  return {
    success: true,
    correctCount,
    totalQuestions,
    scorePercentage,
    xpEarned: totalXpToAward,
    isPerfect: correctCount === totalQuestions,
    isFirstAttempt,
  }
}


/**
 * Handles the business logic for recording reflections, syncing lesson progress XP,
 * and managing public visibility settings for portfolio exports.
 *
 * v2 migration: accepts stable `lessonId` (les_XXXXXX) and queries `lesson_id` column.
 */
export async function recordReflectionAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,  // stable les_XXXXXX ID (was: lessonSlug)
  content: string,
  isPublic: boolean
) {
  // 1. Query for existing reflection to determine first submission
  const { data: existing, error: selectError } = (await (supabase
    .from('reflections') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()) as unknown as { data: ReflectionRow | null; error: unknown }

  if (selectError) throw selectError

  // Check ledger for existing reflection event first to ensure idempotency
  const xpAlreadyAwarded = await hasXpEvent(supabase, userId, 'reflection', lessonId)
  const isFirstSubmission = !existing
  let result

  if (isFirstSubmission) {
    // 2. Create new reflection record
    const { data: inserted, error: insertError } = (await (supabase
      .from('reflections') as unknown as DBChain)
      .insert({
        user_id: userId,
        lesson_id: lessonId,
        content,
        is_public: isPublic,
      })
      .select()
      .single()) as unknown as { data: ReflectionRow | null; error: unknown }

    if (insertError) throw insertError
    result = inserted

    if (!xpAlreadyAwarded) {
      // 3. Award reflection XP (15 XP) via canonical XP service
      try {
        await awardXp(
          supabase,
          userId,
          'reflection',
          XP_VALUES.REFLECTION_SUBMITTED,
          lessonId
        )
      } catch (xpError) {
        console.error(`[lessons-db] Error logging reflection XP:`, xpError)
      }

      // 4. Update progress xp_earned
      const { data: progress } = (await (supabase
        .from('user_lesson_progress') as unknown as DBChain)
        .select('*')
        .eq('user_id', userId)
        .eq('lesson_id', lessonId)
        .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

      if (progress) {
        await (supabase
          .from('user_lesson_progress') as unknown as DBChain)
          .update({
            xp_earned: progress.xp_earned + XP_VALUES.REFLECTION_SUBMITTED,
          })
          .eq('user_id', userId)
          .eq('lesson_id', lessonId)
      }
    }
  } else {
    // 2. Update existing reflection record
    const { data: updated, error: updateError } = (await (supabase
      .from('reflections') as unknown as DBChain)
      .update({
        content,
        is_public: isPublic,
      })
      .eq('id', existing.id)
      .select()
      .single()) as unknown as { data: ReflectionRow | null; error: unknown }

    if (updateError) throw updateError
    result = updated
  }

  // 5. Update user streak
  await updateUserStreak(supabase, userId)

  return {
    success: true,
    reflection: result,
    xpEarned: (isFirstSubmission && !xpAlreadyAwarded) ? XP_VALUES.REFLECTION_SUBMITTED : 0,
  }
}
