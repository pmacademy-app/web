import { CURRICULUM_LESSON_COUNT, countCompletedModules } from '@/lib/curriculum-registry'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import { getTotalXp } from '../xp/xp-service'
import { getLessonIdsForModule } from '../curriculum-registry'
import { AVATAR_BUCKET } from '../avatar/avatar-service'

/**
 * Stops a reset at the first failed write, so the route answers with an error
 * instead of telling the learner the reset is done while their data is still there.
 */
function throwIfResetFailed(error: { message: string } | null, step: string): void {
  if (error) {
    throw new Error(`Failed to reset ${step}: ${error.message}`)
  }
}

/**
 * Resets user lesson progress, quiz attempts, flashcard SRS, reflections, and capstone submissions.
 * If moduleSlug is provided (and not 'all'), resets progress for canonical lessons in that module.
 * Throws on the first failed delete.
 */
export async function resetProgress(
  supabase: SupabaseClient<Database>,
  userId: string,
  moduleSlug?: string
): Promise<void> {
  if (moduleSlug && moduleSlug !== 'all') {
    const lessonIds = getLessonIdsForModule(moduleSlug)

    // 1. Delete lesson progress for canonical lesson IDs in this module
    if (lessonIds.length > 0) {
      const { error: pErr } = await supabase
        .from('user_lesson_progress')
        .delete()
        .eq('user_id', userId)
        .in('lesson_id', lessonIds)

      throwIfResetFailed(pErr, 'module lesson progress')

      const { error: qErr } = await supabase
        .from('quiz_attempts')
        .delete()
        .eq('user_id', userId)
        .in('lesson_id', lessonIds)

      throwIfResetFailed(qErr, 'module quiz attempts')

      const { error: fErr } = await supabase
        .from('user_flashcard_srs')
        .delete()
        .eq('user_id', userId)
        .in('lesson_id', lessonIds)

      throwIfResetFailed(fErr, 'module flashcards')

      const reflectionKeys = [...lessonIds, `capstone-${moduleSlug}`]
      const { error: rErr } = await supabase
        .from('reflections')
        .delete()
        .eq('user_id', userId)
        .in('lesson_id', reflectionKeys)

      throwIfResetFailed(rErr, 'module reflections')
    } else {
      // Fallback for legacy slug pattern
      const { error: legacyErr } = await supabase
        .from('user_lesson_progress')
        .delete()
        .eq('user_id', userId)
        .ilike('lesson_id', `%${moduleSlug}%`)

      throwIfResetFailed(legacyErr, 'module lesson progress')
    }

    // 2. Delete capstone submissions for this module specifically
    const { error: cErr } = await supabase
      .from('capstone_submissions')
      .delete()
      .eq('user_id', userId)
      .eq('module_slug', moduleSlug)
      
    throwIfResetFailed(cErr, 'module capstones')
  } else {
    // Delete all lesson progress and quiz attempts for full reset
    const { error: pErr } = await supabase
      .from('user_lesson_progress')
      .delete()
      .eq('user_id', userId)

    throwIfResetFailed(pErr, 'lesson progress')

    const { error: qErr } = await supabase
      .from('quiz_attempts')
      .delete()
      .eq('user_id', userId)

    throwIfResetFailed(qErr, 'quiz attempts')

    const { error: cErr } = await supabase
      .from('capstone_submissions')
      .delete()
      .eq('user_id', userId)

    throwIfResetFailed(cErr, 'capstones')

    const { error: fErr } = await supabase
      .from('user_flashcard_srs')
      .delete()
      .eq('user_id', userId)

    throwIfResetFailed(fErr, 'flashcards')

    const { error: rErr } = await supabase
      .from('reflections')
      .delete()
      .eq('user_id', userId)
      
    throwIfResetFailed(rErr, 'reflections')
  }

  // Synchronize progress-derived badges so that reset learning state does not leave orphaned achievements
  await synchronizeProgressBadges(supabase, userId, !moduleSlug || moduleSlug === 'all')
}

export const PROGRESS_DERIVED_BADGE_KEYS = [
  'first_lesson',
  'module_complete',
  'curriculum_explorer',
  'first_perfect_quiz',
  'quiz_master',
  'first_capstone',
  'capstones_all',
  'pm_academy_graduate',
] as const

/**
 * Re-evaluates and resets progress-derived badges when learning progress is reset.
 * Account-level achievements (portfolio_published, streaks, XP milestones) are intentionally preserved.
 */
export async function synchronizeProgressBadges(
  supabase: SupabaseClient<Database>,
  userId: string,
  isFullReset: boolean
): Promise<void> {
  try {
    if (isFullReset) {
      const { data: dbBadges } = await supabase
        .from('badges')
        .select('id')
        .in('key', [...PROGRESS_DERIVED_BADGE_KEYS])

      if (dbBadges && dbBadges.length > 0) {
        const badgeIds = dbBadges.map((b) => b.id)
        await supabase
          .from('user_badges')
          .delete()
          .eq('user_id', userId)
          .in('badge_id', badgeIds)
      }
      return
    }

    // Module-specific reset: evaluate remaining completed lessons & capstones
    const { data: progressRows } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id, status, quiz_score, quiz_attempts')
      .eq('user_id', userId)

    const completed = (progressRows || []).filter((p) => p.status === 'completed')
    const lessonsCount = completed.length
    // Real modules (every registry lesson done), not lessons / 10.
    const modulesCount = countCompletedModules(completed.map((p) => p.lesson_id))
    const perfectFirstAttempt = completed.filter(
      (p) => p.quiz_attempts === 1 && (p.quiz_score ?? 0) === 100
    ).length
    const perfectQuiz = completed.filter((p) => (p.quiz_score ?? 0) === 100).length

    const { data: capstones } = await supabase
      .from('capstone_submissions')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['submitted', 'reviewed'])
    const capstonesCount = capstones?.length ?? 0

    const revokedKeys: string[] = []
    if (lessonsCount < 1) revokedKeys.push('first_lesson')
    if (modulesCount < 1) revokedKeys.push('module_complete')
    if (lessonsCount < 30) revokedKeys.push('curriculum_explorer')
    if (lessonsCount < CURRICULUM_LESSON_COUNT || capstonesCount < 9) revokedKeys.push('pm_academy_graduate')
    if (perfectFirstAttempt < 1) revokedKeys.push('first_perfect_quiz')
    if (perfectQuiz < 10) revokedKeys.push('quiz_master')
    if (capstonesCount < 1) revokedKeys.push('first_capstone')
    if (capstonesCount < 9) revokedKeys.push('capstones_all')

    if (revokedKeys.length > 0) {
      const { data: dbBadges } = await supabase
        .from('badges')
        .select('id')
        .in('key', revokedKeys)

      if (dbBadges && dbBadges.length > 0) {
        const badgeIds = dbBadges.map((b) => b.id)
        await supabase
          .from('user_badges')
          .delete()
          .eq('user_id', userId)
          .in('badge_id', badgeIds)
      }
    }
  } catch (err) {
    console.warn('[settings-service] Warning synchronizing progress badges on reset:', err)
  }
}

/**
 * Resets total XP while preserving the append-only ledger invariant.
 * Calculates current XP balance and inserts a negative xp_events row with source_type = 'user_reset'.
 */
export async function resetXp(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const currentTotalXp = await getTotalXp(supabase, userId)

  if (currentTotalXp > 0) {
    const negativeXp = -currentTotalXp
    const { error } = await supabase
      .from('xp_events')
      .insert({
        user_id: userId,
        source_type: 'user_reset',
        xp_amount: negativeXp,
        source_id: 'settings_reset',
      })

    if (error) {
      console.error('[settings-service] Failed to record XP reset event:', error)
      throw new Error('Failed to record ledger XP reset event.')
    }
  }

  // Update denormalized total_xp cache to 0
  const { error: cacheError } = await supabase
    .from('users')
    .update({ total_xp: 0, level: 1 })
    .eq('id', userId)

  throwIfResetFailed(cacheError, 'XP total')

  return 0
}

/**
 * Resets flashcard SRS review history for user.
 */
export async function resetFlashcards(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_flashcard_srs')
    .delete()
    .eq('user_id', userId)

  if (error) {
    console.error('[settings-service] Error resetting flashcard SRS:', error)
    throw new Error('Failed to reset flashcard SRS queue.')
  }
}

/**
 * Resets user daily streak to 0.
 */
export async function resetStreak(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ current_streak: 0 })
    .eq('id', userId)

  if (error) {
    console.error('[settings-service] Error resetting streak:', error)
    throw new Error('Failed to reset daily streak.')
  }
}

/**
 * Resets Skill Radar progress.
 */
export async function resetSkillRadar(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  // Skill radar is computed dynamically from lesson completion and quiz attempt records.
  // Resetting progress & attempts automatically resets skill radar scores.
  await resetProgress(supabase, userId, 'all')
}

/**
 * Removes the application data of a deleted account that the database cascade does
 * not cover, then deletes the `public.users` row.
 *
 * The learner route calls this AFTER `auth.admin.deleteUser` has succeeded.
 * `public.users.id` references `auth.users(id) ON DELETE CASCADE`, and every
 * user-owned table references `public.users(id) ON DELETE CASCADE` (progress, quiz
 * attempts, flashcards, XP events, reflections, capstones, badges, certificates,
 * leaderboard settings, friends, cohort membership, notification preferences,
 * events, queue and in-app notifications, feedback, referrals, product events).
 * Audit, contact and error rows use ON DELETE SET NULL. So the auth delete alone
 * removes all of that, and there is no per-table loop here.
 *
 * Certificates: `certificates.user_id` is `ON DELETE CASCADE NOT NULL`, so issued
 * certificates are deleted with the account and their verification links stop
 * resolving. They are not retained or anonymised.
 *
 * Storage does not cascade: avatar objects under `avatars/<userId>/` are removed
 * here. The `users` delete is a no-op after the auth delete, and does the cascade
 * for callers that run this before deleting the auth user.
 *
 * Throws on the first failure.
 */
export async function deleteAccount(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  // 1. Avatar objects in Storage (not covered by any foreign key).
  const bucket = supabase.storage.from(AVATAR_BUCKET)
  const { data: avatarFiles, error: listErr } = await bucket.list(userId, { limit: 1000 })
  if (listErr) {
    throw new Error(`Failed to list avatar files during account deletion: ${listErr.message}`)
  }
  const avatarPaths = (avatarFiles ?? []).map((file) => `${userId}/${file.name}`)
  if (avatarPaths.length > 0) {
    const { error: removeErr } = await bucket.remove(avatarPaths)
    if (removeErr) {
      throw new Error(`Failed to remove avatar files during account deletion: ${removeErr.message}`)
    }
  }

  // 2. The profile row. Cascades to every user-owned table.
  const { error: userErr } = await supabase
    .from('users')
    .delete()
    .eq('id', userId)

  if (userErr) {
    throw new Error(`Failed to delete user row during account deletion: ${userErr.message}`)
  }
}
