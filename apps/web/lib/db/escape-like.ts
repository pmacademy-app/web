/**
 * Escapes user input for an exact LIKE/ILIKE lookup (`.ilike(column, escapeLike(value))`).
 *
 * In LIKE, `%` and `_` are wildcards and `\` is the escape character, so unescaped
 * input turns an exact lookup into a pattern search: `/verify/%` matched every
 * certificate, and a username `john_doe` also matched `johnxdoe`. PostgREST also
 * rewrites `*` to `%` in like/ilike values and a backslash does not stop that, so
 * `*` becomes a space, which no username, email or certificate code contains.
 *
 * Same rules as `escapeIlikeTerm` in `lib/admin/search-filter.ts`, which builds the
 * quoted `.or()` substring filters for admin search.
 */
export function escapeLike(value: string): string {
  return value.replace(/\*/g, ' ').replace(/[\\%_]/g, (char) => `\\${char}`)
}
