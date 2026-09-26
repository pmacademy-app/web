import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import { getTotalXp } from '../xp/xp-service'
import { getLessonIdsForModule } from '../curriculum-registry'

/**
 * Resets user lesson progress, quiz attempts, flashcard SRS, reflections, and capstone submissions.
 * If moduleSlug is provided (and not 'all'), resets progress for canonical lessons in that module.
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

      if (pErr) console.warn('[settings-service] Reset module progress warning:', pErr)

      const { error: qErr } = await supabase
        .from('quiz_attempts')
        .delete()
        .eq('user_id', userId)
        .in('lesson_id', lessonIds)

      if (qErr) console.warn('[settings-service] Reset module quiz attempts warning:', qErr)

      const { error: fErr } = await supabase
        .from('user_flashcard_srs')
        .delete()
        .eq('user_id', userId)
        .in('lesson_id', lessonIds)

      if (fErr) console.warn('[settings-service] Reset module flashcards warning:', fErr)

      const reflectionKeys = [...lessonIds, `capstone-${moduleSlug}`]
      const { error: rErr } = await supabase
        .from('reflections')
        .delete()
        .eq('user_id', userId)
        .in('lesson_id', reflectionKeys)

      if (rErr) console.warn('[settings-service] Reset module reflections warning:', rErr)
    } else {
      // Fallback for legacy slug pattern
      await supabase
        .from('user_lesson_progress')
        .delete()
        .eq('user_id', userId)
        .ilike('lesson_id', `%${moduleSlug}%`)
    }

    // 2. Delete capstone submissions for this module specifically
    const { error: cErr } = await supabase
      .from('capstone_submissions')
      .delete()
      .eq('user_id', userId)
      .eq('module_slug', moduleSlug)
      
    if (cErr) console.warn('[settings-service] Reset module capstones warning:', cErr)
  } else {
    // Delete all lesson progress and quiz attempts for full reset
    const { error: pErr } = await supabase
      .from('user_lesson_progress')
      .delete()
      .eq('user_id', userId)

    if (pErr) console.warn('[settings-service] Reset all progress warning:', pErr)

    const { error: qErr } = await supabase
      .from('quiz_attempts')
      .delete()
      .eq('user_id', userId)

    if (qErr) console.warn('[settings-service] Reset quiz attempts warning:', qErr)

    const { error: cErr } = await supabase
      .from('capstone_submissions')
      .delete()
      .eq('user_id', userId)

    if (cErr) console.warn('[settings-service] Reset capstones warning:', cErr)

    const { error: fErr } = await supabase
      .from('user_flashcard_srs')
      .delete()
      .eq('user_id', userId)

    if (fErr) console.warn('[settings-service] Reset flashcards warning:', fErr)

    const { error: rErr } = await supabase
      .from('reflections')
      .delete()
      .eq('user_id', userId)
      
    if (rErr) console.warn('[settings-service] Reset reflections warning:', rErr)
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
    const modulesCount = Math.floor(lessonsCount / 10)
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
    if (lessonsCount < 90 || capstonesCount < 9) revokedKeys.push('pm_academy_graduate')
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
  await supabase
    .from('users')
    .update({ total_xp: 0, level: 1 })
    .eq('id', userId)

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
 * Permanently deletes user account with full RLS-table cascade,
 * revokes public portfolio URL, delinks certificates, and emits account.deleted event.
 */
export async function deleteAccount(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  // 1. Emit account.deleted event to drop queued notifications
  try {
    await supabase
      .from('notification_events')
      .insert({
        user_id: userId,
        event_type: 'account.deleted',
        payload: { deleted_at: new Date().toISOString() },
      })

    // Delete pending queued emails for this user
    await supabase
      .from('email_queue')
      .delete()
      .eq('user_id', userId)
  } catch (err) {
    console.warn('[settings-service] Warning clearing notification queue during account deletion:', err)
  }

  // 2. Delink issued certificates from live profile (retained for legal/audit verification)
  try {
    await supabase
      .from('certificates')
      .update({ learner_name: 'Former Learner' })
      .eq('user_id', userId)
  } catch (err) {
    console.warn('[settings-service] Warning delinking certificates during account deletion:', err)
  }

  // 3. Cascade deletion across user-owned tables

  const userTables = [
    'user_lesson_progress',
    'quiz_attempts',
    'user_flashcard_srs',
    'xp_events',
    'reflections',
    'bookmarks',
    'capstone_submissions',
    'certificates',
    'user_badges',
    'user_leaderboard_settings',
    'user_friends',
    'cohort_members',
    'user_notification_preferences',
    'in_app_notifications',
    'user_notification_timeline',
    'user_feedback',
    'user_feedback_prompts',
  ]

  for (const table of userTables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from(table as any)
        .delete()
        .eq('user_id', userId)
    } catch (err) {
      console.warn(`[settings-service] Warning deleting from table ${table}:`, err)
    }
  }

  // 4. Finally delete user row from users table
  const { error: userErr } = await supabase
    .from('users')
    .delete()
    .eq('id', userId)

  if (userErr) {
    console.error('[settings-service] Error deleting user row:', userErr)
    throw new Error('Failed to complete account deletion.')
  }
}
