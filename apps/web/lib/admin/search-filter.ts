/**
 * Search-term escaping for PostgREST `or(...)` filters, shared by the admin list services
 * (users, email queue, in-app broadcasts, moderation). A term interpolated straight into
 * the filter string can add conditions of its own (`a,is_admin.eq.true`); everything that
 * searches by a typed term goes through `buildIlikeOrFilter` instead.
 */

/**
 * Makes a search term safe to embed in a PostgREST `ilike` pattern. Escapes the LIKE
 * wildcards (`%`, `_`) and the escape character so they match literally, and replaces
 * `*` with a space: PostgREST rewrites `*` to `%` in like/ilike values, and a
 * backslash does not stop that, so it cannot be matched literally.
 */
export function escapeIlikeTerm(term: string): string {
  return term.replace(/\*/g, ' ').replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Longest search term accepted; anything longer is truncated before it reaches the query. */
const MAX_SEARCH_LENGTH = 100

/**
 * Builds a PostgREST `or` filter matching `term` as a case-insensitive substring of any
 * column. The pattern is double-quoted so commas, parentheses and dots in the term are
 * not parsed as filter syntax; inside the quotes `\` and `"` are backslash-escaped.
 */
export function buildIlikeOrFilter(columns: readonly string[], term: string): string {
  const pattern = `%${escapeIlikeTerm(term.trim().slice(0, MAX_SEARCH_LENGTH))}%`
  const quoted = `"${pattern.replace(/[\\"]/g, (char) => `\\${char}`)}"`
  return columns.map((column) => `${column}.ilike.${quoted}`).join(',')
}
