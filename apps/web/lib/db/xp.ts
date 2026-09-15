/**
 * XP queries (B8-F).
 *
 * Every query here is written against the generated types, which is the entire
 * point: `xp_events.xp_amount` is spelled once, checked by the compiler, and cannot
 * drift back to `amount` without the build failing. See `lib/db/index.ts` for why
 * that matters.
 *
 * These functions own the SQL and nothing else. Level arithmetic, notification
 * dispatch and the duplicate-award policy stay in `lib/xp/xp-service.ts`, which is
 * where they were before and where the tests for them live.
 */

import type { Db, Row, Selected } from '@/lib/db'

/** The `xp_events` columns every caller of `recentXpEvents` reads. */
export type XpEvent = Row<'xp_events'>

/**
 * Inserts one XP event.
 *
 * Returns the raw error rather than throwing, because the caller has to distinguish
 * a unique violation — a duplicate award losing a race, which is a successful no-op
 * — from a genuine failure. Throwing here would flatten that distinction.
 */
export async function insertXpEvent(
  db: Db,
  event: {
    userId: string
    sourceType: string
    xpAmount: number
    sourceId: string
  }
): Promise<{ error: unknown }> {
  const { error } = await db.from('xp_events').insert({
    user_id: event.userId,
    source_type: event.sourceType,
    xp_amount: event.xpAmount,
    source_id: event.sourceId,
  })

  return { error }
}

/**
 * Whether an award for this exact `(user, source_type, source_id)` already exists.
 *
 * `{ found, error }` rather than a bare boolean: the caller currently treats a failed
 * lookup as "not found" and proceeds, and that decision belongs to the caller, not
 * here. Collapsing it to `false` would hide the read failure entirely.
 */
export async function findXpEvent(
  db: Db,
  userId: string,
  sourceType: string,
  sourceId: string
): Promise<{ found: boolean; error: unknown }> {
  const { data, error } = await db
    .from('xp_events')
    .select('id')
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .limit(1)
    .maybeSingle()

  return { found: Boolean(data), error }
}

/**
 * Reads the authoritative lifetime XP column.
 *
 * `users.total_xp` is maintained in SQL by `update_user_xp_and_level()` and
 * re-derived by the anti-tampering trigger, so it is both authoritative and
 * self-healing — unlike a client-side sum of the ledger, which PostgREST truncates
 * past its row cap without saying so (F-COR-2).
 */
export async function selectAuthoritativeTotalXp(
  db: Db,
  userId: string
): Promise<{ row: Selected<'users', 'total_xp'> | null; error: unknown }> {
  const { data, error } = await db
    .from('users')
    .select('total_xp')
    .eq('id', userId)
    .maybeSingle()

  return { row: data, error }
}

/**
 * A bounded page of a user's XP ledger, for the fallback total.
 *
 * Bounded deliberately. An unbounded select is what produced F-COR-2, and quietly
 * reintroducing one in the fallback would recreate the same wrong answer one layer
 * down. The caller compares the row count against the limit to decide whether the
 * figure it computed is approximate.
 */
export async function selectXpLedgerPage(
  db: Db,
  userId: string,
  limit: number
): Promise<{ rows: Selected<'xp_events', 'xp_amount'>[] | null; error: unknown }> {
  const { data, error } = await db
    .from('xp_events')
    .select('xp_amount')
    .eq('user_id', userId)
    .limit(limit)

  return { rows: data, error }
}

/** The most recent XP events for a user, newest first. */
export async function selectRecentXpEvents(
  db: Db,
  userId: string,
  limit: number
): Promise<{ rows: XpEvent[] | null; error: unknown }> {
  const { data, error } = await db
    .from('xp_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { rows: data, error }
}

/** The name and email a level-up notification is addressed to. */
export async function selectNotificationIdentity(
  db: Db,
  userId: string
): Promise<Selected<'users', 'email' | 'name'> | null> {
  const { data } = await db.from('users').select('email, name').eq('id', userId).maybeSingle()

  return data
}
