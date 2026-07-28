import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { calculateSM2, SRSRating } from '@/lib/srs'
import { awardXp } from '@/lib/xp-service'
import { XP_VALUES } from '@/lib/xp'
import { updateUserStreak } from '@/lib/streaks-db'

type FlashcardSRSRow = Database['public']['Tables']['user_flashcard_srs']['Row']

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Service responsible for spaced repetition flashcard reviews and SM-2 persistence.
 * (PRD.md §4.4, Architecture.md §6).
 */
export async function recordFlashcardReview(
  supabase: SupabaseClient<Database>,
  userId: string,
  flashcardId: string,
  rating: number
): Promise<{ nextReviewAt: Date; easeFactor: number }> {
  // 1. Fetch current SM-2 state from database
  const { data: srsData, error: srsFetchError } = (await (supabase
    .from('user_flashcard_srs') as unknown as DBChain)
    .select('*')
    .eq('user_id', userId)
    .eq('flashcard_id', flashcardId)
    .maybeSingle()) as unknown as { data: FlashcardSRSRow | null; error: unknown }

  if (srsFetchError) throw srsFetchError

  const prevState = srsData
    ? {
        repetitions: srsData.repetitions,
        intervalDays: srsData.interval_days,
        easeFactor: Number(srsData.ease_factor),
      }
    : { repetitions: 0, intervalDays: 0, easeFactor: 2.5 }

  // 2. Compute next spacing intervals using SM-2 (SM-2 Engine)
  const nextState = calculateSM2(rating as SRSRating, prevState)

  // 3. Persist SRS review state
  const { error: upsertError } = await (supabase
    .from('user_flashcard_srs') as unknown as DBChain)
    .upsert({
      user_id: userId,
      flashcard_id: flashcardId,
      ease_factor: nextState.easeFactor,
      interval_days: nextState.intervalDays,
      repetitions: nextState.repetitions,
      next_review_at: nextState.nextReviewAt.toISOString(),
    }, { onConflict: 'user_id,flashcard_id' })

  if (upsertError) throw upsertError

  // 4. Award daily flashcard review XP via canonical XP service
  await awardXp(
    supabase,
    userId,
    'flashcard',
    XP_VALUES.FLASHCARD_REVIEW,
    flashcardId
  )

  // 5. Update user streak
  await updateUserStreak(supabase, userId)

  return {
    nextReviewAt: nextState.nextReviewAt,
    easeFactor: nextState.easeFactor,
  }
}
