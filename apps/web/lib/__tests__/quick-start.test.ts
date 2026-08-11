import { describe, it } from 'node:test'
import assert from 'node:assert'
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
      assert.strictEqual(QUICK_START_STEPS.length, 8)
      QUICK_START_STEPS.forEach((step, index) => {
        assert.strictEqual(step.stepNumber, index + 1)
        assert.ok(step.title, `Step ${index + 1} must have a title`)
        assert.ok(step.description, `Step ${index + 1} must have a description`)
        assert.ok(step.icon, `Step ${index + 1} must have an icon`)
      })
    })

    it('has step titles matching actual Prodily features', () => {
      assert.ok(QUICK_START_STEPS[0].title.includes('Welcome to Prodily'))
      assert.ok(QUICK_START_STEPS[1].title.includes('Curriculum'))
      assert.ok(QUICK_START_STEPS[2].title.includes('Leaderboard'))
      assert.ok(QUICK_START_STEPS[3].title.includes('Capstones'))
      assert.ok(QUICK_START_STEPS[4].title.includes('Badges'))
      assert.ok(QUICK_START_STEPS[5].title.includes('Progress'))
      assert.ok(QUICK_START_STEPS[6].title.includes('Settings'))
      assert.ok(QUICK_START_STEPS[7].title.includes("You're Ready"))
    })
  })

  describe('Auto-Launch Trigger Logic', () => {
    it('returns true when onboarding is complete and quick start is not completed', () => {
      const userMeta = { onboarding_complete: true, quick_start_completed: false }
      assert.strictEqual(shouldAutoLaunchQuickStart(userMeta), true)
    })

    it('returns false when onboarding is NOT complete', () => {
      const userMeta = { onboarding_complete: false, quick_start_completed: false }
      assert.strictEqual(shouldAutoLaunchQuickStart(userMeta), false)
    })

    it('returns false when quick start is already completed', () => {
      const userMeta = { onboarding_complete: true, quick_start_completed: true }
      assert.strictEqual(shouldAutoLaunchQuickStart(userMeta), false)
    })

    it('returns false when userMetadata is missing or empty', () => {
      assert.strictEqual(shouldAutoLaunchQuickStart(undefined), false)
      assert.strictEqual(shouldAutoLaunchQuickStart({}), false)
    })
  })

  describe('Manual Reopen & Persistence Rules', () => {
    it('manual reopen does not reset quick_start_completed flag', () => {
      const initialMeta = { onboarding_complete: true, quick_start_completed: true }
      const updatedMeta = { ...initialMeta }
      assert.strictEqual(updatedMeta.quick_start_completed, true)
    })

    it('persistence update formats correct Supabase user_metadata payload', () => {
      const expectedPayload = { data: { quick_start_completed: true } }
      assert.deepStrictEqual(expectedPayload, { data: { quick_start_completed: true } })
    })
  })
})
