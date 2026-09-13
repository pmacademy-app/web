import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import { calculateLevel, type LevelInfo, type XpSourceType } from './xp'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Page size for the ledger fallback in `getTotalXp()`. Matches the PostgREST default
 * row cap, so the fallback is explicit about the bound rather than inheriting it
 * silently — which is the shape of the bug it stands in for.
 */
const XP_LEDGER_FALLBACK_LIMIT = 1000

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

/**
 * Returns a user's authoritative lifetime XP.
 *
 * Reads `users.total_xp` rather than summing `xp_events` in JS. The column is
 * maintained by `update_user_xp_and_level()` (migration `20260805000001`), which runs
 * `sum(xp_amount)` in SQL on every `xp_events` insert, and is re-derived by the
 * anti-tampering trigger on every `users` update — so it is both authoritative and
 * self-healing.
 *
 * Summing client-side was wrong past 1000 events: PostgREST caps an unbounded select at
 * its row limit and reports no error, so power users silently reported a truncated
 * total — which then drove level-up notifications from a number that was too low.
 * F-COR-2.
 *
 * Falls back to a bounded page of the ledger only when the `users` row cannot be read,
 * so a caller still gets a usable figure rather than a hard zero. The fallback carries
 * the same truncation caveat by construction, so it is explicitly marked as approximate
 * in the log rather than presented as authoritative.
 */
export async function getTotalXp(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const { data, error } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('total_xp')
    .eq('id', userId)
    .maybeSingle()) as unknown as { data: { total_xp: number | null } | null; error: unknown }

  if (!error && data) {
    return data.total_xp ?? 0
  }

  if (error) {
    console.error(`[xp-service] Error reading authoritative total XP for user ${userId}:`, error)
  }

  return getTotalXpFromLedgerFallback(supabase, userId)
}

/**
 * Last-resort total when `users.total_xp` is unreadable (missing row, or a failed read).
 *
 * Bounded deliberately: an unbounded select is what caused F-COR-2, and silently
 * reintroducing it in the fallback would recreate the same wrong answer one layer down.
 */
async function getTotalXpFromLedgerFallback(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const { data, error } = (await (supabase
    .from('xp_events') as unknown as DBChain)
    .select('xp_amount')
    .eq('user_id', userId)
    .limit(XP_LEDGER_FALLBACK_LIMIT)) as unknown as {
    data: { xp_amount: number }[] | null
    error: unknown
  }

  if (error || !data) {
    console.error(`[xp-service] Error fetching fallback total XP for user ${userId}:`, error)
    return 0
  }

  if (data.length === XP_LEDGER_FALLBACK_LIMIT) {
    console.warn(
      `[xp-service] Fallback total XP for user ${userId} hit the ledger page limit and is approximate.`
    )
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
