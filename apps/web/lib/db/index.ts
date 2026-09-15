/**
 * The typed data layer (B8-F).
 *
 * ## Why this exists
 *
 * `types/database.ts` is generated from the schema and is already wired into every
 * client — `createServiceRoleClient()` returns `SupabaseClient<Database>`. The types
 * were never the problem. The problem was that ~27 modules declared their own
 * `interface DBChain`, cast the client through it, and cast the result back to a
 * hand-written row shape:
 *
 * ```ts
 * interface DBChain { [m: string]: (...a: unknown[]) => DBChain & Promise<{ data: unknown }> }
 * const { data } = await (supabase.from('xp_events') as unknown as DBChain)
 *   .select('user_id, amount')          // <- wrong column, nothing complains
 * ```
 *
 * That pair of casts is how `F-COR-1` shipped: `xp_events` has no `amount` column,
 * PostgREST rejected the query, only `data` was destructured so the error went
 * nowhere, and every user's weekly XP silently became zero. No type, test or review
 * could have caught it, because the cast erased the one fact that mattered.
 *
 * Written against the generated types instead, the same mistake is a compile error
 * naming the column:
 *
 *     Property 'amount' does not exist on type
 *     SelectQueryError<"column 'amount' does not exist on 'xp_events'.">
 *
 * So this layer is deliberately thin. It is not an ORM and not a repository
 * abstraction over Supabase — it is the place where queries are written *with* the
 * generated types rather than around them, plus the few primitives (bounded paging,
 * error unwrapping) that every aggregate needs and that were previously copied.
 *
 * ## Boundaries this layer does not move
 *
 * Nothing here creates a client. Callers pass the client they already resolved, so
 * the service-role/RLS decision stays exactly where it was — at the call site, under
 * the same authorization that governed it before. A function in `lib/db/` has no
 * opinion about who is allowed to call it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase'

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from '@/lib/supabase'
export { fetchAllRows, POSTGREST_PAGE_SIZE, type PageResult } from '@/lib/db/pagination'

/**
 * The canonical typed client.
 *
 * One alias so a data-layer signature cannot accidentally be written as
 * `SupabaseClient` (untyped, every table `any`) instead of
 * `SupabaseClient<Database>`. The two are easy to confuse and the untyped one
 * silently disables every guarantee this module exists to provide.
 */
export type Db = SupabaseClient<Database>

/** A single table's Row/Insert/Update, for code that names a table once. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

/**
 * Narrows a row type to the columns a query actually selected.
 *
 * `Pick<Row<'users'>, 'id' | 'total_xp'>` states, in the signature, what the caller
 * is allowed to read. A full `Row<'users'>` on a partial select would be a lie the
 * compiler cannot detect, and would let a later edit read a column the query never
 * asked for — which fails at runtime with `undefined`, not at build time.
 */
export type Selected<
  T extends keyof Database['public']['Tables'],
  K extends keyof Row<T>,
> = Pick<Row<T>, K>

/**
 * Postgres `unique_violation`. PostgREST forwards the SQLSTATE verbatim in
 * `error.code`, so this is the stable way to recognise a duplicate.
 */
export const PG_UNIQUE_VIOLATION = '23505'

/**
 * Whether a Supabase error is a unique-constraint violation.
 *
 * Matches the SQLSTATE rather than the message, which is localised and carries the
 * index name. Tolerant of an unexpected error shape on purpose: throwing from inside
 * error handling would turn a benign duplicate into a failed request.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  )
}

/**
 * The error half of a PostgREST response, as much of it as this layer relies on.
 *
 * Structural so a test fake satisfies it without constructing a real
 * `PostgrestError`.
 */
export interface DbError {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

/**
 * Turns a PostgREST response into rows, throwing on error.
 *
 * Exists because the failure that this whole layer is a reaction to was a
 * *discarded* error: `const { data } = await query` compiles, drops `error` on the
 * floor, and yields `null` — which downstream code reads as "no rows" rather than
 * "the query failed". Destructuring only `data` is still legal TypeScript; routing
 * reads through here makes the error impossible to drop silently.
 *
 * Use it where a failed read must not be mistaken for an empty result. Where a
 * degraded answer is genuinely preferable to an exception — the weekly leaderboard
 * returns a partial board rather than an error page — the caller keeps its own
 * try/catch and reports the incident; see `lib/db/leaderboard.ts`.
 */
export function unwrapRows<T>(
  response: { data: T[] | null; error: DbError | null },
  context: string
): T[] {
  if (response.error) {
    throw new Error(`${context}: ${response.error.message}`)
  }
  return response.data ?? []
}

/**
 * Turns a single-row PostgREST response into a row or `null`, throwing on error.
 *
 * `null` means "no such row" and only that — a failed query throws, so the two
 * cannot be confused. This is the `.maybeSingle()` counterpart to `unwrapRows`.
 */
export function unwrapMaybe<T>(
  response: { data: T | null; error: DbError | null },
  context: string
): T | null {
  if (response.error) {
    throw new Error(`${context}: ${response.error.message}`)
  }
  return response.data ?? null
}
