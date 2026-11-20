import { LESSON_SLUGS } from './lesson-slugs.generated'

/**
 * Readable lesson URLs: /academy/<module>/<slug-from-the-title>.
 *
 * The les_xxxxxx ID stays the lesson's identity everywhere else (progress, flashcards,
 * quizzes). Only the address uses the title slug. Old /academy/<module>/les_xxxxxx links
 * keep working: the lesson page resolves either form and redirects to the slug.
 *
 * The slug map is written by the content compiler (scripts/compiler) from each lesson's
 * title and checked by a test against content/dist, so it cannot drift from the content.
 */

const ID_PATTERN = /^les_[a-z0-9]+$/

/** "What is Product Management?" -> "what-is-product-management" */
export function slugifyLessonTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const ID_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(LESSON_SLUGS).map(([id, slug]) => [slug, id]),
)

/** The address segment for a lesson: its title slug, or the ID if the map has no entry. */
export function lessonSlug(id: string): string {
  return LESSON_SLUGS[id] ?? id
}

/** In-app lesson path, e.g. /academy/foundations/what-is-product-management */
export function lessonPath(module: string, id: string): string {
  return `/academy/${module}/${lessonSlug(id)}`
}

/** Resolves the URL segment (a title slug or a les_ ID) to the lesson ID, or null. */
export function lessonIdFromSegment(segment: string): string | null {
  const s = decodeURIComponent(segment).toLowerCase()
  if (ID_PATTERN.test(s)) return s
  return ID_BY_SLUG[s] ?? null
}
