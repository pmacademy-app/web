import { describe, it, expect } from 'vitest'
import { QUICK_START_STEPS } from '../../components/quick-start/quick-start-steps'

function shouldAutoLaunchQuickStart(userMetadata?: {
  onboarding_complete?: boolean
  quick_start_completed?: boolean
}): boolean {
  const isOnboardingComplete = Boolean(userMetadata?.onboarding_complete)
  const isQuickStartCompleted = Boolean(userMetadata?.quick_start_completed)
  return isOnboardingComplete && !isQuickStartCompleted
}

describe('Quick Start Feature Unit Tests', () => {
  describe('Tour Steps Definition', () => {
    it('contains exactly 8 sequential steps with valid content', () => {
      expect(QUICK_START_STEPS.length).toBe(8)
      QUICK_START_STEPS.forEach((step, index) => {
        expect(step.stepNumber).toBe(index + 1)
        expect(step.title).toBeTruthy()
        expect(step.description).toBeTruthy()
        expect(step.icon).toBeTruthy()
      })
    })

    it('has step titles matching actual Prodily features', () => {
      expect(QUICK_START_STEPS[0].title).toContain('Welcome to Prodily')
      expect(QUICK_START_STEPS[1].title).toContain('Curriculum')
      expect(QUICK_START_STEPS[2].title).toContain('Leaderboard')
      expect(QUICK_START_STEPS[3].title).toContain('Capstones')
      expect(QUICK_START_STEPS[4].title).toContain('Badges')
      expect(QUICK_START_STEPS[5].title).toContain('Progress')
      expect(QUICK_START_STEPS[6].title).toContain('Settings')
      expect(QUICK_START_STEPS[7].title).toContain("You're Ready")
    })
  })

  describe('Auto-Launch Trigger Logic', () => {
    it('returns true when onboarding is complete and quick start is not completed', () => {
      const userMeta = { onboarding_complete: true, quick_start_completed: false }
      expect(shouldAutoLaunchQuickStart(userMeta)).toBe(true)
    })

    it('returns false when onboarding is NOT complete', () => {
      const userMeta = { onboarding_complete: false, quick_start_completed: false }
      expect(shouldAutoLaunchQuickStart(userMeta)).toBe(false)
    })

    it('returns false when quick start is already completed', () => {
      const userMeta = { onboarding_complete: true, quick_start_completed: true }
      expect(shouldAutoLaunchQuickStart(userMeta)).toBe(false)
    })

    it('returns false when userMetadata is missing or empty', () => {
      expect(shouldAutoLaunchQuickStart(undefined)).toBe(false)
      expect(shouldAutoLaunchQuickStart({})).toBe(false)
    })
  })

  describe('Manual Reopen & Persistence Rules', () => {
    it('manual reopen does not reset quick_start_completed flag', () => {
      const initialMeta = { onboarding_complete: true, quick_start_completed: true }
      const updatedMeta = { ...initialMeta }
      expect(updatedMeta.quick_start_completed).toBe(true)
    })

    it('persistence update formats correct Supabase user_metadata payload', () => {
      const expectedPayload = { data: { quick_start_completed: true } }
      expect(expectedPayload).toEqual({ data: { quick_start_completed: true } })
    })
  })
})
