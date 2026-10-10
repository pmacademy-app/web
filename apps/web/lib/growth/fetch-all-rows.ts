/**
 * Reads every row of a query in pages (Growth R5 review fix).
 *
 * PostgREST caps a response at `max_rows` (1000 here, supabase/config.toml) without an error, so a
 * batch query over many learners could be cut off silently and the learners late in the batch
 * would look like they had done less. `page(from, to)` must apply `.range(from, to)` to a query
 * with a stable order. Stops at the first short page; a failed page fails the whole read.
 */
export const ROW_PAGE_SIZE = 1000
const MAX_PAGES = 100

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number = ROW_PAGE_SIZE,
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = []
  for (let index = 0; index < MAX_PAGES; index++) {
    const from = index * pageSize
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: rows, error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return { data: rows, error: null }
}
