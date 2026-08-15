/**
 * Shared pagination helper for admin data services.
 *
 * Walks Supabase's 1,000-row page limit so services can fetch every row
 * matching a builder. Used by the Achievements & Moderation services (Phase 5)
 * to avoid duplicating the loop in each service class.
 */

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Fetches every row matching a builder, walking Supabase's 1,000-row page limit.
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  let start = 0
  while (start < 1_000_000) {
    const { data, error } = await buildPage(start, start + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    start += pageSize
  }
  return rows
}