import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Admin XP settings used to save under `learning_settings` while the runtime read `learning`, so
// no admin XP change ever applied. The fix: the runtime reads the admin record once it is saved by
// the reconciled form (xpSettingsVersion 2), and otherwise behaves exactly as before. That makes
// the deploy itself change nobody's XP, even if a stale record (old 50/100 defaults) exists.

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown> | null>,
  upserts: [] as unknown[],
  readError: null as { message: string } | null,
  /** Keys whose read fails while the others succeed. */
  readErrorKeys: [] as string[],
}))

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
        maybeSingle: async () =>
          db.readError || db.readErrorKeys.includes(key)
            ? { data: null, error: db.readError ?? { message: `read of ${key} failed` } }
            : { data: db.rows[key] ? { value: db.rows[key] } : null, error: null },
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
import { DEFAULT_LEARNING_SETTINGS, SettingsReadError, SettingsService, xpFieldsFromRuntime } from '@/lib/admin/settings-service'
import type { LearningSettings } from '@/lib/admin/types'

const STALE_ADMIN_RECORD = { xpPerLessonComplete: 50, xpPerQuizPass: 100, xpPerFlashcardReview: 10, xpPerReflection: 25 }

beforeEach(() => {
  db.rows = {}
  db.upserts = []
  db.readError = null
  db.readErrorKeys = []
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

// A failed settings read must not swap configured XP for the static defaults: the last good values
// keep being served, and the read is retried after a short backoff rather than a full 30s TTL.
describe('getRuntimeXpValues on a failed settings read', () => {
  const T0 = Date.parse('2026-10-12T09:00:00Z')
  const at = (ms: number) => vi.spyOn(Date, 'now').mockReturnValue(T0 + ms)

  it('keeps serving the last good values, and retries soon', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.rows.learning_settings = { xpPerLessonComplete: 12, xpSettingsVersion: XP_SETTINGS_VERSION }
    at(0)
    expect((await getRuntimeXpValues(client())).THEORY_READ).toBe(12)

    // The cache has expired and the read fails: still 12, not the static 10.
    db.readError = { message: 'down' }
    at(31_000)
    expect((await getRuntimeXpValues(client())).THEORY_READ).toBe(12)
    expect(warn).toHaveBeenCalledTimes(1)

    // Within the backoff nothing is re-read; after it, the recovered record is picked up.
    db.readError = null
    db.rows.learning_settings = { xpPerLessonComplete: 14, xpSettingsVersion: XP_SETTINGS_VERSION }
    at(32_000)
    expect((await getRuntimeXpValues(client())).THEORY_READ).toBe(12)
    at(31_000 + 10_000)
    expect((await getRuntimeXpValues(client())).THEORY_READ).toBe(14)
  })

  it('falls back to the static defaults only when there has never been a good value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.readError = { message: 'down' }
    at(0)
    expect(await getRuntimeXpValues(client())).toEqual(XP_VALUES)
    expect(warn).toHaveBeenCalledTimes(1)

    // Retried after the backoff, not held for a full TTL.
    db.readError = null
    db.rows.learning_settings = { xpPerLessonComplete: 12, xpSettingsVersion: XP_SETTINGS_VERSION }
    at(10_000)
    expect((await getRuntimeXpValues(client())).THEORY_READ).toBe(12)
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

    await SettingsService.updateLearningSettings({
      xpFormVersion: XP_SETTINGS_VERSION,
      xpPerLessonComplete: 15,
      xpPerQuizPass: 0,
      xpQuizPerfectBonus: 0,
    })

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

// An admin tab opened on the previous build (or served by an old instance during a rolling deploy)
// still holds that build's inert defaults and PATCHes the whole section. Those numbers must never
// go live: XP fields are accepted only from a form loaded from the reconciled values, which echoes
// the `xpFormVersion` the GET handed it.
describe('a save from a form loaded before the reconciliation', () => {
  /** What the previous build's form PATCHes: its whole section, old XP defaults, no form version. */
  const STALE_FORM_BODY = {
    ...STALE_ADMIN_RECORD,
    streakFreezeEnabled: true,
    streakFreezeCostXp: 500,
    certificateAutoIssue: true,
    certificateExpiryDays: null,
    lessonCompletionRequiredForProgress: true,
    quizPassThreshold: 70,
  }

  const storeUpserts = () =>
    vi
      .spyOn(SettingsService as unknown as { upsertSettings: (s: string, v: unknown) => Promise<unknown> }, 'upsertSettings')
      .mockImplementation(async (_section, value) => {
        db.rows.learning_settings = value as Record<string, unknown>
        SettingsService.invalidateCache()
        return value
      })

  it('hands the form its version on every read, without storing it', async () => {
    expect((await SettingsService.getLearningSettings()).xpFormVersion).toBe(XP_SETTINGS_VERSION)

    db.rows.learning_settings = { xpPerLessonComplete: 12, xpSettingsVersion: XP_SETTINGS_VERSION }
    SettingsService.invalidateCache()
    expect((await SettingsService.getLearningSettings()).xpFormVersion).toBe(XP_SETTINGS_VERSION)
  })

  it('leaves every XP value as it was when the stale form saves over an unversioned record', async () => {
    storeUpserts()

    await SettingsService.updateLearningSettings(STALE_FORM_BODY)

    expect(await getRuntimeXpValues(client(), true)).toEqual(XP_VALUES)
  })

  it('still saves the other fields of a stale form, and keeps the legacy record in charge of XP', async () => {
    db.rows.learning_settings = STALE_ADMIN_RECORD
    db.rows.learning = { xpPerLessonComplete: 20 }
    const upsert = storeUpserts()

    await SettingsService.updateLearningSettings({ ...STALE_FORM_BODY, quizPassThreshold: 85 })

    const saved = upsert.mock.calls[0][1] as LearningSettings
    expect(saved.quizPassThreshold).toBe(85)
    const xp = await getRuntimeXpValues(client(), true)
    expect(xp).toEqual({ ...XP_VALUES, THEORY_READ: 20 })
  })

  it('cannot be turned into the runtime source by sending the stored version itself', async () => {
    storeUpserts()

    await SettingsService.updateLearningSettings({ ...STALE_FORM_BODY, xpSettingsVersion: XP_SETTINGS_VERSION })

    expect(await getRuntimeXpValues(client(), true)).toEqual(XP_VALUES)
  })

  // The gate is an exact match on the number 2: nothing that merely looks like it passes.
  it.each([['2'], [1], [null], [true]])('leaves XP unchanged and stamps no version for xpFormVersion %o', async (version) => {
    const upsert = storeUpserts()

    await SettingsService.updateLearningSettings({ ...STALE_FORM_BODY, xpFormVersion: version } as unknown as Partial<LearningSettings>)

    const saved = upsert.mock.calls[0][1] as LearningSettings
    expect(saved.xpSettingsVersion).toBeUndefined()
    expect(saved).not.toHaveProperty('xpFormVersion')
    expect(saved).toMatchObject(xpFieldsFromRuntime(XP_VALUES))
    expect(await getRuntimeXpValues(client(), true)).toEqual(XP_VALUES)
  })

  it('applies XP changes from the reconciled form, and never stores the form version', async () => {
    const upsert = storeUpserts()
    const form = await SettingsService.getLearningSettings()

    await SettingsService.updateLearningSettings({ ...form, xpPerLessonComplete: 30, xpPerFlashcardReview: 4 })

    const saved = upsert.mock.calls[0][1] as LearningSettings
    expect(saved.xpSettingsVersion).toBe(XP_SETTINGS_VERSION)
    expect(saved).not.toHaveProperty('xpFormVersion')
    const xp = await getRuntimeXpValues(client(), true)
    expect(xp).toEqual({ ...XP_VALUES, THEORY_READ: 30, FLASHCARD_REVIEW: 4 })
  })

  it('keeps customised XP on a live record when the stale form saves over it', async () => {
    db.rows.learning_settings = { xpPerLessonComplete: 12, xpPerQuizPass: 7, xpSettingsVersion: XP_SETTINGS_VERSION }
    const upsert = storeUpserts()

    await SettingsService.updateLearningSettings({ ...STALE_FORM_BODY, quizPassThreshold: 85 })

    const saved = upsert.mock.calls[0][1] as LearningSettings
    expect(saved.quizPassThreshold).toBe(85)
    expect(saved.xpSettingsVersion).toBe(XP_SETTINGS_VERSION)
    const xp = await getRuntimeXpValues(client(), true)
    expect(xp).toEqual({ ...XP_VALUES, THEORY_READ: 12, QUIZ_CORRECT: 7 })
  })
})

describe('referral reward on an older record', () => {
  it('keeps the stored referral reward, which was always the one paid', async () => {
    db.rows.learning_settings = { ...STALE_ADMIN_RECORD, xpReferralReward: 100 }
    const settings = await SettingsService.getLearningSettings()
    expect(settings.xpReferralReward).toBe(100)
    expect(settings.xpPerLessonComplete).toBe(XP_VALUES.THEORY_READ)
  })
})

// The admin form shows an unversioned record's XP as "the values in effect", read from the legacy
// `learning` record. If that read fails, the tolerant runtime reader answers with a fallback; the
// strict (admin) read must not present that fallback as live, or a save would stamp it as version 2.
describe('a strict read when the live XP values cannot be read', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.rows.learning_settings = { ...STALE_ADMIN_RECORD, xpReferralReward: 100 }
    db.rows.learning = { xpPerLessonComplete: 20 }
    db.readErrorKeys = ['learning']
  })

  it('raises SettingsReadError instead of showing the static defaults as live', async () => {
    const read = SettingsService.getLearningSettings({ strict: true })
    await expect(read).rejects.toBeInstanceOf(SettingsReadError)
    await expect(read).rejects.toMatchObject({ section: 'learning' })
  })

  it('refuses the save, so the customised legacy config is never overwritten', async () => {
    await expect(
      SettingsService.updateLearningSettings({ xpFormVersion: XP_SETTINGS_VERSION, quizPassThreshold: 85 }),
    ).rejects.toBeInstanceOf(SettingsReadError)
    expect(db.upserts).toEqual([])
  })

  it('does not poison the runtime cache: awards keep the last good values', async () => {
    db.readErrorKeys = []
    expect((await getRuntimeXpValues(client(), true)).THEORY_READ).toBe(20)

    db.readErrorKeys = ['learning']
    await expect(SettingsService.getLearningSettings({ strict: true })).rejects.toBeInstanceOf(SettingsReadError)
    expect((await getRuntimeXpValues(client())).THEORY_READ).toBe(20)
  })

  it('leaves the tolerant read as it was: a fallback, no error', async () => {
    const settings = await SettingsService.getLearningSettings()
    expect(settings.xpPerLessonComplete).toBe(XP_VALUES.THEORY_READ)
    expect(settings.xpReferralReward).toBe(100)
  })

  it('reads fresh under strict even when the runtime cache holds a fallback', async () => {
    // A failed tolerant read caches the static defaults for the backoff window.
    expect((await getRuntimeXpValues(client())).THEORY_READ).toBe(XP_VALUES.THEORY_READ)
    db.readErrorKeys = []
    expect((await SettingsService.getLearningSettings({ strict: true })).xpPerLessonComplete).toBe(20)
  })
})
