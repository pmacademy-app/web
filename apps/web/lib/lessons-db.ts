import { readFile } from 'fs/promises'
import path from 'path'
import { verifyTheoryReadEngagement, XP_VALUES } from '@/lib/xp'
import { updateUserStreak } from '@/lib/streaks-db'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { awardXp } from '@/lib/xp-service'
import { completeLesson } from '@/lib/lessons-completion-service'

type ProgressRow = Database['public']['Tables']['user_lesson_progress']['Row']
type ReflectionRow = Database['public']['Tables']['reflections']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Handles the business logic for verifying theory reading engagement, updating lesson progress,
 * awarding XP, and logging the user activity for streak counts.
 */
export async function recordTheoryReadAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  slug: string,
  activeSeconds: number,
  scrollPercentage: number
) {
  // 1. Read static JSON file to get reading estimate
  let estMinutesReading = 2
  try {
    const filePath = path.join(process.cwd(), 'public/content/lessons', `${slug}.json`)
    const raw = await readFile(filePath, 'utf-8')
    const lesson = JSON.parse(raw)
    estMinutesReading = lesson?.meta?.estMinutesReading ?? 2
  } catch (e) {
    console.warn(`[lessons-db] Lesson file not found or unreadable for ${slug}. Defaulting to 2 mins.`, e)
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

  // 3. Retrieve current progress
  const { data: progress, error: fetchError } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_slug', slug)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  if (fetchError) throw fetchError

  // If theory has already been read, return early
  if (progress?.theory_read_at) {
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
      lesson_slug: slug,
      status: newStatus,
      theory_read_at: now,
      xp_earned: newXpEarned,
    }, { onConflict: 'user_id,lesson_slug' })

  if (progressError) throw progressError

  // 5. Award theory read XP via canonical XP service
  try {
    await awardXp(
      supabase,
      userId,
      'theory_read',
      XP_VALUES.THEORY_READ,
      slug
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
 */
export async function recordQuizAttemptAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  slug: string,
  attempts: { question_id: string; selected_option: number; is_correct: boolean }[]
) {
  const totalQuestions = attempts.length
  if (totalQuestions === 0) {
    throw new Error('Attempts array cannot be empty')
  }

  const correctCount = attempts.filter((a) => a.is_correct).length
  const scorePercentage = Math.round((correctCount / totalQuestions) * 100)

  // 1. Insert individual question attempts
  const insertRows = attempts.map((a) => ({
    user_id: userId,
    lesson_slug: slug,
    question_id: a.question_id,
    selected_option: a.selected_option,
    is_correct: a.is_correct,
  }))

  const { error: attemptsInsertError } = await (supabase
    .from('quiz_attempts') as unknown as DBChain)
    .insert(insertRows)

  if (attemptsInsertError) throw attemptsInsertError

  // 2. Fetch existing progress
  const { data: progress, error: progressFetchError } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_slug', slug)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  if (progressFetchError) throw progressFetchError

  const isFirstAttempt = !progress || progress.quiz_attempts === 0
  const prevScorePercent = progress?.quiz_score ?? 0
  const prevCorrect = progress?.quiz_score
    ? Math.round((prevScorePercent / 100) * totalQuestions)
    : 0

  let incrementalXp = 0
  let perfectBonusXp = 0

  // Award XP for each new correct answer (incremental to prevent farming)
  if (correctCount > prevCorrect) {
    incrementalXp = (correctCount - prevCorrect) * XP_VALUES.QUIZ_CORRECT
  }

  // Award perfect score bonus on first attempt only
  if (isFirstAttempt && correctCount === totalQuestions) {
    perfectBonusXp = XP_VALUES.QUIZ_PERFECT_BONUS
  }

  const totalXpToAward = incrementalXp + perfectBonusXp

  // 3. Persist lesson completion progress via canonical completion service
  await completeLesson(
    supabase,
    userId,
    slug,
    scorePercentage,
    totalXpToAward
  )

  // 4. Log XP events via canonical XP service
  if (incrementalXp > 0) {
    try {
      await awardXp(
        supabase,
        userId,
        'quiz_correct',
        incrementalXp,
        slug
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
        slug
      )
    } catch (bonusError) {
      console.error(`[lessons-db] Error logging quiz_bonus XP:`, bonusError)
    }
  }

  // 5. Update user streak
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
 */
export async function recordReflectionAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonSlug: string,
  content: string,
  isPublic: boolean
) {
  // 1. Query for existing reflection to determine first submission
  const { data: existing, error: selectError } = (await (supabase
    .from('reflections') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_slug', lessonSlug)
    .maybeSingle()) as unknown as { data: ReflectionRow | null; error: unknown }

  if (selectError) throw selectError

  const isFirstSubmission = !existing
  let result

  if (isFirstSubmission) {
    // 2. Create new reflection record
    const { data: inserted, error: insertError } = (await (supabase
      .from('reflections') as unknown as DBChain)
      .insert({
        user_id: userId,
        lesson_slug: lessonSlug,
        content,
        is_public: isPublic,
      })
      .select()
      .single()) as unknown as { data: ReflectionRow | null; error: unknown }

    if (insertError) throw insertError
    result = inserted

    // 3. Award reflection XP (15 XP) via canonical XP service
    try {
      await awardXp(
        supabase,
        userId,
        'reflection',
        XP_VALUES.REFLECTION_SUBMITTED,
        lessonSlug
      )
    } catch (xpError) {
      console.error(`[lessons-db] Error logging reflection XP:`, xpError)
    }

    // 4. Update progress xp_earned
    const { data: progress } = (await (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('*')
      .eq('user_id', userId)
      .eq('lesson_slug', lessonSlug)
      .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

    if (progress) {
      await (supabase
        .from('user_lesson_progress') as unknown as DBChain)
        .update({
          xp_earned: progress.xp_earned + XP_VALUES.REFLECTION_SUBMITTED,
        })
        .eq('user_id', userId)
        .eq('lesson_slug', lessonSlug)
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
    xpEarned: isFirstSubmission ? XP_VALUES.REFLECTION_SUBMITTED : 0,
  }
}
