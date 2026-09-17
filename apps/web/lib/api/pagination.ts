import { z } from 'zod'

/**
 * The list response contract (B13-B).
 *
 * ## Why this exists
 *
 * Before this, every list endpoint invented its own contract. `notifications` took
 * `page` and `limit` and capped at 50; `admin/emails/broadcasts` took `page` and
 * `pageSize` and capped at 100; `admin/system/alerts` took `limit` alone and capped at
 * 100; `admin/search` hard-coded 5 with no parameter at all. They disagreed on the
 * envelope too — `items`, `data`, `messages`, `alerts`, `requests` — so a client could
 * not write one function that reads a page from this API. Several list routes had no
 * bound whatsoever.
 *
 * That last part is the security half. The roadmap is explicit that "pagination is also
 * an abuse control — cap page size server-side", and an unbounded list endpoint is a
 * cheap amplification primitive: one request, arbitrarily large response, paid for by
 * the server. A cap the caller cannot raise is the control; a *default* the caller can
 * override is not.
 *
 * ## limit/offset rather than cursors
 *
 * Cursors are more robust when rows shift between pages and cheaper at depth, and for a
 * greenfield API they would be the better answer. They are not the better answer here:
 * the admin console renders page numbers and totals, which a cursor cannot supply
 * without the count query a cursor exists to avoid. Offsets also match the arithmetic
 * the existing routes already do, so migrating them is mechanical rather than a
 * rewrite of every consumer. The envelope leaves room to add a cursor later without
 * breaking a client that reads `limit`/`offset`/`total`.
 *
 * ## The envelope
 *
 *     { items: T[], pagination: { limit, offset, total, hasMore } }
 *
 * `total` is nullable on purpose. It requires a `count` from PostgREST, which is a
 * second scan; an endpoint that cannot afford one reports `null` rather than lying with
 * `items.length`. `hasMore` is always answerable and is what a "load more" control
 * actually needs, so a client never has to compute it from a total that might be absent.
 */

/** The largest page any caller may request, whatever they ask for. */
export const MAX_PAGE_SIZE = 100

/** The page size used when a caller does not specify one. */
export const DEFAULT_PAGE_SIZE = 20

/**
 * How deep a caller may page.
 *
 * An offset is an instruction to the database to count and discard that many rows, so
 * an unbounded offset is a slow query anyone can request. Past this depth a filter is
 * the right tool, not a bigger number.
 */
export const MAX_OFFSET = 10_000

/**
 * Query schema for a paginated list endpoint.
 *
 * `coerce` because query parameters are strings. `catch` rather than a hard failure on
 * a malformed value: `?limit=abc` is a broken client, not an attack, and answering with
 * the default page is friendlier than a 400 — while `?limit=100000` is still clamped
 * rather than honoured. The clamp is the control; the parse is a convenience.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .catch(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).catch(0).default(0),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export interface PaginationMeta {
  /** The page size actually applied, after clamping. */
  limit: number
  /** The offset actually applied, after clamping. */
  offset: number
  /** Total matching rows, or `null` when the endpoint does not count. */
  total: number | null
  /** Whether another page exists. Always answerable, unlike `total`. */
  hasMore: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  pagination: PaginationMeta
}

/**
 * Clamps caller-supplied paging values to the server's bounds.
 *
 * Exported separately from the schema because a route that reads `searchParams` by hand
 * still needs the clamp, and because the clamp is the security-relevant part — it must
 * be reachable without going through zod. A caller can always ask for less than the
 * maximum; it can never ask for more.
 */
export function clampPagination(input: {
  limit?: number | string | null
  offset?: number | string | null
}): PaginationQuery {
  /**
   * `Number()` coerces `null` and `''` to `0`, which are finite — so feeding an absent
   * parameter straight to the clamp would produce `limit: 1` instead of the default,
   * and every caller that simply omitted `?limit=` would silently get one row per page.
   * `searchParams.get()` returns `null` for a missing key and `''` for `?limit=`, so
   * both of those are "absent", not "zero".
   */
  const asNumber = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  const rawLimit = asNumber(input.limit)
  const rawOffset = asNumber(input.offset)

  const limit =
    rawLimit === null ? DEFAULT_PAGE_SIZE : Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawLimit)))

  const offset = rawOffset === null ? 0 : Math.min(MAX_OFFSET, Math.max(0, Math.floor(rawOffset)))

  return { limit, offset }
}

/**
 * Converts an offset window into the inclusive `[from, to]` pair PostgREST expects.
 *
 * `.range()` is inclusive at both ends, so the last index is `offset + limit - 1`.
 * Getting that off by one silently returns one row too many on every page, which is the
 * kind of defect that survives review precisely because the page still looks right.
 */
export function toRange(pagination: PaginationQuery): { from: number; to: number } {
  return { from: pagination.offset, to: pagination.offset + pagination.limit - 1 }
}

/**
 * Builds the response envelope.
 *
 * `hasMore` is derived from `total` when the endpoint counted, and otherwise from
 * whether the page came back full — a short page is the only reliable signal that the
 * last page was reached, the same rule `fetchAllRows` uses for server-side paging.
 */
export function paginated<T>(
  items: T[],
  pagination: PaginationQuery,
  total?: number | null
): PaginatedResponse<T> {
  const resolvedTotal = typeof total === 'number' ? total : null

  const hasMore =
    resolvedTotal !== null
      ? pagination.offset + items.length < resolvedTotal
      : items.length === pagination.limit

  return {
    items,
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      total: resolvedTotal,
      hasMore,
    },
  }
}
