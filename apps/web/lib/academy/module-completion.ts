import { getLessonIdsForModule, getModuleSlugForLessonId } from '../curriculum-registry'
import { CURRICULUM_MODULE_META } from '../admin/curriculum-meta'
import { getCapstoneForModule as getCapstoneDefinitionForModule } from '@/config/capstones'

export interface CompletedModule {
  slug: string
  name: string
}

/**
 * The capstone that belongs to a curriculum module, if it has one. The module-to-capstone slug
 * mapping (Growth & Metrics -> `metrics`) lives in config/capstones.ts.
 */
export function getCapstoneForModule(moduleSlug: string): { slug: string; title: string } | null {
  const definition = getCapstoneDefinitionForModule(moduleSlug)
  return definition ? { slug: definition.moduleSlug, title: definition.title } : null
}

/** A curriculum module's display name, falling back to its slug. */
export const getModuleTitle = (moduleSlug: string): string =>
  CURRICULUM_MODULE_META[moduleSlug]?.name ?? moduleSlug

/** Every canonical curriculum module (registry aliases excluded). */
export const isCanonicalModuleSlug = (slug: string): boolean =>
  Object.prototype.hasOwnProperty.call(CURRICULUM_MODULE_META, slug) && getLessonIdsForModule(slug).length > 0

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

  return { slug, name: getModuleTitle(slug) }
}
