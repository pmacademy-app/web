/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// UX-02: quiz shortcuts are scoped to the quiz container. Enter / Space elsewhere on the
// page must not confirm an answer or be swallowed, a focused button must not fire twice,
// and the result of each confirmed answer is announced through a polite live region.

import QuizBlock from '@/blocks/quiz/QuizBlock'
import type { BlockProps } from '@/renderer/registry'

let container: HTMLDivElement
let root: Root

const QUESTIONS = [
  {
    id: 'q1',
    question: 'Which metric tracks retention?',
    options: ['Churn', 'Reach', 'Impressions', 'Clicks'],
    correctAnswer: 0,
    explanation: 'Churn is the inverse of retention.',
  },
  {
    id: 'q2',
    question: 'Which framework prioritises features?',
    options: ['RICE', 'SWOT', 'PEST', 'OKR'],
    correctAnswer: 0,
    explanation: 'RICE scores reach, impact, confidence and effort.',
  },
]

function renderQuiz(questions = QUESTIONS) {
  const block = { type: 'quiz', questions } as unknown as BlockProps['block']
  act(() => root.render(<QuizBlock block={block} lessonId="lesson-1" />))
}

function quizRoot(): HTMLElement {
  const el = container.querySelector<HTMLElement>('[role="group"][aria-label="Lesson Quiz"]')
  if (!el) throw new Error('quiz root not rendered')
  return el
}

function liveRegion(): HTMLElement {
  const el = quizRoot().querySelector<HTMLElement>('[role="status"][aria-live="polite"]')
  if (!el) throw new Error('live region not rendered')
  return el
}

function buttonByText(text: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  )
  if (!btn) throw new Error(`button "${text}" not found`)
  return btn
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

function radios(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
}

function questionText(): HTMLElement {
  const el = Array.from(container.querySelectorAll<HTMLElement>('[tabindex="-1"]')).find(
    (node) => node !== quizRoot() && node.getAttribute('role') !== 'radio',
  )
  if (!el) throw new Error('question text not rendered')
  return el
}

function selectedRadio(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
}

beforeEach(() => {
  // A random value just under 1 makes the Fisher-Yates shuffle swap each item with
  // itself, so options render in their authored order.
  vi.spyOn(Math, 'random').mockReturnValue(0.999)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('QuizBlock keyboard scope', () => {
  it('ignores Enter pressed on the window outside the quiz', () => {
    renderQuiz()
    press(quizRoot(), '1')
    expect(selectedRadio()?.textContent).toContain('Churn')

    const event = press(window, 'Enter')

    expect(event.defaultPrevented).toBe(false)
    expect(container.textContent).toContain('Confirm Answer')
    expect(liveRegion().textContent).toBe('')
  })

  it('ignores Enter on a link outside the quiz', () => {
    renderQuiz()
    press(quizRoot(), '1')
    const link = document.createElement('a')
    link.href = '#elsewhere'
    link.textContent = 'Elsewhere'
    document.body.appendChild(link)

    const event = press(link, 'Enter')

    expect(event.defaultPrevented).toBe(false)
    expect(container.textContent).toContain('Confirm Answer')
  })

  it('ignores digits pressed outside the quiz', () => {
    renderQuiz()
    press(document.body, '2')
    expect(selectedRadio()).toBeNull()
  })

  it('selects with a digit and confirms with Enter on the quiz container', () => {
    renderQuiz()
    const quiz = quizRoot()
    act(() => quiz.focus())

    press(quiz, '1')
    const event = press(quiz, 'Enter')

    expect(event.defaultPrevented).toBe(true)
    expect(container.textContent).toContain('Next Question')
    expect(liveRegion().textContent).toBe('Correct')
  })

  it('moves the selection with arrow keys inside the quiz', () => {
    renderQuiz()
    const quiz = quizRoot()

    press(quiz, 'ArrowDown')
    expect(selectedRadio()?.textContent).toContain('Churn')
    press(quiz, 'ArrowDown')
    expect(selectedRadio()?.textContent).toContain('Reach')
    press(quiz, 'ArrowUp')
    expect(selectedRadio()?.textContent).toContain('Churn')
  })

  it('lets a focused Confirm button handle Enter natively so it fires once', () => {
    renderQuiz()
    press(quizRoot(), '2')
    const confirm = buttonByText('Confirm Answer')

    // The container handler must leave Enter on a button alone.
    const event = press(confirm, 'Enter')
    expect(event.defaultPrevented).toBe(false)
    expect(container.textContent).toContain('Confirm Answer')

    // The browser then activates the button once with a click.
    act(() => confirm.click())

    expect(container.textContent).toContain('Question 1 of 2')
    expect(container.textContent).toContain('Next Question')
  })

  it('does not swallow Space on a focused option button', () => {
    renderQuiz()
    const option = container.querySelector<HTMLElement>('[role="radio"]')!
    const event = press(option, ' ')
    expect(event.defaultPrevented).toBe(false)
  })

  it('announces an incorrect answer with the correct option text', () => {
    renderQuiz()
    const quiz = quizRoot()
    expect(liveRegion().textContent).toBe('')

    press(quiz, '3')
    press(quiz, 'Enter')

    expect(liveRegion().textContent).toBe('Incorrect. The correct answer is Churn.')
  })

  it('clears the announcement and keeps focus in the quiz when advancing', () => {
    renderQuiz()
    const quiz = quizRoot()
    press(quiz, '1')
    act(() => buttonByText('Confirm Answer').click())
    const next = buttonByText('Next Question')
    act(() => next.focus())

    act(() => next.click())

    expect(container.textContent).toContain('Question 2 of 2')
    expect(liveRegion().textContent).toBe('')
    expect(document.activeElement).toBe(questionText())
    expect(questionText().textContent).toContain('Which framework prioritises features?')
  })

  it('keeps the live region text free of em-dashes', () => {
    renderQuiz()
    press(quizRoot(), '4')
    press(quizRoot(), 'Enter')
    expect(liveRegion().textContent).not.toContain(String.fromCharCode(0x2014))
  })

  it('uses a roving tabindex on the options', () => {
    renderQuiz()
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1, -1])

    press(quizRoot(), '3')

    expect(radios().map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1])
  })

  it('moves focus along with the selection for digits and arrows', () => {
    renderQuiz()
    press(quizRoot(), '2')
    expect(document.activeElement).toBe(radios()[1])

    const event = press(document.activeElement!, 'ArrowDown')
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(radios()[2])
    expect(selectedRadio()).toBe(radios()[2])
  })

  it('confirms the option reached by arrow, not the one focused earlier', () => {
    renderQuiz()
    const [optionA, optionB] = radios()
    act(() => optionA.focus())

    press(optionA, 'ArrowDown')
    expect(document.activeElement).toBe(optionB)

    const enter = press(document.activeElement!, 'Enter')

    expect(enter.defaultPrevented).toBe(true)
    expect(liveRegion().textContent).toBe('Incorrect. The correct answer is Churn.')
    // B was the confirmed choice: A (Churn) is the correct answer, so B is announced as wrong.
    expect(container.textContent).toContain('Next Question')
    expect(document.activeElement).toBe(buttonByText('Next Question'))
  })

  it('selects a focused option on Enter when it is not yet the selected one', () => {
    renderQuiz()
    press(quizRoot(), '1')
    const optionC = radios()[2]
    act(() => optionC.focus())

    press(optionC, 'Enter')

    expect(selectedRadio()).toBe(optionC)
    expect(container.textContent).toContain('Confirm Answer')
  })

  it('ignores shortcuts while a modifier key is held', () => {
    renderQuiz()
    press(quizRoot(), '1', { ctrlKey: true })
    press(quizRoot(), '2', { metaKey: true })
    press(quizRoot(), 'ArrowDown', { altKey: true })
    expect(selectedRadio()).toBeNull()
  })

  it('ignores auto-repeated Enter so a held key does not skip the result', () => {
    renderQuiz()
    press(quizRoot(), '1')
    press(quizRoot(), 'Enter')
    expect(container.textContent).toContain('Next Question')

    press(quizRoot(), 'Enter', { repeat: true })

    expect(container.textContent).toContain('Question 1 of 2')
    expect(container.textContent).toContain('Next Question')
  })

  it('moves focus to the summary heading and exposes the score when the quiz finishes', () => {
    renderQuiz([QUESTIONS[0]])
    press(quizRoot(), '1')
    act(() => buttonByText('Confirm Answer').click())
    const finish = buttonByText('Finish Quiz')
    act(() => finish.focus())

    act(() => finish.click())

    const heading = container.querySelector<HTMLElement>('h2')
    expect(heading?.textContent).toBe('Flawless Victory!')
    expect(document.activeElement).toBe(heading)
    const describedBy = heading?.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const score = document.getElementById(describedBy!)
    expect(score?.getAttribute('role')).toBe('status')
    expect(score?.textContent).toContain('You scored 1 out of 1 correct answers (100%).')
  })

  it('returns focus to the question after Retry Quiz', () => {
    renderQuiz([QUESTIONS[0]])
    press(quizRoot(), '1')
    act(() => buttonByText('Confirm Answer').click())
    act(() => buttonByText('Finish Quiz').click())

    act(() => buttonByText('Retry Quiz').click())

    expect(document.activeElement).toBe(questionText())
    expect(questionText().textContent).toContain('Which metric tracks retention?')
  })
})
