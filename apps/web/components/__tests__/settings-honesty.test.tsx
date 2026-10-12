/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { LearningSettings, OnboardingSettings } from '@/lib/admin/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/components/admin/admin-toast', () => ({ useAdminToast: () => ({ toast: vi.fn() }) }))

import { LearningSettingsSection } from '@/components/admin/LearningSettingsSection'
import { OnboardingSettingsSection } from '@/components/admin/OnboardingSettingsSection'
import { SettingsWorkspace, type SettingsDataMap } from '@/components/admin/SettingsWorkspace'

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

describe('LearningSettingsSection XP inputs', () => {
  /** Holds the section state the way SettingsWorkspace does, and records what would be saved. */
  function Harness({ onChange, onSave }: { onChange: (p: Partial<LearningSettings>) => void; onSave: () => void }) {
    const [data, setData] = React.useState<LearningSettings>({ ...learning, xpFormVersion: 2 } as LearningSettings)
    const [dirty, setDirty] = React.useState(false)
    return (
      <>
        <LearningSettingsSection
          {...commonProps}
          data={data}
          initialData={learning}
          isDirty={dirty}
          onSave={onSave}
          onReset={() => {
            setData({ ...learning, xpFormVersion: 2 } as LearningSettings)
            setDirty(false)
          }}
          onChange={(partial) => {
            onChange(partial)
            setData((prev) => ({ ...prev, ...partial }))
            setDirty(true)
          }}
        />
        <output data-testid="state">{JSON.stringify(data)}</output>
      </>
    )
  }

  const onChange = vi.fn()
  const onSave = vi.fn()
  const input = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement
  const button = (text: string) =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement
  const state = () => JSON.parse(container.querySelector('[data-testid="state"]')!.textContent!) as Record<string, number>
  const type = (el: HTMLInputElement, text: string) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(el, text)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  beforeEach(() => {
    onChange.mockReset()
    onSave.mockReset()
    act(() => root.render(<Harness onChange={onChange} onSave={onSave} />))
  })

  it('names every XP input', () => {
    const names = Array.from(container.querySelectorAll('input')).map((el) => el.getAttribute('aria-label'))
    expect(names).toHaveLength(8)
    expect(names).toContain('XP for reading a lesson')
    expect(names).toContain('XP per Referral')
    expect(names.every(Boolean)).toBe(true)
  })

  it('a cleared input is not sent as 0: it shows an error and blocks the save', () => {
    const lesson = input('XP for reading a lesson')
    type(lesson, '20')
    expect(onChange).toHaveBeenLastCalledWith({ xpPerLessonComplete: 20 })
    expect(button('Save Changes').disabled).toBe(false)

    onChange.mockClear()
    type(lesson, '')
    expect(onChange).not.toHaveBeenCalled()
    expect(state().xpPerLessonComplete).toBe(20)
    // The box keeps what was typed (nothing), not a 0 that looks like a saved value.
    expect(lesson.value).toBe('')
    expect(lesson.getAttribute('aria-invalid')).toBe('true')
    const error = document.getElementById(lesson.getAttribute('aria-describedby')!.split(' ').at(-1)!)
    expect(error?.textContent).toBe(`Enter a whole number from 1 to ${(10000).toLocaleString()}.`)
    expect(button('Save Changes').disabled).toBe(true)
    expect(container.textContent).toContain('Fix the highlighted XP values to save.')

    type(lesson, '15')
    expect(onChange).toHaveBeenLastCalledWith({ xpPerLessonComplete: 15 })
    expect(lesson.getAttribute('aria-invalid')).toBe('false')
    expect(button('Save Changes').disabled).toBe(false)
  })

  it.each(['0', '10001', '1.5', '-3'])('rejects %s where the server would keep the old value', (text) => {
    const referral = input('XP per Referral')
    type(referral, text)
    expect(onChange).not.toHaveBeenCalled()
    expect(referral.getAttribute('aria-invalid')).toBe('true')
    expect(button('Save Changes').disabled).toBe(true)
  })

  it('accepts the bounds, and 0 only for the perfect quiz bonus', () => {
    type(input('Perfect quiz bonus'), '0')
    expect(onChange).toHaveBeenLastCalledWith({ xpQuizPerfectBonus: 0 })
    type(input('XP per capstone submitted'), '10000')
    expect(onChange).toHaveBeenLastCalledWith({ xpPerCapstoneSubmitted: 10000 })
    type(input('Daily streak XP'), '1')
    expect(onChange).toHaveBeenLastCalledWith({ xpStreakBaseReward: 1 })
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(button('Save Changes').disabled).toBe(false)
  })

  it('never touches the xpFormVersion token the form echoes back', () => {
    type(input('XP per Reflection'), '30')
    type(input('XP per Reflection'), '')
    expect(onChange.mock.calls.every(([partial]) => !('xpFormVersion' in partial))).toBe(true)
    expect(state().xpFormVersion).toBe(2)
  })

  it('Reset clears an invalid box even when nothing else changed', () => {
    const quiz = input('XP per correct quiz answer')
    type(quiz, '')
    expect(button('Reset').disabled).toBe(false)
    act(() => button('Reset').click())
    expect(quiz.value).toBe('5')
    expect(quiz.getAttribute('aria-invalid')).toBe('false')
    expect(button('Reset').disabled).toBe(true)
  })
})

describe('SettingsWorkspace when a section could not be read', () => {
  // Placeholder defaults, as the server sends for a section it failed to read.
  const data = {
    product: {},
    learning,
    email: {},
    notifications: {},
    onboarding: { enabled: true },
    'feature-flags': [],
  } as unknown as SettingsDataMap

  it('shows an error with a retry instead of an editable form of defaults', () => {
    act(() => {
      root.render(<SettingsWorkspace initialSection="learning" initialData={data} failedSections={['learning']} />)
    })
    const alert = container.querySelector('[role="alert"][data-testid="settings-load-failed"]')
    expect(alert).not.toBeNull()
    expect(alert!.textContent).toContain('could not be loaded')
    expect(alert!.textContent).toContain('Try again')
    expect(container.querySelectorAll('input').length).toBe(0)
    expect(container.textContent).not.toContain('Save Changes')
  })

  it('renders the form for a section that was read', () => {
    act(() => {
      root.render(<SettingsWorkspace initialSection="learning" initialData={data} failedSections={['product']} />)
    })
    expect(container.querySelector('[data-testid="settings-load-failed"]')).toBeNull()
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
