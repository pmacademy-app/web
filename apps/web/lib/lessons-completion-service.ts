import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

type ProgressRow = Database['public']['Tables']['user_lesson_progress']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Service responsible for lesson completion verification and persistence.
 * References: PRD.md §4.3, Architecture.md §5
 *
 * v2 migration: accepts stable `lesson_id` (les_XXXXXX) instead of slug.
 * The `lesson_slug` DB column has been renamed to `lesson_id` in migration
 * 20260802000001_lesson_id_migration.sql.
 */
export async function completeLesson(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,  // stable les_XXXXXX ID (was: lessonSlug)
  quizScore: number,
  additionalXp: number
): Promise<{ completed_at: string; status: 'completed'; xp_earned: number }> {
  const now = new Date().toISOString()

  // 1. Fetch current progress
  const { data: progress } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  const currentAttempts = progress?.quiz_attempts ?? 0
  const prevScore = progress?.quiz_score ?? 0
  const prevXpEarned = progress?.xp_earned ?? 0
  const completedAt = progress?.completed_at ?? now

  // 2. Persist lesson completion progress
  const { data: updated, error } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .upsert({
      user_id: userId,
      lesson_id: lessonId,
      status: 'completed',
      quiz_score: Math.max(prevScore, quizScore),
      quiz_attempts: currentAttempts + 1,
      xp_earned: prevXpEarned + additionalXp,
      completed_at: completedAt,
    }, { onConflict: 'user_id,lesson_id' })
    .select()
    .single()) as unknown as { data: ProgressRow | null; error: unknown }

  if (error || !updated) {
    console.error(`[lessons-completion-service] Error marking lesson completed:`, error)
    throw new Error('Failed to update lesson completion status')
  }

  return {
    completed_at: updated.completed_at || now,
    status: 'completed',
    xp_earned: updated.xp_earned,
  }
}

/**
 * Verifies if a lesson is unlocked for a given user using stable lesson IDs.
 * A lesson is unlocked if the immediately preceding lesson (by curriculum order)
 * is already completed, OR if it is lesson 1 (no prerequisite).
 *
 * References: Architecture.md §5, sequential unlock check.
 *
 * @param supabase - Server-side Supabase client
 * @param userId   - Authenticated user's UUID
 * @param lessonId - Stable les_XXXXXX ID of the lesson to check
 * @param prevLessonId - Stable les_XXXXXX ID of the preceding lesson (null for lesson 1)
 */
export async function isLessonUnlocked(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  prevLessonId: string | null
): Promise<boolean> {
  // First lesson in the curriculum is always unlocked
  if (!prevLessonId) return true

  // Check if user has curriculum_access_override set to true
  const { data: user } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('curriculum_access_override')
    .eq('id', userId)
    .maybeSingle()) as unknown as { data: { curriculum_access_override?: boolean } | null; error: unknown }

  if (user?.curriculum_access_override) return true

  const { data: prevProgress } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('status')
    .eq('user_id', userId)
    .eq('lesson_id', prevLessonId)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  return !!prevProgress && prevProgress.status === 'completed'
}

/**
 * Legacy unlock check: accepts lesson order number, constructs the
 * old-style slug for the preceding lesson, and queries the lesson_id column
 * with the slug value. Used by the v1 route during the Phase 1.3 transition
 * where rows were written with slug values before the ID backfill in Phase 1.4.
 *
 * @deprecated Use isLessonUnlocked() with stable IDs for v2 routes
 */
export async function isLessonUnlockedByOrderNumber(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonNumber: number
): Promise<boolean> {
  if (lessonNumber <= 1) return true

  const { data: user } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('curriculum_access_override')
    .eq('id', userId)
    .maybeSingle()) as unknown as { data: { curriculum_access_override?: boolean } | null; error: unknown }

  if (user?.curriculum_access_override) return true

  const prevNum = lessonNumber - 1
  // During Phase 1.3, old rows still have slug values in the lesson_id column
  const prevLessonSlug = `lesson-${String(prevNum).padStart(3, '0')}`

  const { data: prevProgress } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('status')
    .eq('user_id', userId)
    .eq('lesson_id', prevLessonSlug)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  return !!prevProgress && prevProgress.status === 'completed'
}

/**
 * Returns the index of the first locked lesson for a user.
 * The user is allowed to access any lesson with an index strictly less than this returned index.
 * If all lessons are unlocked (or if the curriculum override is on), returns -1.
 * 
 * @param supabase - Server-side Supabase client
 * @param userId - Authenticated user's UUID
 * @param curriculumLessonIds - Array of stable les_XXXXXX IDs in the correct global order
 */
export async function getFirstLockedLessonIndex(
  supabase: SupabaseClient<Database>,
  userId: string,
  curriculumLessonIds: string[]
): Promise<number> {
  // Check if user has curriculum_access_override set to true
  const { data: user } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('curriculum_access_override')
    .eq('id', userId)
    .maybeSingle()) as unknown as { data: { curriculum_access_override?: boolean } | null; error: unknown }

  if (user?.curriculum_access_override) return -1 // All unlocked

  // Fetch all completed lessons for user
  const { data: progress } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('status', 'completed')) as unknown as { data: { lesson_id: string }[] | null; error: unknown }

  const completedIds = new Set(progress?.map((p) => p.lesson_id) || [])

  // Find first lesson in curriculum that is NOT completed
  let firstUncompletedIndex = -1
  for (let i = 0; i < curriculumLessonIds.length; i++) {
    if (!completedIds.has(curriculumLessonIds[i])) {
      firstUncompletedIndex = i
      break
    }
  }

  // If all completed, return -1
  if (firstUncompletedIndex === -1) return -1

  // The user can access `firstUncompletedIndex` since it's the next in line.
  // The first LOCKED index is the one immediately after that.
  return firstUncompletedIndex + 1
}
