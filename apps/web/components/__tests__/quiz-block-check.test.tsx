/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Quiz answers are not in the lesson payload (lib/academy/client-lesson.ts). On the learner
// lesson page QuizBlock checks each committed answer with POST .../quiz/check and shows the
// result from the response; offline it reveals nothing and offers a retry; a 429 (already
// checked in this attempt) is "answer saved", not a crash. The final submit carries the
// attempt id and any check receipts, so the server scores each checked question as checked.

import QuizBlock from '@/blocks/quiz/QuizBlock'
import { LessonContextProvider, type QuizAttempt } from '@/contexts/lesson-context'
import type { BlockProps } from '@/renderer/registry'
import type { QuizSubmitProof } from '@/blocks/quiz/check-answer'

const LESSON = 'les_test01'

// As toClientLesson sends them: no correctAnswer, no explanation.
const QUESTIONS = [
  { id: `q-${LESSON}-1`, question: 'Which metric tracks retention?', options: ['Churn', 'Reach', 'Impressions', 'Clicks'] },
  { id: `q-${LESSON}-2`, question: 'Which framework prioritises features?', options: ['RICE', 'SWOT', 'PEST', 'OKR'] },
]

const EXPLANATIONS: Record<string, string> = {
  [`q-${LESSON}-1`]: 'Churn is the inverse of retention.',
  [`q-${LESSON}-2`]: 'RICE scores reach, impact, confidence and effort.',
}

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>
let onQuizComplete: ReturnType<typeof vi.fn<(attempts: QuizAttempt[], proof?: QuizSubmitProof) => Promise<unknown>>>

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** A server that knows option 0 is right for every question and allows one check per key. */
function honestServer() {
  const seen = new Set<string>()
  return async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { questionId: string; answer: number; attemptId: string }
    const key = `${body.attemptId}:${body.questionId}`
    if (seen.has(key)) return jsonResponse(429, { success: false, error: 'Too many requests.', code: 'RATE_LIMITED' })
    seen.add(key)
    return jsonResponse(200, {
      correct: body.answer === 0,
      correctAnswer: 0,
      explanation: EXPLANATIONS[body.questionId],
    })
  }
}

function checkCalls() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit).method,
    body: JSON.parse(String((init as RequestInit).body)) as { questionId: string; answer: number; attemptId: string },
  }))
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
  })
}

function renderQuiz(questions: unknown[] = QUESTIONS) {
  const block = { type: 'quiz', questions } as unknown as BlockProps['block']
  act(() =>
    root.render(
      <LessonContextProvider lessonId={LESSON} onQuizComplete={onQuizComplete}>
        <QuizBlock block={block} lessonId={LESSON} />
      </LessonContextProvider>
    )
  )
}

function buttonByText(text: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text))
  if (!btn) throw new Error(`button "${text}" not found`)
  return btn
}

function radios(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
}

function liveRegion(): HTMLElement {
  return container.querySelector<HTMLElement>('[role="status"][aria-live="polite"]')!
}

async function answer(optionIndex: number) {
  act(() => radios()[optionIndex].click())
  act(() => buttonByText('Confirm Answer').click())
  await flush()
}

beforeEach(() => {
  // Options render in their authored order (the shuffle swaps each item with itself).
  vi.spyOn(Math, 'random').mockReturnValue(0.999)
  fetchMock = vi.fn(honestServer())
  vi.stubGlobal('fetch', fetchMock)
  onQuizComplete = vi.fn<(attempts: QuizAttempt[], proof?: QuizSubmitProof) => Promise<unknown>>(async () => ({ correctCount: 1, totalQuestions: 2, scorePercentage: 50, xpEarned: 10 }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('QuizBlock server answer check', () => {
  it('posts the committed answer to the check route and shows the result from the response', async () => {
    renderQuiz()
    expect(container.textContent).not.toContain(EXPLANATIONS[QUESTIONS[0].id])

    act(() => radios()[2].click())
    act(() => buttonByText('Confirm Answer').click())

    // In flight: nothing revealed, options locked.
    expect(buttonByText('Checking').disabled).toBe(true)
    expect(container.textContent).not.toContain('Incorrect')
    act(() => radios()[0].click())
    expect(radios()[0].getAttribute('aria-checked')).toBe('false')

    await flush()

    const [call] = checkCalls()
    expect(call.url).toBe(`/api/v2/lessons/${LESSON}/quiz/check`)
    expect(call.method).toBe('POST')
    expect(call.body.questionId).toBe(QUESTIONS[0].id)
    expect(call.body.answer).toBe(2)
    expect(call.body.attemptId).toMatch(/^[A-Za-z0-9_-]{8,64}$/)

    expect(container.textContent).toContain('Incorrect')
    expect(container.textContent).toContain(EXPLANATIONS[QUESTIONS[0].id])
    expect(liveRegion().textContent).toBe('Incorrect. The correct answer is Churn.')
    expect(container.textContent).toContain('Next Question')
    expect(container.textContent).toContain('Score: 0 / 2')
  })

  it('uses one attempt id per attempt and a new one after Retry Quiz, then submits the answers', async () => {
    renderQuiz()
    await answer(0)
    expect(container.textContent).toContain('Correct!')
    act(() => buttonByText('Next Question').click())
    await answer(1)
    act(() => buttonByText('Finish Quiz').click())
    await flush()

    expect(onQuizComplete).toHaveBeenCalledTimes(1)
    const submitted = onQuizComplete.mock.calls[0][0] as { question_id: string; selected_option: number }[]
    expect(submitted.map((a) => [a.question_id, a.selected_option])).toEqual([
      [QUESTIONS[0].id, 0],
      [QUESTIONS[1].id, 1],
    ])
    // The summary shows the server's score.
    expect(container.textContent).toContain('You scored 1 out of 2 correct answers')
    expect(container.textContent).toContain('+10 XP')

    act(() => buttonByText('Retry Quiz').click())
    await answer(0)

    const ids = checkCalls().map((c) => c.body.attemptId)
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[0])
    expect(container.textContent).toContain('Correct!')
  })

  it('sends the attempt id and the check receipts with the submit, and starts fresh after Retry Quiz', async () => {
    const honest = honestServer()
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const res = await honest(url, init)
      if (res.status !== 200) return res
      const body = (await res.json()) as Record<string, unknown>
      const sent = JSON.parse(String(init?.body)) as { questionId: string; answer: number }
      return jsonResponse(200, { ...body, receipt: `rcpt-${sent.questionId}-${sent.answer}` })
    })
    renderQuiz()
    await answer(2)
    act(() => buttonByText('Next Question').click())
    await answer(0)
    act(() => buttonByText('Finish Quiz').click())
    await flush()

    const attemptId = checkCalls()[0].body.attemptId
    expect(onQuizComplete).toHaveBeenCalledTimes(1)
    expect(onQuizComplete.mock.calls[0][1]).toEqual({
      attemptId,
      receipts: [`rcpt-${QUESTIONS[0].id}-2`, `rcpt-${QUESTIONS[1].id}-0`],
    })
    // The answer payload is still sent alongside.
    expect(onQuizComplete.mock.calls[0][0].map((a) => a.selected_option)).toEqual([2, 0])

    act(() => buttonByText('Retry Quiz').click())
    await answer(1)
    act(() => buttonByText('Next Question').click())
    await answer(1)
    act(() => buttonByText('Finish Quiz').click())
    await flush()

    const retry = onQuizComplete.mock.calls[1][1] as { attemptId: string; receipts: string[] }
    expect(retry.attemptId).not.toBe(attemptId)
    expect(retry.receipts).toEqual([`rcpt-${QUESTIONS[0].id}-1`, `rcpt-${QUESTIONS[1].id}-1`])
  })

  it('submits no receipts when the server issues none', async () => {
    renderQuiz([QUESTIONS[0]])
    await answer(0)
    act(() => buttonByText('Finish Quiz').click())
    await flush()
    expect(onQuizComplete.mock.calls[0][1]).toEqual({ attemptId: checkCalls()[0].body.attemptId, receipts: [] })
  })

  it('reveals nothing when offline and lets the learner retry', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch')
    })
    renderQuiz()
    await answer(1)

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Check your connection')
    expect(container.textContent).not.toContain(EXPLANATIONS[QUESTIONS[0].id])
    expect(container.textContent).not.toContain('Next Question')
    expect(radios().some((r) => r.disabled)).toBe(false)

    act(() => buttonByText('Try Again').click())
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain(EXPLANATIONS[QUESTIONS[0].id])
  })

  it('treats a 429 as already answered: no reveal, no crash, the answer still counts at submit', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse(429, { success: false, error: 'Too many requests.', code: 'RATE_LIMITED' })
    )
    renderQuiz([QUESTIONS[0]])
    await answer(3)

    expect(container.textContent).toContain('Answer saved')
    expect(container.textContent).not.toContain('Incorrect')
    expect(container.textContent).not.toContain(EXPLANATIONS[QUESTIONS[0].id])
    expect(radios().filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    expect(liveRegion().textContent).toBe('Answer saved. Your score will show at the end.')

    onQuizComplete.mockResolvedValueOnce({ correctCount: 0, totalQuestions: 1, scorePercentage: 0, xpEarned: 0 })
    act(() => buttonByText('Finish Quiz').click())
    await flush()

    expect(onQuizComplete.mock.calls[0][0]).toEqual([
      { question_id: QUESTIONS[0].id, selected_option: 3, is_correct: false },
    ])
    expect(container.textContent).toContain('You scored 0 out of 1 correct answers')
  })

  it('does not call the check route when the answers are already on the page (admin preview)', async () => {
    renderQuiz([{ ...QUESTIONS[0], correctAnswer: 0, explanation: 'Local explanation.' }])
    await answer(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Local explanation.')
  })
})
