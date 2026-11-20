/**
 * Client-safe helper for routes that must read their own body instead of declaring
 * `body:` on `withRoute` (a limiter that has to run first, an optional body, a
 * multipart branch). It applies the same schema check the wrapper would and returns
 * a message the route raises as `RouteError(400, 'VALIDATION', ...)`.
 *
 * No server imports, so contract files stay safe to import from the browser.
 */
import type { z } from 'zod'

export const BODY_OBJECT_EXPECTED = 'Invalid request body. JSON object expected.'

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; message: string }

/**
 * Validates an already-read JSON value. A non-object (null from a failed parse, an
 * array, a string) gets the wrapper's own copy rather than a zod type message.
 */
export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): ParsedBody<T> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: BODY_OBJECT_EXPECTED }
  }
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  return { ok: false, message: parsed.error.issues[0]?.message || 'Invalid request body.' }
}
