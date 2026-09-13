/**
 * B8-D — grouping logic for the XP duplicate diagnostic (F-COR-3).
 *
 * The runner in `scripts/diagnostics/xp-duplicates.ts` only pages the table and prints;
 * all of the judgement lives in `analyzeDuplicates()`, which is what is pinned here.
 */
import { describe, it, expect } from 'vitest'
import {
  analyzeDuplicates,
  formatDuplicateReport,
  type XpEventRowForAnalysis,
} from '../xp/duplicate-analysis'

function row(
  overrides: Partial<XpEventRowForAnalysis> & Pick<XpEventRowForAnalysis, 'id'>
): XpEventRowForAnalysis {
  return {
    user_id: 'user-1',
    source_type: 'lesson',
    source_id: 'lesson-1',
    xp_amount: 10,
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('analyzeDuplicates', () => {
  it('reports nothing for a ledger with no collisions', () => {
    const report = analyzeDuplicates([
      row({ id: 'a', source_id: 'lesson-1' }),
      row({ id: 'b', source_id: 'lesson-2' }),
      row({ id: 'c', user_id: 'user-2', source_id: 'lesson-1' }),
    ])

    expect(report.duplicateGroups).toBe(0)
    expect(report.totalExcessRows).toBe(0)
    expect(report.totalExcessXp).toBe(0)
    expect(report.affectedUsers).toBe(0)
    expect(report.scannedRows).toBe(3)
  })

  it('counts excess rows as group size minus one', () => {
    const report = analyzeDuplicates([
      row({ id: 'a', created_at: '2026-09-01T00:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-09-02T00:00:00.000Z' }),
      row({ id: 'c', created_at: '2026-09-03T00:00:00.000Z' }),
    ])

    expect(report.duplicateGroups).toBe(1)
    expect(report.groups[0].rowCount).toBe(3)
    expect(report.groups[0].excessRows).toBe(2)
    expect(report.totalExcessRows).toBe(2)
  })

  it('attributes XP only to the rows a dedupe would delete', () => {
    const report = analyzeDuplicates([
      row({ id: 'a', xp_amount: 10, created_at: '2026-09-01T00:00:00.000Z' }),
      row({ id: 'b', xp_amount: 25, created_at: '2026-09-02T00:00:00.000Z' }),
      row({ id: 'c', xp_amount: 5, created_at: '2026-09-03T00:00:00.000Z' }),
    ])

    // The earliest row is kept, so its 10 XP is NOT at stake; 25 + 5 is.
    expect(report.groups[0].excessXp).toBe(30)
    expect(report.totalExcessXp).toBe(30)
  })

  it('identifies the earliest row as the one a dedupe keeps', () => {
    const report = analyzeDuplicates([
      row({ id: 'late', created_at: '2026-09-10T00:00:00.000Z' }),
      row({ id: 'early', created_at: '2026-09-01T00:00:00.000Z' }),
      row({ id: 'mid', created_at: '2026-09-05T00:00:00.000Z' }),
    ])

    expect(report.groups[0].earliestAt).toBe('2026-09-01T00:00:00.000Z')
    expect(report.groups[0].latestAt).toBe('2026-09-10T00:00:00.000Z')
  })

  it('breaks identical timestamps deterministically by id', () => {
    const at = '2026-09-01T00:00:00.000Z'
    const first = analyzeDuplicates([
      row({ id: 'zzz', xp_amount: 7, created_at: at }),
      row({ id: 'aaa', xp_amount: 3, created_at: at }),
    ])
    const second = analyzeDuplicates([
      row({ id: 'aaa', xp_amount: 3, created_at: at }),
      row({ id: 'zzz', xp_amount: 7, created_at: at }),
    ])

    // 'aaa' sorts first and is kept in both orderings, so 'zzz' (7 XP) is the excess.
    expect(first.groups[0].excessXp).toBe(7)
    expect(second.groups[0].excessXp).toBe(7)
  })

  it('does not group null source_id rows together', () => {
    const report = analyzeDuplicates([
      row({ id: 'a', source_id: null }),
      row({ id: 'b', source_id: null }),
      row({ id: 'c', source_id: null }),
    ])

    // A Postgres UNIQUE constraint does not collapse NULLs, so neither does this.
    expect(report.duplicateGroups).toBe(0)
    expect(report.nullSourceIdRows).toBe(3)
  })

  it('separates groups differing only by source_type', () => {
    const report = analyzeDuplicates([
      row({ id: 'a', source_type: 'lesson', source_id: 'x' }),
      row({ id: 'b', source_type: 'quiz', source_id: 'x' }),
    ])
    expect(report.duplicateGroups).toBe(0)
  })

  it('separates groups differing only by user', () => {
    const report = analyzeDuplicates([
      row({ id: 'a', user_id: 'user-1' }),
      row({ id: 'b', user_id: 'user-2' }),
    ])
    expect(report.duplicateGroups).toBe(0)
  })

  it('counts distinct affected users, not groups', () => {
    const report = analyzeDuplicates([
      row({ id: 'a', user_id: 'user-1', source_id: 'l1' }),
      row({ id: 'b', user_id: 'user-1', source_id: 'l1' }),
      row({ id: 'c', user_id: 'user-1', source_id: 'l2' }),
      row({ id: 'd', user_id: 'user-1', source_id: 'l2' }),
      row({ id: 'e', user_id: 'user-2', source_id: 'l1' }),
      row({ id: 'f', user_id: 'user-2', source_id: 'l1' }),
    ])

    expect(report.duplicateGroups).toBe(3)
    expect(report.affectedUsers).toBe(2)
    expect(report.totalExcessRows).toBe(3)
  })

  it('orders groups worst-first', () => {
    const report = analyzeDuplicates([
      row({ id: 'a', source_id: 'small' }),
      row({ id: 'b', source_id: 'small' }),
      row({ id: 'c', source_id: 'big' }),
      row({ id: 'd', source_id: 'big' }),
      row({ id: 'e', source_id: 'big' }),
      row({ id: 'f', source_id: 'big' }),
    ])

    expect(report.groups[0].sourceId).toBe('big')
    expect(report.groups[0].excessRows).toBe(3)
    expect(report.groups[1].sourceId).toBe('small')
  })

  it('handles an empty ledger', () => {
    const report = analyzeDuplicates([])
    expect(report.scannedRows).toBe(0)
    expect(report.duplicateGroups).toBe(0)
  })
})

describe('formatDuplicateReport', () => {
  it('states plainly that nothing was deleted', () => {
    const text = formatDuplicateReport(analyzeDuplicates([]))
    expect(text).toContain('READ ONLY')
    expect(text).toContain('nothing was deleted')
  })

  it('says a constraint can be added directly when there are no duplicates', () => {
    const text = formatDuplicateReport(analyzeDuplicates([row({ id: 'a' })]))
    expect(text).toContain('No duplicates found')
  })

  it('prints user ids and never an email address', () => {
    const text = formatDuplicateReport(
      analyzeDuplicates([
        row({ id: 'a', user_id: 'user-abc' }),
        row({ id: 'b', user_id: 'user-abc' }),
      ])
    )

    expect(text).toContain('user=user-abc')
    expect(text).not.toMatch(/@/)
  })

  it('truncates a long group list rather than printing everything', () => {
    const rows: XpEventRowForAnalysis[] = []
    for (let i = 0; i < 30; i++) {
      rows.push(row({ id: `a${i}`, source_id: `l${i}` }))
      rows.push(row({ id: `b${i}`, source_id: `l${i}` }))
    }

    const text = formatDuplicateReport(analyzeDuplicates(rows), 5)
    expect(text).toContain('and 25 more groups')
  })
})
