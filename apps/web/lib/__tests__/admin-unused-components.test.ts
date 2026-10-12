import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { ADMIN_NAV } from '@/lib/admin/navigation'

/**
 * Admin R6 C7 — keep components/admin free of dead files and the nav free of duplicates.
 *
 * A file in components/admin counts as used when some non-test source file under app/,
 * components/ or lib/ imports it by module path (with or without the extension).
 */

const WEB_ROOT = path.resolve(import.meta.dirname, '../..')
const ADMIN_DIR = path.join(WEB_ROOT, 'components/admin')
const SOURCE_DIRS = ['app', 'components', 'lib'].map((d) => path.join(WEB_ROOT, d))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g

/** Resolves every relative or `@/` import in the source tree to an absolute path without extension. */
function importedModules(): Set<string> {
  const resolved = new Set<string>()
  for (const file of SOURCE_DIRS.flatMap(walk)) {
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(IMPORT_RE)) {
      const spec = match[1]
      let target: string | null = null
      if (spec.startsWith('@/')) target = path.join(WEB_ROOT, spec.slice(2))
      else if (spec.startsWith('.')) target = path.resolve(path.dirname(file), spec)
      if (!target) continue
      const normalized = target.replace(/\.(ts|tsx)$/, '')
      resolved.add(normalized)
      resolved.add(path.join(normalized, 'index'))
    }
  }
  return resolved
}

describe('admin R6 C7 cleanup', () => {
  it('every file in components/admin is imported somewhere', () => {
    const imported = importedModules()
    const unused = walk(ADMIN_DIR)
      .filter((file) => !imported.has(file.replace(/\.(ts|tsx)$/, '')))
      .map((file) => path.relative(WEB_ROOT, file).split(path.sep).join('/'))
    expect(unused).toEqual([])
  })

  it('the admin nav has no duplicate hrefs', () => {
    const hrefs = ADMIN_NAV.flatMap((group) => group.items.map((item) => item.href))
    const duplicates = hrefs.filter((href, i) => hrefs.indexOf(href) !== i)
    expect(duplicates).toEqual([])
  })
})
