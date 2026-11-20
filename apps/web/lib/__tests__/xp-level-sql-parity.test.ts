import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { LEVEL_THRESHOLDS } from '@/lib/xp/xp'

// The stored users.level is written by SQL; the level-up notification and titles use
// LEVEL_THRESHOLDS. If the two drift, learners see two different levels.
const MIGRATION = path.resolve(
  __dirname,
  '../../../../supabase/migrations/pending-approval/20261120000001_align_xp_levels.sql',
)

function sqlThresholds(): Array<{ level: number; minXp: number }> {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  const rows = [...sql.matchAll(/WHEN coalesce\(p_total, 0\) >= (\d+)\s+THEN (\d+)/g)].map((m) => ({
    level: Number(m[2]),
    minXp: Number(m[1]),
  }))
  return [{ level: 1, minXp: 0 }, ...rows].sort((a, b) => a.level - b.level)
}

describe('XP level thresholds: SQL and app agree', () => {
  it('the migration encodes exactly the app thresholds', () => {
    expect(sqlThresholds()).toEqual(LEVEL_THRESHOLDS.map(({ level, minXp }) => ({ level, minXp })))
  })

  it('no level-writing function in the migration still uses the 500 XP formula', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8')
    expect(sql).not.toMatch(/\/ 500/)
  })
})
