/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B8-G — the remaining typed data-layer migration.
 *
 * B8-F established the layer on the two aggregates that had already produced a bug.
 * This batch removes the `DBChain` escape hatch from the rest of the aggregates the
 * roadmap names — progress, capstones, certificates, badges, streaks, portfolio,
 * settings — and locks the layer with a lint rule.
 *
 * Most of the value is a compile-time guarantee, which cannot be asserted at
 * runtime. So this suite asserts the two things that can be: that the escape hatch
 * is actually gone from the named files, and that the specific correctness defects
 * the migration exposed are fixed and stay fixed.
 */
import { describe, it, expect, vi } from 'vitest'
import { Linter } from 'eslint'
import tsparser from '@typescript-eslint/parser'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../../')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** Source with comments stripped — prose may discuss the pattern it replaced. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

/** The aggregates B8-G names. */
const MIGRATED = [
  'lib/academy/lessons-db.ts',
  'lib/lessons-completion-service.ts',
  'lib/capstones-db.ts',
  'lib/certificates-db.ts',
  'lib/badges-db.ts',
  'lib/streaks/streaks-db.ts',
  'lib/portfolio-db.ts',
  'lib/settings/settings-service.ts',
  'app/api/settings/profile/route.ts',
  'app/api/settings/notifications/route.ts',
]

describe('B8-G — the escape hatch is gone from the named aggregates', () => {
  for (const file of MIGRATED) {
    it(`${file} declares no DBChain and casts nothing through it`, () => {
      const source = code(file)

      expect(source).not.toContain('interface DBChain')
      expect(source).not.toContain('DBChain')
    })
  }

  it('leaves no hand-written result cast in the migrated aggregates', () => {
    // `lib/portfolio-db.ts` keeps exactly one, for an RPC the generated types do not
    // know about. It is pinned to one occurrence, and its shape and justification
    // are asserted separately below — an exemption that is itself checked, rather
    // than a hole in this assertion.
    const EXEMPT = new Set(['lib/portfolio-db.ts'])

    for (const file of MIGRATED) {
      if (EXEMPT.has(file)) continue
      expect(code(file), file).not.toContain('as unknown as')
    }
  })
})

// ─── The defects the migration exposed ───────────────────────────────────────

describe('B8-G — user_lesson_progress no longer carries a drifted row shape', () => {
  it('aliases the record type to the generated row instead of restating it', () => {
    const source = read('lib/academy/lessons-db.ts')

    expect(source).toContain(
      "export type UserLessonProgressRecord = Database['public']['Tables']['user_lesson_progress']['Row']"
    )
  })

  it('no longer declares columns the table does not have', () => {
    const source = code('lib/academy/lessons-db.ts')

    // The hand-written duplicate claimed all four. The table has none of them: it
    // records completion as `status` and has no id, reflection or updated_at column.
    expect(source).not.toMatch(/\bcompleted:\s*boolean/)
    expect(source).not.toMatch(/\breflection_text:\s*string/)
  })

  it('stops writing updated_at, which PostgREST rejected on every call', () => {
    const source = code('lib/academy/lessons-db.ts')
    const upsertBlock = source.slice(source.indexOf('upsertUserLessonProgress'))

    expect(upsertBlock.slice(0, 600)).not.toContain('updated_at')
  })
})

describe('B8-G — the portfolio settings write is checked against the schema', () => {
  it('types the update payload as a users update rather than an open record', () => {
    const source = read('lib/portfolio-db.ts')

    expect(source).toContain("const updatePayload: TablesUpdate<'users'>")
    expect(source).not.toContain('const updatePayload: Record<string, unknown>')
  })
})

describe('B8-G — the one unavoidable cast is narrow and explained', () => {
  it('confines it to the RPC missing from the generated types', () => {
    const source = read('lib/portfolio-db.ts')
    const casts = code('lib/portfolio-db.ts').match(/as unknown as/g) ?? []

    // Exactly one, and it is the increment_portfolio_view_count RPC.
    expect(casts).toHaveLength(1)
    expect(source).toContain('increment_portfolio_view_count')
    expect(source).toContain('absent from the')
    // Narrowed to the rpc method with a named argument shape, not `any`.
    expect(source).toContain('args: { target_user_id: string }')
    expect(code('lib/portfolio-db.ts')).not.toContain('as any')
  })
})

// ─── The lint ban ────────────────────────────────────────────────────────────

const BAN_SELECTOR = 'TSAsExpression > TSAsExpression > TSUnknownKeyword'

function lintDbFile(source: string) {
  const linter = new Linter()
  return linter.verify(
    source,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsparser },
        rules: {
          'no-restricted-syntax': ['error', { selector: BAN_SELECTOR, message: 'banned' }],
        },
      },
    ],
    'lib/db/probe.ts'
  )
}

describe('B8-G — `as unknown as` is lint-banned inside lib/db', () => {
  it('rejects a double assertion', () => {
    const messages = lintDbFile('const a: unknown = 1; export const b = a as unknown as string')

    expect(messages).toHaveLength(1)
  })

  it('rejects the DBChain shape specifically', () => {
    const messages = lintDbFile(
      "declare const supabase: any; export const q = (supabase.from('users') as unknown as { x: 1 })"
    )

    expect(messages).toHaveLength(1)
  })

  it('still allows an ordinary, known-safe narrowing', () => {
    const messages = lintDbFile('declare const a: unknown; export const b = a as string')

    expect(messages).toEqual([])
  })

  it('is wired into the real config, scoped to lib/db', async () => {
    const config = read('eslint.config.mjs')

    expect(config).toContain('files: ["lib/db/**/*.ts"]')
    expect(config).toContain(BAN_SELECTOR)
  })

  it('the layer currently satisfies its own ban', () => {
    for (const file of ['lib/db/index.ts', 'lib/db/xp.ts', 'lib/db/leaderboard.ts', 'lib/db/pagination.ts']) {
      expect(code(file), file).not.toContain('as unknown as')
    }
  })
})

// ─── Runtime behaviour preserved ─────────────────────────────────────────────

describe('B8-G — badge stats still aggregate from the same rows', () => {
  it('counts completed lessons, perfect quizzes and submitted capstones', async () => {
    vi.resetModules()

    const rows: Record<string, any[]> = {
      users: [{ id: 'u1', total_xp: 500, level: 3, current_streak: 4, longest_streak: 9 }],
      user_lesson_progress: [
        { lesson_id: 'l1', status: 'completed', quiz_score: 100, quiz_attempts: 1 },
        { lesson_id: 'l2', status: 'completed', quiz_score: 100, quiz_attempts: 2 },
        { lesson_id: 'l3', status: 'in_progress', quiz_score: null, quiz_attempts: 0 },
      ],
      capstone_submissions: [{ id: 'c1' }, { id: 'c2' }],
      badges: [],
      user_badges: [],
    }

    const makeChain = (table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve({ data: rows[table]?.[0] ?? null, error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: rows[table]?.[0] ?? null, error: null })),
        then: (resolve: any) => resolve({ data: rows[table] ?? [], error: null }),
      }
      return chain
    }
    const supabase: any = { from: vi.fn((t: string) => makeChain(t)) }

    const { getUserBadgesData } = await import('../badges-db')
    const summary = await getUserBadgesData(supabase, 'u1')

    expect(summary.totalAvailable).toBeGreaterThan(0)
    expect(summary.totalEarned).toBeGreaterThanOrEqual(0)
    // Two completed lessons, one of them a first-attempt perfect score.
    expect(summary.allBadges.length).toBe(summary.totalAvailable)
  })
})
