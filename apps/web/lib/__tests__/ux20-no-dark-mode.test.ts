import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOKENS } from '../../theme/tokens'

/**
 * UX-20 (owner decision D9): dark mode is removed, not finished.
 * Nothing switches it on, so the `.dark` tokens and `dark:` classes were dead
 * weight. This guard keeps them from coming back.
 */

const WEB_ROOT = path.resolve(import.meta.dirname, '../..')
const SCANNED_DIRS = ['app', 'components', 'blocks', 'renderer']

function listTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listTsxFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('UX-20: no dark mode', () => {
  it('globals.css has no .dark selector or dark custom variant', () => {
    const css = fs.readFileSync(path.join(WEB_ROOT, 'app/globals.css'), 'utf8')
    expect(css).not.toMatch(/\.dark\b/)
    expect(css).not.toMatch(/@custom-variant\s+dark\b/)
  })

  it('theme tokens have no dark palette', () => {
    expect(Object.keys(TOKENS.colors)).not.toContain('dark')
    const source = fs.readFileSync(path.join(WEB_ROOT, 'theme/tokens.ts'), 'utf8')
    expect(source).not.toMatch(/^\s*dark\s*:/m)
  })

  it('no .tsx file under app, components, blocks or renderer uses a dark: class', () => {
    const files = SCANNED_DIRS.flatMap((d) => listTsxFiles(path.join(WEB_ROOT, d)))
    expect(files.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
      lines.forEach((line, i) => {
        if (/(^|[\s"'`:{(])dark:/.test(line)) {
          offenders.push(`${path.relative(WEB_ROOT, file)}:${i + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})
