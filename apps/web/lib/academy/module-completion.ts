import { getLessonIdsForModule, getModuleSlugForLessonId } from '../curriculum-registry'
import { CURRICULUM_MODULE_META } from '../admin/curriculum-meta'

export interface CompletedModule {
  slug: string
  name: string
}

/** Stable event id: one `module.completed` per learner per module, however often it is re-sent. */
export const moduleCompletedEventId = (userId: string, moduleSlug: string) =>
  `module-completed-${userId}-${moduleSlug}`

/**
 * The module that `lessonId` just finished, if it was the last open lesson in that module.
 *
 * Called right after `lessonId` was completed for the first time. A module is complete when
 * every one of its registry lessons is in `completedLessonIds`, in whatever order they were
 * done. Registry aliases (`tech_ai`, `platform`, `advanced_strategy`) resolve to their
 * canonical slug because `getModuleSlugForLessonId` returns the first matching key.
 */
export function findNewlyCompletedModule(
  lessonId: string,
  completedLessonIds: ReadonlySet<string>,
): CompletedModule | null {
  const slug = getModuleSlugForLessonId(lessonId)
  if (!slug) return null

  const moduleLessonIds = getLessonIdsForModule(slug)
  if (moduleLessonIds.length === 0) return null
  if (!moduleLessonIds.every((id) => completedLessonIds.has(id))) return null

  return { slug, name: CURRICULUM_MODULE_META[slug]?.name ?? slug }
}
