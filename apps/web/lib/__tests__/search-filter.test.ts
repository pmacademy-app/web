import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Search boxes build a PostgREST `or` filter from a typed term (lib/db/search-filter.ts, used
 * by the in-app broadcast list here and by the admin console's list services). The term
 * must stay one quoted value: a comma, quote or parenthesis in it must never become a
 * second condition (`a,is_admin.eq.true`) or close the group.
 */

import { buildIlikeOrFilter, escapeIlikeTerm } from '@/lib/db/search-filter'

const INJECTIONS = ['a",id.neq."', 'a,is_admin.eq.true', '\\', '%', '_', '*', '(x)']

/** Splits an `or` filter on the commas PostgREST would: those outside a double-quoted value. */
function conditions(filter: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < filter.length; i++) {
    const char = filter[i]
    if (quoted && char === '\\') {
      current += char + filter[++i]
      continue
    }
    if (char === '"') quoted = !quoted
    if (char === ',' && !quoted) {
      out.push(current)
      current = ''
      continue
    }
    current += char
  }
  expect(quoted, `unterminated quote in ${filter}`).toBe(false)
  out.push(current)
  return out
}

/** The LIKE pattern a quoted PostgREST value decodes to. */
function unquote(value: string): string {
  expect(value.startsWith('"') && value.endsWith('"')).toBe(true)
  return value.slice(1, -1).replace(/\\(.)/g, '$1')
}

describe('buildIlikeOrFilter', () => {
  it.each(INJECTIONS)('keeps %j inside one quoted value per column', (term) => {
    const columns = ['name', 'email', 'username']
    const parts = conditions(buildIlikeOrFilter(columns, term))

    expect(parts).toHaveLength(columns.length)
    parts.forEach((part, i) => {
      const prefix = `${columns[i]}.ilike.`
      expect(part.startsWith(prefix)).toBe(true)
      const pattern = unquote(part.slice(prefix.length))
      // The decoded pattern is %<term with LIKE wildcards escaped>%, nothing else.
      expect(pattern).toBe(`%${escapeIlikeTerm(term)}%`)
      // PostgREST would turn a bare * into %.
      expect(pattern).not.toContain('*')
    })
  })

  it('matches LIKE wildcards and the escape character literally', () => {
    expect(escapeIlikeTerm('%')).toBe('\\%')
    expect(escapeIlikeTerm('_')).toBe('\\_')
    expect(escapeIlikeTerm('\\')).toBe('\\\\')
    expect(escapeIlikeTerm('*')).toBe(' ')
  })
})

describe('search callers', () => {
  it.each([
    ['lib/broadcasts/in-app-manager-service.ts', "buildIlikeOrFilter(['title', 'body']"],
  ])('%s builds its search filter with the shared helper', (file, call) => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8')
    expect(source).toContain(call)
    // No search term interpolated straight into an ilike pattern.
    expect(source).not.toMatch(/ilike\.%\$\{/)
  })
})
