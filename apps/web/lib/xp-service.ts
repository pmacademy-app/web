import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { calculateLevel, type LevelInfo, type XpSourceType } from '@/lib/xp'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface XpEventRow {
  id: string
  user_id: string
  source_type: string
  source_id: string | null
  xp_amount: number
  created_at: string
}

export interface UserXpSummary {
  totalXp: number
  levelInfo: LevelInfo
  recentEvents: XpEventRow[]
}

/**
  * Canonical XP Service (PRD.md §4.6, Architecture.md §6).
  * Responsible for recording XP events to the append-only ledger.
  */
export async function awardXp(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceType: XpSourceType,
  xpAmount: number,
  sourceId: string
): Promise<void> {
  if (xpAmount <= 0) {
    return
  }

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

/**
  * Checks if an XP event already exists in the ledger for idempotency.
  */
export async function hasXpEvent(
  supabase: SupabaseClient<Database>,
  userId: string,
  sourceType: XpSourceType,
  sourceId: string
): Promise<boolean> {
  const { data, error } = (await (supabase
    .from('xp_events') as unknown as DBChain)
    .select('id')
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .limit(1)
    .maybeSingle()) as unknown as { data: { id: string } | null; error: unknown }

  if (error) {
    console.error(`[xp-service] Error checking XP event existence:`, error)
    return false
  }

  return !!data
}

/**
  * Calculates total XP directly from the append-only ledger.
  */
export async function getTotalXp(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const { data, error } = (await (supabase
    .from('xp_events') as unknown as DBChain)
    .select('xp_amount')
    .eq('user_id', userId)) as unknown as { data: { xp_amount: number }[] | null; error: unknown }

  if (error || !data) {
    console.error(`[xp-service] Error fetching total XP for user ${userId}:`, error)
    return 0
  }

  return data.reduce((sum, row) => sum + (row.xp_amount || 0), 0)
}

/**
  * Retrieves complete user XP summary including total XP, calculated level, and recent ledger history.
  */
export async function getUserXpSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  recentLimit: number = 10
): Promise<UserXpSummary> {
  const [totalXp, { data: recentEvents }] = await Promise.all([
    getTotalXp(supabase, userId),
    (supabase
      .from('xp_events') as unknown as DBChain)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(recentLimit) as unknown as Promise<{ data: XpEventRow[] | null }>,
  ])

  const levelInfo = calculateLevel(totalXp)

  return {
    totalXp,
    levelInfo,
    recentEvents: recentEvents || [],
  }
}

