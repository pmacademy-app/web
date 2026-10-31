/**
 * One display scheme for a lesson's place in the curriculum (UX-05): "Module 3 · Lesson 2".
 *
 * The module number is the module's position in curriculum order and the lesson number is
 * the lesson's 1-indexed position inside its own module. The global 1..90 index is kept on
 * the result for URLs and metadata only; learner-facing copy uses the module-local pair.
 *
 * Pure and dependency-free apart from `module-meta`, so server and client code can share it.
 */

import { MODULE_META, getModuleTitle, isModuleSlug } from './module-meta'

/** The fields this module needs from a curriculum entry or compiled lesson. */
export interface LessonPositionLesson {
  id: string
  module: string
  /** Authored order inside the module, used only when the curriculum lacks the lesson. */
  order?: number
}

export interface LessonPositionCurriculum {
  lessons: ReadonlyArray<{ id: string; module: string }>
}

export interface LessonPosition {
  moduleSlug: string
  /** 1-indexed module position in curriculum order. */
  moduleNumber: number
  /** Display title from MODULE_META (D3). */
  moduleTitle: string
  /** 1-indexed position of the lesson inside its module. */
  lessonNumber: number
  /** 1-indexed position across the whole curriculum; for URLs and metadata only. */
  globalNumber: number | null
  /** "Module 3 · Lesson 2" */
  label: string
}

/** Builds the shared "Module N · Lesson M" label from its two numbers. */
export function formatPositionLabel(moduleNumber: number, lessonNumber: number): string {
  return `Module ${moduleNumber} · Lesson ${lessonNumber}`
}

function moduleNumberFor(
  moduleSlug: string,
  curriculum: LessonPositionCurriculum | null | undefined,
): number {
  if (curriculum) {
    const seen: string[] = []
    for (const entry of curriculum.lessons) {
      if (!seen.includes(entry.module)) seen.push(entry.module)
      if (entry.module === moduleSlug) return seen.length
    }
  }
  return isModuleSlug(moduleSlug) ? MODULE_META[moduleSlug].number : 0
}

/** Resolves a lesson's module-local and global position from the curriculum order. */
export function getLessonPosition(
  lesson: LessonPositionLesson,
  curriculum: LessonPositionCurriculum | null | undefined,
): LessonPosition {
  const lessons = curriculum?.lessons ?? []
  const globalIndex = lessons.findIndex((entry) => entry.id === lesson.id)
  const moduleLessons = lessons.filter((entry) => entry.module === lesson.module)
  const localIndex = moduleLessons.findIndex((entry) => entry.id === lesson.id)

  const moduleNumber = moduleNumberFor(lesson.module, curriculum)
  const lessonNumber = localIndex >= 0 ? localIndex + 1 : Math.max(1, lesson.order ?? 1)

  return {
    moduleSlug: lesson.module,
    moduleNumber,
    moduleTitle: getModuleTitle(lesson.module),
    lessonNumber,
    globalNumber: globalIndex >= 0 ? globalIndex + 1 : null,
    label: formatPositionLabel(moduleNumber, lessonNumber),
  }
}

/** "Module 3 · Lesson 2" for a lesson, using module-local numbering. */
export function formatLessonPosition(
  lesson: LessonPositionLesson,
  curriculum: LessonPositionCurriculum | null | undefined,
): string {
  return getLessonPosition(lesson, curriculum).label
}

export interface LessonBreadcrumbLabels {
  /** "Module 3: MVPs, PRDs & UX Design" */
  module: string
  /** "Lesson 2: Product Requirements Document (PRD)" */
  lesson: string
}

/** Breadcrumb labels from an already-resolved position (used by the lesson client shell). */
export function lessonBreadcrumbLabels(
  position: Pick<LessonPosition, 'moduleNumber' | 'moduleTitle' | 'lessonNumber'>,
  lessonTitle: string,
): LessonBreadcrumbLabels {
  return {
    module: `Module ${position.moduleNumber}: ${position.moduleTitle}`,
    lesson: `Lesson ${position.lessonNumber}: ${lessonTitle}`,
  }
}

/** Breadcrumb labels for a lesson, resolved against the curriculum order. */
export function getLessonBreadcrumbLabels(
  lesson: LessonPositionLesson & { title: string },
  curriculum: LessonPositionCurriculum | null | undefined,
): LessonBreadcrumbLabels {
  return lessonBreadcrumbLabels(getLessonPosition(lesson, curriculum), lesson.title)
}
