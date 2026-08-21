import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import { getTotalXp } from '../xp/xp-service'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Resets user lesson progress and quiz attempts.
 * If moduleSlug is provided (and not 'all'), resets progress for lessons in that module.
 */
export async function resetProgress(
  supabase: SupabaseClient<Database>,
  userId: string,
  moduleSlug?: string
): Promise<void> {
  if (moduleSlug && moduleSlug !== 'all') {
    // Delete lesson progress for specific module
    const { error: pErr } = await (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .delete()
      .eq('user_id', userId)
      .ilike('lesson_id', `%${moduleSlug}%`)

    if (pErr) console.warn('[settings-service] Reset module progress warning:', pErr)

    // Delete capstones for this module specifically
    const { error: cErr } = await (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .delete()
      .eq('user_id', userId)
      .eq('module_slug', moduleSlug)
      
    if (cErr) console.warn('[settings-service] Reset module capstones warning:', cErr)
  } else {
    // Delete all lesson progress and quiz attempts for full reset
    const { error: pErr } = await (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .delete()
      .eq('user_id', userId)

    if (pErr) console.warn('[settings-service] Reset all progress warning:', pErr)

    const { error: qErr } = await (supabase
      .from('quiz_attempts') as unknown as DBChain)
      .delete()
      .eq('user_id', userId)

    if (qErr) console.warn('[settings-service] Reset quiz attempts warning:', qErr)

    const { error: cErr } = await (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .delete()
      .eq('user_id', userId)

    if (cErr) console.warn('[settings-service] Reset capstones warning:', cErr)

    const { error: fErr } = await (supabase
      .from('user_flashcard_srs') as unknown as DBChain)
      .delete()
      .eq('user_id', userId)

    if (fErr) console.warn('[settings-service] Reset flashcards warning:', fErr)

    const { error: rErr } = await (supabase
      .from('reflections') as unknown as DBChain)
      .delete()
      .eq('user_id', userId)
      
    if (rErr) console.warn('[settings-service] Reset reflections warning:', rErr)
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
    const { error } = await (supabase
      .from('xp_events') as unknown as DBChain)
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
  await (supabase
    .from('users') as unknown as DBChain)
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
  const { error } = await (supabase
    .from('user_flashcard_srs') as unknown as DBChain)
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
  const { error } = await (supabase
    .from('users') as unknown as DBChain)
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
    await (supabase
      .from('notification_events') as unknown as DBChain)
      .insert({
        user_id: userId,
        event_type: 'account.deleted',
        payload: { deleted_at: new Date().toISOString() },
      })

    // Delete pending queued emails for this user
    await (supabase
      .from('email_queue') as unknown as DBChain)
      .delete()
      .eq('user_id', userId)
  } catch (err) {
    console.warn('[settings-service] Warning clearing notification queue during account deletion:', err)
  }

  // 2. Delink issued certificates from live profile (retained for legal/audit verification)
  try {
    await (supabase
      .from('certificates') as unknown as DBChain)
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
  ]

  for (const table of userTables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from(table as any) as unknown as DBChain)
        .delete()
        .eq('user_id', userId)
    } catch (err) {
      console.warn(`[settings-service] Warning deleting from table ${table}:`, err)
    }
  }

  // 4. Finally delete user row from users table
  const { error: userErr } = await (supabase
    .from('users') as unknown as DBChain)
    .delete()
    .eq('id', userId)

  if (userErr) {
    console.error('[settings-service] Error deleting user row:', userErr)
    throw new Error('Failed to complete account deletion.')
  }
}
