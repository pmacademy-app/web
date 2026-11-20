import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { awardXpMock, hasXpEventMock, xpValuesMock } = vi.hoisted(() => ({
  awardXpMock: vi.fn(),
  hasXpEventMock: vi.fn(async () => true),
  xpValuesMock: vi.fn(async () => ({ THEORY_READ: 20, DAILY_STREAK_BASE: 5 })),
}))

vi.mock('../xp-service', () => ({ awardXp: awardXpMock, hasXpEvent: hasXpEventMock }))
vi.mock('../xp', async (orig) => ({ ...(await orig<typeof import('../xp')>()), getRuntimeXpValues: xpValuesMock }))

import { updateUserStreak } from '../streaks-db'
import { readRunCursor, writeRunCursor } from '../notifications/run-cursor'

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

/** A tiny chainable fake: records the filters used on users.update and returns `updated`. */
function streakClient(profile: Record<string, unknown>, updated: Array<{ id: string }>) {
  const filters: Array<[string, string, unknown]> = []
  let updateValues: Record<string, unknown> | null = null
  const client = {
    from: vi.fn((table: string) => {
      const b: Record<string, unknown> = {}
      let mode: 'select' | 'update' = 'select'
      b.select = vi.fn(() => (mode === 'update' ? Promise.resolve({ data: updated, error: null }) : b))
      b.update = vi.fn((v: Record<string, unknown>) => {
        mode = 'update'
        updateValues = v
        return b
      })
      b.eq = vi.fn((c: string, v: unknown) => {
        if (mode === 'update') filters.push(['eq', c, v])
        return b
      })
      b.is = vi.fn((c: string, v: unknown) => {
        filters.push(['is', c, v])
        return b
      })
      b.order = vi.fn(() => b)
      b.limit = vi.fn(() => b)
      b.single = vi.fn(async () => ({ data: table === 'users' ? profile : null, error: null }))
      b.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
      return b
    }),
  }
  return { client, filters, getUpdate: () => updateValues }
}

describe('streak update is a compare-and-swap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('guards the write on the last_streak_date it read', async () => {
    const { client, filters, getUpdate } = streakClient(
      { timezone: 'UTC', current_streak: 2, longest_streak: 4, streak_freezes_available: 0, last_streak_date: '2000-01-01' },
      [{ id: 'u1' }]
    )
    await updateUserStreak(client as never, 'u1')
    expect(getUpdate()).not.toBeNull()
    expect(filters).toContainEqual(['eq', 'last_streak_date', '2000-01-01'])
  })

  it('uses IS NULL for a first-ever streak', async () => {
    const { client, filters } = streakClient(
      { timezone: 'UTC', current_streak: 0, longest_streak: 0, streak_freezes_available: 0, last_streak_date: null },
      [{ id: 'u1' }]
    )
    await updateUserStreak(client as never, 'u1')
    expect(filters).toContainEqual(['is', 'last_streak_date', null])
  })

  it('does nothing more when another request already moved the streak', async () => {
    const { client } = streakClient(
      { timezone: 'UTC', current_streak: 2, longest_streak: 4, streak_freezes_available: 0, last_streak_date: '2000-01-01' },
      []
    )
    await updateUserStreak(client as never, 'u1')
    expect(hasXpEventMock).not.toHaveBeenCalled()
    expect(awardXpMock).not.toHaveBeenCalled()
  })
})

describe('theory read: XP decides, then progress', () => {
  it('awards XP before writing progress and only adds xp_earned when awarded', () => {
    const src = read('lib/academy/lessons-db.ts')
    const start = src.indexOf('export async function markTheoryRead')
    const fn = src.slice(start, src.indexOf('export async function', start + 1))
    expect(fn.indexOf('await awardXp(')).toBeGreaterThan(-1)
    expect(fn.indexOf('await awardXp(')).toBeLessThan(fn.indexOf('.upsert(progressRow'))
    expect(fn).toMatch(/if \(awarded\) progressRow\.xp_earned/)
    expect(fn).not.toMatch(/catch \(xpError\)/)
  })
})

describe('reminder and recap paging cursor', () => {
  it('round-trips through system_settings and tolerates read failures', async () => {
    const store = new Map<string, unknown>()
    const client = {
      from: () => ({
        select: () => ({
          eq: (_c: string, key: string) => ({
            maybeSingle: async () => ({ data: store.has(key) ? { value: store.get(key) } : null, error: null }),
          }),
        }),
        upsert: async (row: { key: string; value: unknown }) => {
          store.set(row.key, row.value)
          return { error: null }
        },
      }),
    }
    expect(await readRunCursor(client as never, 'daily-reminder')).toBeNull()
    await writeRunCursor(client as never, 'daily-reminder', 'user-500')
    expect(await readRunCursor(client as never, 'daily-reminder')).toBe('user-500')
    await writeRunCursor(client as never, 'daily-reminder', null)
    expect(await readRunCursor(client as never, 'daily-reminder')).toBeNull()

    const broken = { from: () => { throw new Error('down') } }
    expect(await readRunCursor(broken as never, 'weekly-recap')).toBeNull()
  })

  it.each(['daily-reminder', 'weekly-recap'])('%s resumes from and saves the cursor', (job) => {
    const src = read(`app/api/cron/${job}/route.ts`)
    expect(src).toContain(`readRunCursor(supabase, '${job}')`)
    expect(src).toContain(`writeRunCursor(supabase, '${job}', reachedEnd ? null : lastSeenId)`)
  })
})

describe('health check reports stuck scheduled jobs', () => {
  it('reads heartbeats and fails the check on a stale job', () => {
    const src = read('app/api/health/route.ts')
    expect(src).toContain('readCronHeartbeats')
    expect(src).toMatch(/isHealthy = dbStatus === 'connected' && jobsStatus !== 'stale'/)
  })
})
