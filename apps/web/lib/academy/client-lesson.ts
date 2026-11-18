/**
 * Client lesson payload (performance plan item 1).
 *
 * The compiled lesson on disk carries fields the browser never reads: the Mermaid source,
 * its normalized form and author theme (diagrams are pre-rendered to `svg` at compile time),
 * the legacy `staticSvg` duplicate of `svg`, the search text (`searchable`) and the
 * authoring path (`sourceFile`). Passing the full object to a client component serializes
 * all of it into the RSC payload, so the lesson page strips them here first.
 *
 * Quiz answers (security): a quiz question reaches the browser with only the keys in
 * QUIZ_QUESTION_CLIENT_KEYS. `correctAnswer` and `explanation` stay on the server and are
 * revealed one question at a time by POST /api/v2/lessons/[lessonId]/quiz/check, after the
 * learner has committed an answer. It is an allowlist, so a key added to the quiz schema
 * later (a hint, a per-option flag) stays server-side until someone adds it here on purpose.
 *
 * Pure and non-mutating: the compiled lesson is cached per request and shared, so this
 * builds new objects and never edits the input.
 */
import type { CompiledLesson } from '@/types'

/** The lesson shape sent to the browser. */
export type ClientLesson = Omit<CompiledLesson, 'sourceFile' | 'searchable'>

/** Keys removed from `mermaid` blocks. `svg` is kept: it is what MermaidBlock renders. */
export const MERMAID_SERVER_ONLY_KEYS: readonly string[] = [
  'staticSvg',
  'source',
  'normalized',
  'authorTheme',
]

/**
 * The only quiz question keys sent to the browser. Every other key on a question, today
 * `correctAnswer` and `explanation`, reveals the answer and is dropped.
 */
export const QUIZ_QUESTION_CLIENT_KEYS: readonly string[] = [
  'id',
  'question',
  'options',
  'difficulty',
  'objectivesTested',
]

/** A quiz question as the browser receives it: no answer and no explanation. */
export interface ClientQuizQuestion {
  id: string
  question: string
  options: string[]
  difficulty?: string
  objectivesTested?: number[]
}

/** Top-level lesson keys removed before the lesson reaches the browser. */
export const LESSON_SERVER_ONLY_KEYS: readonly string[] = ['sourceFile', 'searchable']

/** Copies one quiz question keeping only the allowlisted keys. */
function toClientQuizQuestion(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of QUIZ_QUESTION_CLIENT_KEYS) {
    if (key in input) out[key] = stripValue(input[key])
  }
  return out
}

function stripValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripValue)
  if (value === null || typeof value !== 'object') return value

  const input = value as Record<string, unknown>
  const isMermaid = input.type === 'mermaid'
  const isQuiz = input.type === 'quiz'
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(input)) {
    if (isMermaid && MERMAID_SERVER_ONLY_KEYS.includes(key)) continue
    if (isQuiz && key === 'questions') {
      const questions = input[key]
      out[key] = Array.isArray(questions) ? questions.map(toClientQuizQuestion) : []
      continue
    }
    out[key] = stripValue(input[key])
  }
  return out
}

/**
 * Deep-copies `lesson` without the server-only fields. Mermaid and quiz blocks are matched
 * by `type` at any depth (top level, `children`, `diagram`), so a `source` field on some
 * other block type is left alone.
 *
 * The return type keeps `CompiledBlock` (the renderer takes it), but at runtime every quiz
 * question is a `ClientQuizQuestion`: `correctAnswer` and `explanation` are absent, and
 * QuizBlock gets them only from the check route.
 */
export function toClientLesson(lesson: CompiledLesson): ClientLesson {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(lesson)) {
    if (LESSON_SERVER_ONLY_KEYS.includes(key)) continue
    out[key] = stripValue((lesson as unknown as Record<string, unknown>)[key])
  }
  return out as unknown as ClientLesson
}
