import { sanitizeErrorMessage } from './redaction'

/**
 * Safe structured description of a database / PostgREST / RPC error.
 *
 * Supabase's `postgrest-js` rejects with a PLAIN OBJECT — `{ message, code, details,
 * hint }` — not an `Error`. Code that logged `err instanceof Error ? err.message :
 * String(err)` therefore serialized these to the useless string `"[object Object]"`,
 * throwing away the one thing an operator needs (see the `rate_limit.unavailable`
 * incidents, whose `details.detail` was literally `"[object Object]"`).
 *
 * This extracts the fields both `Error` and PostgREST-shaped rejections actually carry,
 * runs each through the shared redaction pass, and drops empties. It never returns
 * secrets, tokens, or raw addresses because every field goes through
 * `sanitizeErrorMessage` first.
 */
export interface DescribedDbError {
  message: string
  code?: string
  details?: string
  hint?: string
}

export function describeDbError(err: unknown): DescribedDbError {
  // Native Error (or subclass): message is the signal; name disambiguates aborts/timeouts.
  if (err instanceof Error) {
    const described: DescribedDbError = { message: sanitizeErrorMessage(err.message || err.name || 'Error') }
    // Some fetch/undici errors also carry a `code` (e.g. 'ECONNRESET').
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && code) described.code = sanitizeErrorMessage(code)
    return described
  }

  // PostgREST / Supabase RPC rejection shape.
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    const described: DescribedDbError = {
      message:
        typeof e.message === 'string' && e.message
          ? sanitizeErrorMessage(e.message)
          : 'Unknown database error',
    }
    if (typeof e.code === 'string' && e.code) described.code = sanitizeErrorMessage(e.code)
    if (typeof e.details === 'string' && e.details) described.details = sanitizeErrorMessage(e.details)
    if (typeof e.hint === 'string' && e.hint) described.hint = sanitizeErrorMessage(e.hint)
    return described
  }

  return { message: sanitizeErrorMessage(String(err)) }
}
