/**
 * Client lesson payload (performance plan item 1).
 *
 * The compiled lesson on disk carries fields the browser never reads: the Mermaid source,
 * its normalized form and author theme (diagrams are pre-rendered to `svg` at compile time),
 * the legacy `staticSvg` duplicate of `svg`, the search text (`searchable`) and the
 * authoring path (`sourceFile`). Passing the full object to a client component serializes
 * all of it into the RSC payload, so the lesson page strips them here first.
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

/** Top-level lesson keys removed before the lesson reaches the browser. */
export const LESSON_SERVER_ONLY_KEYS: readonly string[] = ['sourceFile', 'searchable']

function stripValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripValue)
  if (value === null || typeof value !== 'object') return value

  const input = value as Record<string, unknown>
  const isMermaid = input.type === 'mermaid'
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(input)) {
    if (isMermaid && MERMAID_SERVER_ONLY_KEYS.includes(key)) continue
    out[key] = stripValue(input[key])
  }
  return out
}

/**
 * Deep-copies `lesson` without the server-only fields. Mermaid blocks are matched by
 * `type === 'mermaid'` at any depth (top level, `children`, `diagram`), so a `source`
 * field on some other block type is left alone.
 */
export function toClientLesson(lesson: CompiledLesson): ClientLesson {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(lesson)) {
    if (LESSON_SERVER_ONLY_KEYS.includes(key)) continue
    out[key] = stripValue((lesson as unknown as Record<string, unknown>)[key])
  }
  return out as unknown as ClientLesson
}
