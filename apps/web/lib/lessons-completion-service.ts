import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

type ProgressRow = Database['public']['Tables']['user_lesson_progress']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Service responsible for lesson completion verification and persistence (PRD.md §4.3, Architecture.md §5).
 */
export async function completeLesson(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonSlug: string,
  quizScore: number,
  additionalXp: number
): Promise<{ completed_at: string; status: 'completed'; xp_earned: number }> {
  const now = new Date().toISOString()

  // 1. Fetch current progress
  const { data: progress } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_slug', lessonSlug)
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
      lesson_slug: lessonSlug,
      status: 'completed',
      quiz_score: Math.max(prevScore, quizScore),
      quiz_attempts: currentAttempts + 1,
      xp_earned: prevXpEarned + additionalXp,
      completed_at: completedAt,
    }, { onConflict: 'user_id,lesson_slug' })
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
 * Verifies if a lesson is unlocked for a given user (Architecture.md §5, sequential unlock check).
 */
export async function isLessonUnlocked(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonNumber: number
): Promise<boolean> {
  if (lessonNumber <= 1) return true

  const prevNum = lessonNumber - 1
  const prevLessonSlug = `lesson-${String(prevNum).padStart(3, '0')}`

  const { data: prevProgress } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_slug', prevLessonSlug)
    .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

  return !!prevProgress && prevProgress.status === 'completed'
}
