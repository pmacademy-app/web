/**
 * Lesson Loader — Server-side utility for loading v2 compiled lesson data.
 *
 * Reads from content/dist/lessons/ (the output of the v2 AST compiler).
 * Uses React cache() to deduplicate reads within a single render pass.
 *
 * This replaces the ad-hoc fs.promises.readFile calls scattered across
 * the old lesson page and serves as the single authoritative loading path
 * for the /academy/** routes.
 *
 * Reference: rendering-pipeline.md §2.2, content-pipeline.md §5
 */

import path from 'path'
import { readFile } from 'fs/promises'
import { cache } from 'react'
import type { CompiledLesson, CurriculumData, CurriculumEntry } from '@/types'

// Path to the v2 compiler output directory.
// process.cwd() in Next.js = apps/web directory.
// The content/dist/ folder lives at the monorepo root: ../../content/dist
const DIST_DIR = path.resolve(process.cwd(), '..', '..', 'content', 'dist')

/**
 * Fetch a single compiled lesson by its stable ID (les_XXXXXX).
 * Results are cached per render pass via React cache().
 */
export const fetchCompiledLesson = cache(
  async (lessonId: string): Promise<CompiledLesson | null> => {
    // Validate ID format to prevent path traversal
    if (!/^les_[a-z0-9]+$/.test(lessonId)) {
      console.warn(`[lesson-loader] Invalid lessonId format: "${lessonId}"`)
      return null
    }

    const filePath = path.join(DIST_DIR, 'lessons', `${lessonId}.json`)
    try {
      const raw = await readFile(filePath, 'utf-8')
      return JSON.parse(raw) as CompiledLesson
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[lesson-loader] Error reading lesson ${lessonId}:`, err)
      }
      return null
    }
  }
)

/**
 * Fetch the full curriculum data (all 90 lessons minimal metadata).
 * Used by the /academy layout to render the sidebar navigation.
 * Cached per render pass.
 */
export const fetchCurriculumData = cache(async (): Promise<CurriculumData | null> => {
  const filePath = path.join(DIST_DIR, 'curriculum.json')
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as CurriculumData
  } catch (err) {
    console.error('[lesson-loader] Error reading curriculum.json:', err)
    return null
  }
})

/**
 * Look up a single lesson's curriculum entry by its stable ID.
 * Returns null if not found.
 */
export async function getLessonMeta(lessonId: string): Promise<CurriculumEntry | null> {
  const curriculum = await fetchCurriculumData()
  if (!curriculum) return null
  return curriculum.lessons.find((l) => l.id === lessonId) ?? null
}

/**
 * Resolve a legacy numeric slug (e.g. "lesson-001") to a stable lessonId
 * by reading the lesson-id-registry.json. Used for 301 redirects and
 * backward compatibility in the v1 lesson route.
 */
export async function resolveSlugToId(slug: string): Promise<string | null> {
  const registryPath = path.resolve(
    process.cwd(),
    '..', '..', 'content', '.ids', 'lesson-id-registry.json'
  )
  try {
    const raw = await readFile(registryPath, 'utf-8')
    const registry = JSON.parse(raw) as Record<string, string>
    // Registry keys are e.g. "content/lessons/lesson-001.md"
    const key = `content/lessons/${slug}.md`
    return registry[key] ?? null
  } catch (err) {
    console.error('[lesson-loader] Error reading lesson-id-registry.json:', err)
    return null
  }
}

/**
 * Get the previous and next lesson IDs from the curriculum order.
 * Returns { prevId, nextId } — either may be null for first/last lessons.
 */
export async function getAdjacentLessons(
  lessonId: string
): Promise<{ prevId: string | null; nextId: string | null }> {
  const curriculum = await fetchCurriculumData()
  if (!curriculum) return { prevId: null, nextId: null }

  const idx = curriculum.lessons.findIndex((l) => l.id === lessonId)
  if (idx === -1) return { prevId: null, nextId: null }

  return {
    prevId: idx > 0 ? curriculum.lessons[idx - 1].id : null,
    nextId: idx < curriculum.lessons.length - 1 ? curriculum.lessons[idx + 1].id : null,
  }
}
