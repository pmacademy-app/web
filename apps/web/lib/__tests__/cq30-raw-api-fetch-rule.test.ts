import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import path from 'node:path'

import prodilyPlugin from '../../eslint-rules/no-raw-api-fetch.mjs'

const RULE_ID = 'prodily/no-raw-api-fetch'

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

describe('CQ-30: ESLint Rule: no-raw-api-fetch', () => {
  const componentFile = path.resolve('apps/web/components/feedback/FeedbackModal.tsx')
  const appFile = path.resolve('apps/web/app/(app)/capstones/page.tsx')
  const clientFile = path.resolve('apps/web/lib/api/client.ts')
  const testFile = path.resolve('apps/web/lib/__tests__/some-endpoint.test.ts')

  it('rejects raw string fetch to /api in components', () => {
    const messages = lint('export async function load() { await fetch("/api/notifications"); }', componentFile)
    expect(messages.length).toBe(1)
    expect(messages[0].ruleId).toBe(RULE_ID)
    expect(messages[0].message).toContain('Raw fetch to /api is banned')
  })

  it('rejects raw template literal fetch to /api in app routes', () => {
    const messages = lint('export async function load(id) { await fetch(`/api/user/${id}`); }', appFile)
    expect(messages.length).toBe(1)
    expect(messages[0].ruleId).toBe(RULE_ID)
  })

  it('accepts typed client calls (apiGet, apiPost)', () => {
    const messages = lint('export async function load() { await apiGet("/api/notifications"); }', componentFile)
    expect(messages.length).toBe(0)
  })

  it('accepts fetch calls to external URLs or non-/api paths', () => {
    const external = lint('export async function load() { await fetch("https://example.com/api/test"); }', componentFile)
    expect(external.length).toBe(0)

    const nonApi = lint('export async function load() { await fetch("/static/data.json"); }', componentFile)
    expect(nonApi.length).toBe(0)
  })

  it('exempts lib/api/client.ts', () => {
    const messages = lint('export async function call() { await fetch("/api/test"); }', clientFile)
    expect(messages.length).toBe(0)
  })

  it('exempts test files', () => {
    const messages = lint('it("calls api", async () => { await fetch("/api/test"); });', testFile)
    expect(messages.length).toBe(0)
  })
})
