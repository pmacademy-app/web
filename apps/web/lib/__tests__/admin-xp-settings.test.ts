import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Admin XP settings used to save under `learning_settings` while the runtime read `learning`, so
// no admin XP change ever applied. The fix: the runtime reads the admin record once it is saved by
// the reconciled form (xpSettingsVersion 2), and otherwise behaves exactly as before. That makes
// the deploy itself change nobody's XP, even if a stale record (old 50/100 defaults) exists.

const db = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown> | null>, upserts: [] as unknown[] }))

/** A system_settings stand-in keyed by `key`. */
function client() {
  return {
    from: () => {
      let key = ''
      const chain = {
        select: () => chain,
        eq: (_col: string, value: string) => {
          key = value
          return chain
        },
        maybeSingle: async () => ({ data: db.rows[key] ? { value: db.rows[key] } : null, error: null }),
        upsert: async (row: unknown) => {
          db.upserts.push(row)
          return { error: null }
        },
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createServiceRoleClient: () => client() }
})
vi.mock('../supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createServiceRoleClient: () => client() }
})

import { XP_SETTINGS_VERSION, XP_VALUES, getRuntimeXpValues, invalidateRuntimeXpCache } from '@/lib/xp/xp'
import { DEFAULT_LEARNING_SETTINGS, SettingsService, xpFieldsFromRuntime } from '@/lib/admin/settings-service'
import type { LearningSettings } from '@/lib/admin/types'

const STALE_ADMIN_RECORD = { xpPerLessonComplete: 50, xpPerQuizPass: 100, xpPerFlashcardReview: 10, xpPerReflection: 25 }

beforeEach(() => {
  db.rows = {}
  db.upserts = []
  invalidateRuntimeXpCache()
  SettingsService.invalidateCache()
})

afterEach(() => vi.restoreAllMocks())

describe('getRuntimeXpValues sources', () => {
  it('uses the admin record once the reconciled form saved it', async () => {
    db.rows.learning_settings = { xpPerLessonComplete: 12, xpPerQuizPass: 7, xpSettingsVersion: XP_SETTINGS_VERSION }
    db.rows.learning = { xpPerLessonComplete: 99 }

    const xp = await getRuntimeXpValues(client(), true)
    expect(xp.THEORY_READ).toBe(12)
    expect(xp.QUIZ_CORRECT).toBe(7)
  })

  it('ignores a stale admin record, so the deploy changes nobody\'s XP', async () => {
    db.rows.learning_settings = STALE_ADMIN_RECORD
    expect(await getRuntimeXpValues(client(), true)).toEqual(XP_VALUES)
  })

  it('keeps honouring the legacy `learning` record until the admin record is saved', async () => {
    db.rows.learning_settings = STALE_ADMIN_RECORD
    db.rows.learning = { xpPerLessonComplete: 20 }
    expect((await getRuntimeXpValues(client(), true)).THEORY_READ).toBe(20)
  })
})

describe('admin learning settings', () => {
  it('defaults the XP fields to the live values, so saving unchanged changes nothing', () => {
    expect(xpFieldsFromRuntime(XP_VALUES)).toMatchObject({
      xpPerLessonComplete: XP_VALUES.THEORY_READ,
      xpPerQuizPass: XP_VALUES.QUIZ_CORRECT,
      xpPerFlashcardReview: XP_VALUES.FLASHCARD_REVIEW,
      xpPerReflection: XP_VALUES.REFLECTION_SUBMITTED,
    })
    expect(DEFAULT_LEARNING_SETTINGS).toMatchObject(xpFieldsFromRuntime(XP_VALUES))
  })

  it('shows the values in effect, not a stale record\'s numbers', async () => {
    db.rows.learning_settings = STALE_ADMIN_RECORD
    const settings = await SettingsService.getLearningSettings()
    expect(settings).toMatchObject({ xpPerLessonComplete: XP_VALUES.THEORY_READ, xpPerQuizPass: XP_VALUES.QUIZ_CORRECT })
  })

  it('a save marks the record as the runtime source, keeps current values for invalid input, and applies', async () => {
    const upsert = vi
      .spyOn(SettingsService as unknown as { upsertSettings: (s: string, v: unknown) => Promise<unknown> }, 'upsertSettings')
      .mockImplementation(async (_section, value) => {
        db.rows.learning_settings = value as Record<string, unknown>
        return value
      })

    await SettingsService.updateLearningSettings({ xpPerLessonComplete: 15, xpPerQuizPass: 0, xpQuizPerfectBonus: 0 })

    const saved = upsert.mock.calls[0][1] as LearningSettings
    expect(saved.xpSettingsVersion).toBe(XP_SETTINGS_VERSION)
    expect(saved.xpPerLessonComplete).toBe(15)
    expect(saved.xpPerQuizPass).toBe(XP_VALUES.QUIZ_CORRECT) // 0 is invalid: kept
    expect(saved.xpQuizPerfectBonus).toBe(0) // 0 turns the bonus off, allowed

    // The runtime picks the saved record up immediately on this instance (cache invalidated).
    const xp = await getRuntimeXpValues(client())
    expect(xp.THEORY_READ).toBe(15)
  })
})
