import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import path from 'node:path'

import prodilyPlugin from '../../eslint-rules/no-raw-palette-text.mjs'

const RULE_ID = 'prodily/no-raw-palette-text'

function lint(code: string, filename: string) {
  const linter = new Linter()
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        plugins: { prodily: prodilyPlugin },
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          parserOptions: {
            ecmaFeatures: { jsx: true },
          },
        },
        rules: { [RULE_ID]: 'error' },
      },
    ],
    filename
  )
}

describe('UX-04 / AG-18: ESLint Rule: no-raw-palette-text', () => {
  const componentFile = path.resolve('apps/web/components/feedback/StatusBadge.tsx')
  const appFile = path.resolve('apps/web/app/(app)/dashboard/page.tsx')
  const blockFile = path.resolve('apps/web/blocks/quiz/QuizBlock.tsx')
  const rendererFile = path.resolve('apps/web/renderer/ContentRenderer.tsx')
  const testFile = path.resolve('apps/web/lib/__tests__/sample.test.ts')

  it('rejects raw emerald text color classes', () => {
    const messages = lint('export function Badge() { return <span className="text-emerald-500 font-bold">Active</span>; }', componentFile)
    expect(messages.length).toBe(1)
    expect(messages[0].ruleId).toBe(RULE_ID)
    expect(messages[0].message).toContain('text-emerald-500')
  })

  it('rejects raw amber text color classes', () => {
    const messages = lint('export function Alert() { return <p className="text-amber-400">Warning</p>; }', appFile)
    expect(messages.length).toBe(1)
    expect(messages[0].ruleId).toBe(RULE_ID)
    expect(messages[0].message).toContain('text-amber-400')
  })

  it('rejects raw blue and purple text color classes in template literals', () => {
    const blueMessages = lint('export function View() { return <div className={`px-2 text-blue-500`} />; }', blockFile)
    expect(blueMessages.length).toBe(1)
    expect(blueMessages[0].ruleId).toBe(RULE_ID)

    const purpleMessages = lint('export function AI() { return <div className={`text-purple-400 font-mono`} />; }', rendererFile)
    expect(purpleMessages.length).toBe(1)
    expect(purpleMessages[0].ruleId).toBe(RULE_ID)
  })

  it('accepts semantic token classes', () => {
    const messages = lint(
      'export function Badge() { return <span className="text-success text-warning text-info text-ai text-danger text-ink-muted">Active</span>; }',
      componentFile
    )
    expect(messages.length).toBe(0)
  })

  it('accepts raw background and border classes without text color', () => {
    const messages = lint(
      'export function Chip() { return <div className="bg-emerald-500/10 border-emerald-500/20 bg-amber-500/10" />; }',
      componentFile
    )
    expect(messages.length).toBe(0)
  })

  it('exempts test files', () => {
    const messages = lint('it("renders", () => { const cls = "text-emerald-500"; });', testFile)
    expect(messages.length).toBe(0)
  })
})
