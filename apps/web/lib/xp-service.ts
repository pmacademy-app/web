import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Canonical XP Service (PRD.md §4.6, Architecture.md §6).
 * Responsible for recording XP events to the append-only ledger.
 */
export async function awardXp(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceType: 'theory_read' | 'quiz_correct' | 'quiz_bonus' | 'flashcard' | 'reflection' | 'capstone' | 'streak',
  xpAmount: number,
  sourceId: string
): Promise<void> {
  const { error } = await (supabase
    .from('xp_events') as unknown as DBChain)
    .insert({
      user_id: userId,
      source_type: sourceType,
      xp_amount: xpAmount,
      source_id: sourceId,
    })

  if (error) {
    console.error(`[xp-service] Error inserting XP event for user ${userId}:`, error)
    throw new Error('Failed to record XP event')
  }
}
