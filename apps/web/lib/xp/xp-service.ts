import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import { calculateLevel, type LevelInfo, type XpSourceType } from './xp'

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

  const oldTotalXp = await getTotalXp(supabase, userId)
  const oldLevelInfo = calculateLevel(oldTotalXp)

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

  const newTotalXp = oldTotalXp + xpAmount
  const newLevelInfo = calculateLevel(newTotalXp)

  if (newLevelInfo.level > oldLevelInfo.level) {
    try {
      const { data: userRec } = await (supabase
        .from('users') as unknown as DBChain)
        .select('email, name')
        .eq('id', userId)
        .maybeSingle() as unknown as { data: { email: string; name: string | null } | null }

      const { globalNotificationDispatcher } = await import('../notifications/dispatcher')
      const { initializeNotificationConnectors } = await import('../notifications/events/connectors')
      initializeNotificationConnectors()

      await globalNotificationDispatcher.dispatch({
        id: `level-up-${userId}-${newLevelInfo.level}`,
        event: 'xp.level_up',
        userId,
        userEmail: userRec?.email || '',
        userName: userRec?.name || 'Learner',
        userTimezone: 'UTC',
        priority: 'high',
        category: 'achievements',
        occurredAt: new Date().toISOString(),
        payload: {
          userId,
          newLevel: newLevelInfo.level,
          levelTitle: newLevelInfo.title,
          totalXp: newTotalXp,
        },
      })
    } catch (lvlErr) {
      console.warn('[xp-service] Level up notification dispatch warning:', lvlErr)
    }
  }
}

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
