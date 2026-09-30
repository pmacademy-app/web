/**
 * Phase 6 — module-entry unlock experiment assignment.
 *
 * Verifies the flag defaults to control, honours the cohort start date (new signups only),
 * is deterministic per user, and respects the treatment split.
 */

import { describe, it, expect } from 'vitest'
import {
  getModuleEntryUnlockConfig,
  getModuleEntryUnlockVariant,
  isModuleEntryUnlockTreatment,
  moduleEntryUnlockBucket,
} from '../academy/module-entry-unlock'

const AFTER = '2026-02-01T00:00:00Z' // after cohort start
const BEFORE = '2025-12-01T00:00:00Z' // before cohort start
const COHORT_START = '2026-01-01T00:00:00Z'

describe('getModuleEntryUnlockConfig', () => {
  it('defaults to control (disabled) with no env', () => {
    const cfg = getModuleEntryUnlockConfig({} as NodeJS.ProcessEnv)
    expect(cfg.enabled).toBe(false)
    expect(cfg.treatmentPercent).toBe(100)
    expect(cfg.cohortStartMs).toBeNull()
  })

  it('parses enabled, percent and cohort start', () => {
    const cfg = getModuleEntryUnlockConfig({
      MODULE_ENTRY_UNLOCK_ENABLED: 'true',
      MODULE_ENTRY_UNLOCK_TREATMENT_PCT: '50',
      MODULE_ENTRY_UNLOCK_COHORT_START: COHORT_START,
    } as unknown as NodeJS.ProcessEnv)
    expect(cfg.enabled).toBe(true)
    expect(cfg.treatmentPercent).toBe(50)
    expect(cfg.cohortStartMs).toBe(Date.parse(COHORT_START))
  })

  it('ignores an out-of-range or invalid percent', () => {
    expect(getModuleEntryUnlockConfig({ MODULE_ENTRY_UNLOCK_TREATMENT_PCT: '999' } as unknown as NodeJS.ProcessEnv).treatmentPercent).toBe(100)
    expect(getModuleEntryUnlockConfig({ MODULE_ENTRY_UNLOCK_TREATMENT_PCT: 'abc' } as unknown as NodeJS.ProcessEnv).treatmentPercent).toBe(100)
  })
})

describe('getModuleEntryUnlockVariant', () => {
  const enabledAll = { enabled: true, treatmentPercent: 100, cohortStartMs: null }
  const enabledCohort = { enabled: true, treatmentPercent: 100, cohortStartMs: Date.parse(COHORT_START) }

  it('is control when the flag is disabled (default)', () => {
    expect(getModuleEntryUnlockVariant({ id: 'u1', createdAt: AFTER }, { enabled: false, treatmentPercent: 100, cohortStartMs: null })).toBe('control')
  })

  it('is control for anonymous/no-id users', () => {
    expect(getModuleEntryUnlockVariant(null, enabledAll)).toBe('control')
    expect(getModuleEntryUnlockVariant({ id: null }, enabledAll)).toBe('control')
  })

  it('treats every eligible user when enabled at 100% with no cohort gate', () => {
    expect(getModuleEntryUnlockVariant({ id: 'u1', createdAt: BEFORE }, enabledAll)).toBe('treatment')
  })

  it('restricts to the new-signup cohort when a start date is set', () => {
    expect(getModuleEntryUnlockVariant({ id: 'u1', createdAt: AFTER }, enabledCohort)).toBe('treatment')
    expect(getModuleEntryUnlockVariant({ id: 'u1', createdAt: BEFORE }, enabledCohort)).toBe('control')
  })

  it('treats a user created exactly at the cohort boundary (>=) as eligible', () => {
    expect(getModuleEntryUnlockVariant({ id: 'u1', createdAt: COHORT_START }, enabledCohort)).toBe('treatment')
  })

  it('is control when a cohort is required but created_at is missing', () => {
    expect(getModuleEntryUnlockVariant({ id: 'u1', createdAt: null }, enabledCohort)).toBe('control')
  })

  it('is deterministic per user id', () => {
    const cfg = { enabled: true, treatmentPercent: 50, cohortStartMs: null }
    const a = getModuleEntryUnlockVariant({ id: 'stable-user', createdAt: AFTER }, cfg)
    const b = getModuleEntryUnlockVariant({ id: 'stable-user', createdAt: AFTER }, cfg)
    expect(a).toBe(b)
  })

  it('honours a 0% split (all control) and 100% split (all treatment)', () => {
    expect(getModuleEntryUnlockVariant({ id: 'u1', createdAt: AFTER }, { enabled: true, treatmentPercent: 0, cohortStartMs: null })).toBe('control')
    expect(getModuleEntryUnlockVariant({ id: 'u1', createdAt: AFTER }, { enabled: true, treatmentPercent: 100, cohortStartMs: null })).toBe('treatment')
  })

  it('splits a population roughly by the treatment percent', () => {
    const cfg = { enabled: true, treatmentPercent: 50, cohortStartMs: null }
    let treatment = 0
    const N = 2000
    for (let i = 0; i < N; i++) {
      if (getModuleEntryUnlockVariant({ id: `user-${i}`, createdAt: AFTER }, cfg) === 'treatment') treatment++
    }
    // Deterministic hash → expect within a loose band of 50%.
    expect(treatment).toBeGreaterThan(N * 0.4)
    expect(treatment).toBeLessThan(N * 0.6)
  })

  it('bucket is in range [0,99]', () => {
    for (const id of ['a', 'b', 'c', 'longer-user-id-123']) {
      const b = moduleEntryUnlockBucket(id)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(100)
    }
  })

  it('isModuleEntryUnlockTreatment mirrors getModuleEntryUnlockVariant', () => {
    expect(isModuleEntryUnlockTreatment({ id: 'u1', createdAt: AFTER }, { enabled: true, treatmentPercent: 100, cohortStartMs: null })).toBe(true)
    expect(isModuleEntryUnlockTreatment({ id: 'u1', createdAt: AFTER }, { enabled: false, treatmentPercent: 100, cohortStartMs: null })).toBe(false)
  })
})
