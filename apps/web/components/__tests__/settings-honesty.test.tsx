/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { LearningSettings, OnboardingSettings } from '@/lib/admin/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { LearningSettingsSection } from '@/components/admin/LearningSettingsSection'
import { OnboardingSettingsSection } from '@/components/admin/OnboardingSettingsSection'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const learning: LearningSettings = {
  xpPerLessonComplete: 10,
  xpPerQuizPass: 5,
  xpPerFlashcardReview: 1,
  xpPerReflection: 10,
  xpReferralReward: 50,
  xpQuizPerfectBonus: 5,
  xpPerCapstoneSubmitted: 100,
  xpStreakBaseReward: 5,
  streakFreezeEnabled: true,
  streakFreezeCostXp: 50,
  certificateAutoIssue: true,
  certificateExpiryDays: null,
  lessonCompletionRequiredForProgress: true,
  quizPassThreshold: 70,
} as LearningSettings

const commonProps = {
  sectionKey: 'learning' as const,
  onSave: () => {},
  onReset: () => {},
  isDirty: false,
  isSaving: false,
}

describe('LearningSettingsSection honesty', () => {
  it('shows the XP propagation help line', () => {
    act(() => {
      root.render(
        <LearningSettingsSection {...commonProps} data={learning} initialData={learning} onChange={() => {}} />
      )
    })
    expect(container.textContent).toContain('Changes apply within a minute on all servers')
  })

  it('lists the stored fields the app does not use yet, without inputs for them', () => {
    act(() => {
      root.render(
        <LearningSettingsSection {...commonProps} data={learning} initialData={learning} onChange={() => {}} />
      )
    })
    const text = container.textContent ?? ''
    expect(text).toContain('Not used by the app yet')
    for (const name of [
      'streak freezes',
      'streak freeze cost',
      'certificate auto-issue',
      'certificate expiry',
      'lesson completion required for progress',
      'quiz pass threshold',
    ]) {
      expect(text).toContain(name)
    }
    // Only the eight XP inputs are rendered.
    expect(container.querySelectorAll('input').length).toBe(8)
  })
})

describe('OnboardingSettingsSection honesty', () => {
  const onboarding: OnboardingSettings = { enabled: true }

  it('disables the global enabled toggle and labels it as not used yet', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(
        <OnboardingSettingsSection
          {...commonProps}
          sectionKey="onboarding"
          data={onboarding}
          initialData={onboarding}
          onChange={onChange}
        />
      )
    })
    const switches = Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="switch"]'))
    const global = switches.find((b) => b.getAttribute('aria-label')?.startsWith('Onboarding screen toggle'))
    expect(global).toBeDefined()
    expect(global!.disabled).toBe(true)
    expect(container.textContent).toContain('Not used by the app yet')

    act(() => global!.click())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the per-option enabled toggles working', () => {
    const onChange = vi.fn()
    act(() => {
      root.render(
        <OnboardingSettingsSection
          {...commonProps}
          sectionKey="onboarding"
          data={onboarding}
          initialData={onboarding}
          onChange={onChange}
        />
      )
    })
    const optionToggle = container.querySelector<HTMLButtonElement>(
      'button[role="switch"][aria-label^="Toggle option"]'
    )
    expect(optionToggle).not.toBeNull()
    expect(optionToggle!.disabled).toBe(false)

    act(() => optionToggle!.click())
    expect(onChange).toHaveBeenCalledTimes(1)
    const arg = onChange.mock.calls[0][0] as Partial<OnboardingSettings>
    expect(arg.fieldOptions?.goal?.[0]?.enabled).toBe(false)
  })
})
