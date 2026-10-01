/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getCapstoneThresholdConfig,
  getCapstoneThresholdVariant,
  getRequiredLessonsForVariant,
  getRequiredLessonsForUser,
  capstoneThresholdBucket,
  CONTROL_REQUIRED_LESSONS,
  DEFAULT_TREATMENT_REQUIRED_LESSONS,
  type CapstoneThresholdConfig,
} from '../capstone-threshold-experiment'
import { deriveCapstoneStatus } from '../capstones'
import { saveDraftAction, submitCapstoneAction, resolveCapstoneThreshold } from '../capstones-db'

const validLongContent = `
# Product Opportunity Brief: Customer Onboarding Improvement

## 1. Problem Statement
The user onboarding dropoff rate is currently 42% within the first 14 days. Customers report feeling overwhelmed by excessive initial configuration steps and unclear value propositions across the product.

## 2. Target Persona & User Segment
Our primary target user persona is the Early Career Product Manager trying to quickly set up their workspace. Their main constraint is limited time during work hours to evaluate the product.

## 3. Jobs-To-Be-Done (JTBD)
- **Core Job:** When I first sign up for the platform, I want a guided setup wizard so that I can reach my first value milestone in under five minutes without confusion.
- **Emotional Job:** Feel confident and competent using the tool.

## 4. Business Impact & Success Metrics
- **Primary Metric:** 14-day onboarding activation rate increase from 58% to 75% within two quarters.
- **Secondary Metrics:** Time to first active project creation reduced from 20 minutes to 5 minutes.
- **Guardrail Metric:** User support ticket volume should not increase by more than 5%.

## 5. Key Risks & Hypotheses
We hypothesize that replacing raw forms with an interactive step-by-step checklist will increase activation by reducing cognitive overload for new users.
`.repeat(2)

/** A supabase mock where the module has `completed` lessons and the user has a given created_at. */
function mockSupabaseFor(opts: {
  completedLessons: number
  createdAt?: string | null
  existingSubmission?: any
}) {
  const progressRows = Array.from({ length: opts.completedLessons }, (_, i) => ({
    lesson_id: `les_found_${i}`,
    status: 'completed',
  }))
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { created_at: opts.createdAt ?? null }, error: null }),
        }
      }
      if (table === 'user_lesson_progress') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: progressRows, error: null }),
        }
      }
      if (table === 'capstone_submissions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: opts.existingSubmission ? [opts.existingSubmission] : [] }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'cap-new', user_id: 'u-new', module_slug: 'foundations', status: 'draft', content: 'Draft content' },
                error: null,
              }),
            }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
  } as any
}

const enabledConfig = (over: Partial<CapstoneThresholdConfig> = {}): CapstoneThresholdConfig => ({
  enabled: true,
  treatmentPercent: 100,
  treatmentRequiredLessons: DEFAULT_TREATMENT_REQUIRED_LESSONS,
  cohortStartMs: null,
  ...over,
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Phase 7 — capstone threshold experiment assignment', () => {
  it('defaults to control (8 of 10) when the flag is unset', () => {
    const config = getCapstoneThresholdConfig({} as NodeJS.ProcessEnv)
    expect(config.enabled).toBe(false)
    expect(getCapstoneThresholdVariant({ id: 'u1' }, config)).toBe('control')
    expect(getRequiredLessonsForUser({ id: 'u1' }, config)).toBe(CONTROL_REQUIRED_LESSONS)
    expect(CONTROL_REQUIRED_LESSONS).toBe(8)
  })

  it('treatment uses the blueprint 4-of-10 threshold by default', () => {
    expect(DEFAULT_TREATMENT_REQUIRED_LESSONS).toBe(4)
    const config = enabledConfig()
    expect(getRequiredLessonsForVariant('treatment', config)).toBe(4)
    expect(getRequiredLessonsForVariant('control', config)).toBe(8)
  })

  it('assignment is deterministic and stable for a user', () => {
    const config = enabledConfig({ treatmentPercent: 50 })
    const first = getCapstoneThresholdVariant({ id: 'stable-user' }, config)
    const second = getCapstoneThresholdVariant({ id: 'stable-user' }, config)
    expect(first).toBe(second)
    // bucket is a pure hash, always in range
    const bucket = capstoneThresholdBucket('stable-user')
    expect(bucket).toBeGreaterThanOrEqual(0)
    expect(bucket).toBeLessThan(100)
  })

  it('0% split is all control; 100% split is all treatment', () => {
    expect(getCapstoneThresholdVariant({ id: 'x' }, enabledConfig({ treatmentPercent: 0 }))).toBe('control')
    expect(getCapstoneThresholdVariant({ id: 'x' }, enabledConfig({ treatmentPercent: 100 }))).toBe('treatment')
  })

  it('anonymous / id-less viewers are always control', () => {
    expect(getCapstoneThresholdVariant(null, enabledConfig())).toBe('control')
    expect(getCapstoneThresholdVariant({ id: null }, enabledConfig())).toBe('control')
  })

  it('cohort gate keeps existing (pre-start) users on control — they never lose access', () => {
    const config = enabledConfig({ cohortStartMs: Date.parse('2026-09-30T00:00:00Z') })
    // Created before cohort start → control (8), even with the flag fully on.
    expect(getCapstoneThresholdVariant({ id: 'old', createdAt: '2026-01-01T00:00:00Z' }, config)).toBe('control')
    // Created on/after cohort start → treatment.
    expect(getCapstoneThresholdVariant({ id: 'new', createdAt: '2026-10-05T00:00:00Z' }, config)).toBe('treatment')
    // Missing created_at with a cohort gate → control (safe).
    expect(getCapstoneThresholdVariant({ id: 'unknown', createdAt: null }, config)).toBe('control')
  })

  it('a "treatment" threshold above control is refused and falls back to the default', () => {
    const config = getCapstoneThresholdConfig({
      CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED: 'true',
      CAPSTONE_THRESHOLD_TREATMENT_LESSONS: '9', // > control, would REDUCE access — rejected
    } as unknown as NodeJS.ProcessEnv)
    expect(config.treatmentRequiredLessons).toBe(DEFAULT_TREATMENT_REQUIRED_LESSONS)
  })
})

describe('Phase 7 — threshold drives status derivation', () => {
  it('control gate: locked below 8, unlocked at 8', () => {
    expect(deriveCapstoneStatus(null, 7, 8)).toBe('locked')
    expect(deriveCapstoneStatus(null, 8, 8)).toBe('unlocked')
  })

  it('treatment gate: unlocked at 4', () => {
    expect(deriveCapstoneStatus(null, 3, 4)).toBe('locked')
    expect(deriveCapstoneStatus(null, 4, 4)).toBe('unlocked')
  })

  it('a submitted status is authoritative regardless of threshold', () => {
    expect(deriveCapstoneStatus('submitted', 0, 4)).toBe('submitted')
    expect(deriveCapstoneStatus('draft', 0, 8)).toBe('draft')
  })
})

describe('Phase 7 — server-side enforcement (no client bypass)', () => {
  it('control (flag off): draft/submit rejected below 8 even for a new account', async () => {
    // Flag off → resolveCapstoneThreshold short-circuits to control without touching users table.
    const supabase = mockSupabaseFor({ completedLessons: 4, createdAt: '2026-10-05T00:00:00Z' })
    const { requiredLessons } = await resolveCapstoneThreshold(supabase, 'u1')
    expect(requiredLessons).toBe(8)

    await expect(saveDraftAction(supabase, 'u1', 'foundations', 'x')).rejects.toThrow(
      'at least 8 lessons'
    )
    await expect(submitCapstoneAction(supabase, 'u1', 'foundations', validLongContent)).rejects.toThrow(
      'at least 8 lessons'
    )
  })

  it('treatment (flag on, in cohort): draft allowed at 4 completed lessons', async () => {
    vi.stubEnv('CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED', 'true')
    vi.stubEnv('CAPSTONE_THRESHOLD_COHORT_START', '2026-09-30T00:00:00Z')

    const supabase = mockSupabaseFor({ completedLessons: 4, createdAt: '2026-10-05T00:00:00Z' })
    const { requiredLessons, variant } = await resolveCapstoneThreshold(supabase, 'u-new')
    expect(variant).toBe('treatment')
    expect(requiredLessons).toBe(4)

    // Draft insert path must succeed (no throw) at exactly the treatment threshold.
    const res = await saveDraftAction(supabase, 'u-new', 'foundations', 'Draft content')
    expect(res.success).toBe(true)
  })

  it('treatment flag on but OUT of cohort (old account): still gated at 8', async () => {
    vi.stubEnv('CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED', 'true')
    vi.stubEnv('CAPSTONE_THRESHOLD_COHORT_START', '2026-09-30T00:00:00Z')

    const supabase = mockSupabaseFor({ completedLessons: 4, createdAt: '2025-01-01T00:00:00Z' })
    const { requiredLessons, variant } = await resolveCapstoneThreshold(supabase, 'u-old')
    expect(variant).toBe('control')
    expect(requiredLessons).toBe(8)

    await expect(saveDraftAction(supabase, 'u-old', 'foundations', 'x')).rejects.toThrow(
      'at least 8 lessons'
    )
  })

  it('threshold resolution fails closed to control on a read error', async () => {
    vi.stubEnv('CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED', 'true')
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('db down')
      }),
    } as any
    const { requiredLessons, variant } = await resolveCapstoneThreshold(supabase, 'u1')
    expect(variant).toBe('control')
    expect(requiredLessons).toBe(8)
  })
})
