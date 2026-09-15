import type { PostgrestError } from '@supabase/supabase-js'

/**
 * PostgREST's default row cap.
 *
 * Named rather than inlined because the whole class of bug this module exists to
 * prevent (F-COR-2, F-COR-4) comes from code that inherited this bound without
 * knowing it: an unbounded `.select()` is truncated here and reports no error, so a
 * truncated answer is indistinguishable from a complete one.
 */
export const POSTGREST_PAGE_SIZE = 1000

/**
 * The shape `fetchAllRows` needs from one page.
 *
 * Structural rather than `PostgrestResponse<T>` so that a builder, a plain promise
 * and a test fake all satisfy it. A real `PostgrestError` satisfies the `error`
 * member because it carries `message: string`.
 */
export interface PageResult<T> {
  data: T[] | null
  error: Pick<PostgrestError, 'message'> | null
}

/**
 * Fetches every row matching a builder, walking PostgREST's page limit.
 *
 * The caller supplies a window rather than a finished query, so each page is a fresh
 * `.range(from, to)` on the same filters. The loop stops on a short page, which is
 * the only reliable signal that the last page was reached.
 *
 * The million-row ceiling is a guard against a builder that ignores its window and
 * returns a full page forever; it is not a business limit.
 */
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const pageSize = POSTGREST_PAGE_SIZE
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
