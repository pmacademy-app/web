/**
 * Backlog C1: one paging helper.
 *
 * `lib/admin/fetch-all.ts` was a re-export of `lib/db/pagination.ts`. It is gone, the admin
 * services import the helper directly, and every call orders on a unique key (or a set of
 * columns that is unique) before `.range()`, as `fetchAllRows` requires.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const web = process.cwd()

const ADMIN_CALLERS = [
  'lib/admin/achievements-service.ts',
  'lib/admin/analytics-rpc.ts',
  'lib/admin/analytics-service.ts',
  'lib/admin/communications-service.ts',
  'lib/admin/dashboard-service.ts',
  'lib/admin/experiment-readout-service.ts',
  'lib/admin/funnel-service.ts',
  'lib/admin/system-service.ts',
]

/** The text of each `fetchAllRows<...>(...)` call, up to its `.range(` window. */
function pagedQueries(source: string): string[] {
  return source
    .split('fetchAllRows<')
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf('.range(')))
}

describe('C1: admin services use lib/db/pagination directly', () => {
  it('the re-export file is deleted', () => {
    expect(existsSync(path.join(web, 'lib/admin/fetch-all.ts'))).toBe(false)
  })

  it.each(ADMIN_CALLERS)('%s imports fetchAllRows from @/lib/db/pagination', (rel) => {
    const source = readFileSync(path.join(web, rel), 'utf8')
    expect(source).toContain("import { fetchAllRows } from '@/lib/db/pagination'")
    expect(source).not.toContain('fetch-all')
  })

  it.each(ADMIN_CALLERS)('%s orders every paged query before .range()', (rel) => {
    const queries = pagedQueries(readFileSync(path.join(web, rel), 'utf8'))
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) {
      expect(query).toContain('.order(')
    }
  })

  it('tie-breaks non-unique orderings on a unique key', () => {
    const read = (rel: string) => readFileSync(path.join(web, rel), 'utf8')
    expect(read('lib/admin/achievements-service.ts')).toContain(
      ".order('issued_at', { ascending: false }).order('id')"
    )
    expect(read('lib/admin/system-service.ts')).toMatch(
      /\.order\('timestamp', \{ ascending: false \}\)\s*\.order\('id'\)/
    )
  })
})
