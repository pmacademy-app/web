/**
 * Shape checks for the content identifiers that learner write routes accept.
 *
 * SEC-08: a lesson id reaches `path.join(DIST_LESSONS_DIR, ...)` and a flashcard id becomes a
 * `user_flashcard_srs` key, so both are checked here before any file read or database write.
 * These are format checks only. Whether the id names real content is decided by loading it
 * (lessons from content/dist, cards from their lesson's flashcard deck).
 *
 * Pure and framework-agnostic: no fs, no Supabase, safe to import from client code.
 */

/** Stable compiled lesson id, e.g. `les_04ix6b`. Lowercase only, so no `..`, `/` or `\`. */
export const LESSON_ID_PATTERN = /^les_[a-z0-9]{1,32}$/

/** Flashcard id as the compiler emits it: `fc-<lessonId>-<n>`. */
export const FLASHCARD_ID_PATTERN = /^fc-(les_[a-z0-9]{1,32})-(\d{1,4})$/

/** Quiz question id as the compiler emits it: `q-<lessonId>-<n>`. */
export const QUIZ_QUESTION_ID_PATTERN = /^q-(les_[a-z0-9]{1,32})-(\d{1,4})$/

/** Upper bound on answers in one quiz submission. Every lesson ships a 15-question bank. */
export const MAX_QUIZ_ATTEMPTS = 50

export function isLessonIdFormat(value: unknown): value is string {
  return typeof value === 'string' && LESSON_ID_PATTERN.test(value)
}

/**
 * The lesson a flashcard id belongs to, or null when the id is not in the compiler's format.
 * The returned lesson id still has to be loaded to prove the card exists.
 */
export function lessonIdFromFlashcardId(flashcardId: unknown): string | null {
  if (typeof flashcardId !== 'string') return null
  const match = FLASHCARD_ID_PATTERN.exec(flashcardId)
  return match ? match[1] : null
}
