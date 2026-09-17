import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import prodily from '../../eslint-rules/require-with-route.mjs'

/**
 * B7-H — the wrapper is enforced, not merely adopted.
 *
 * B7-C…G2 migrated every route; this batch is what keeps them migrated. Two
 * separate things have to hold and both are asserted here:
 *
 *   1. the lint rule actually rejects a raw handler — a rule that only ever sees a
 *      compliant tree proves nothing, so the cases below are linted directly;
 *   2. the repository's own inventory is exactly what the exemption list says it
 *      is, so a route cannot be added to the allowlist without that showing up.
 *
 * This suite owns the global inventory. Earlier waves assert only their own scope
 * and deliberately no longer count the total.
 */

const API_DIR = path.resolve(import.meta.dirname, '../../app/api')
const RULE_ID = 'prodily/require-with-route'

/**
 * The complete exemption list, mirrored from `eslint.config.mjs`.
 *
 * Duplicated on purpose. A test that imported the config would pass whatever the
 * config happened to say, including a fourth entry someone added quietly; this
 * copy means adding an exemption requires editing two files and reading this note.
 */
const EXEMPT = [
  'auth/callback/route.ts',
  'auth/send-email-hook/route.ts',
  'email/webhooks/route.ts',
]

function lint(code: string, filename: string, allow: string[] = EXEMPT) {
  const linter = new Linter()
  return linter.verify(code, [
    {
      // The snippets are plain ESM; the rule reads structure that TypeScript
      // syntax does not change, so the default parser is enough and the test
      // stays independent of the project's parser configuration.
      files: ['**/*.ts'],
      plugins: { prodily },
      languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
      rules: { [RULE_ID]: ['error', { allow }] },
    },
  ], filename)
}

const ROUTE_FILE = path.join(API_DIR, 'probe', 'route.ts')

// ─── The rule rejects what it is supposed to reject ──────────────────────────

describe('B7-H — a raw handler fails lint', () => {
  it('rejects an exported async function handler', () => {
    const messages = lint('export async function GET() { return null }', ROUTE_FILE)

    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe(RULE_ID)
    expect(messages[0].message).toContain('withRoute')
  })

  it('rejects a bare arrow-function handler', () => {
    const messages = lint('export const POST = async () => null', ROUTE_FILE)

    expect(messages).toHaveLength(1)
  })

  it('rejects a handler produced by some other wrapper', () => {
    const messages = lint('export const PATCH = somethingElse({}, async () => null)', ROUTE_FILE)

    expect(messages).toHaveLength(1)
  })

  it('reports every raw handler in a file, not just the first', () => {
    const messages = lint(
      'export async function GET() { return null }\nexport async function DELETE() { return null }',
      ROUTE_FILE
    )

    expect(messages).toHaveLength(2)
  })

  it('covers every HTTP method Next.js will route', () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      const messages = lint(`export async function ${method}() { return null }`, ROUTE_FILE)
      expect(messages, method).toHaveLength(1)
    }
  })
})

// ─── ...and accepts what it is supposed to accept ────────────────────────────

describe('B7-H — compliant code and non-route code pass', () => {
  it('accepts a withRoute handler', () => {
    const messages = lint(
      "export const GET = withRoute({ actor: { allow: ['admin'] } }, async () => null)",
      ROUTE_FILE
    )

    expect(messages).toEqual([])
  })

  it('accepts a handler aliased to another compliant handler in the same file', () => {
    const messages = lint(
      "export const POST = withRoute({}, async () => null)\nexport const PATCH = POST",
      ROUTE_FILE
    )

    expect(messages).toEqual([])
  })

  it('ignores exports that are not HTTP methods', () => {
    const messages = lint(
      "export const runtime = 'nodejs'\nexport const dynamic = 'force-dynamic'\nexport async function helper() { return null }",
      ROUTE_FILE
    )

    expect(messages).toEqual([])
  })

  it('ignores a raw GET outside app/api', () => {
    const messages = lint(
      'export async function GET() { return null }',
      path.resolve(import.meta.dirname, '../../lib/some-module/route.ts')
    )

    expect(messages).toEqual([])
  })

  it('ignores a non-route file inside app/api', () => {
    const messages = lint(
      'export async function GET() { return null }',
      path.join(API_DIR, 'probe', 'helpers.ts')
    )

    expect(messages).toEqual([])
  })

  it('accepts an allowlisted route, and only because it is allowlisted', () => {
    const raw = 'export async function GET() { return null }'
    const exemptFile = path.join(API_DIR, 'auth', 'callback', 'route.ts')

    expect(lint(raw, exemptFile)).toEqual([])
    // Take it off the list and the same file is reported.
    expect(lint(raw, exemptFile, [])).toHaveLength(1)
  })
})

// ─── The repository's own inventory ──────────────────────────────────────────

function allRouteFiles(): string[] {
  const hits: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'route.ts') hits.push(path.relative(API_DIR, full).split(path.sep).join('/'))
    }
  }
  walk(API_DIR)
  return hits.sort()
}

describe('B7-H — the repository satisfies the rule it just adopted', () => {
  const files = allRouteFiles()
  const migrated = files.filter((f) =>
    readFileSync(path.join(API_DIR, f), 'utf8').includes('@/lib/api/with-route')
  )
  const unmigrated = files.filter((f) => !migrated.includes(f))

  it('has migrated every route except the documented exemptions', () => {
    expect(unmigrated).toEqual([...EXEMPT].sort())
  })

  // 128 since B13-A added `user/quick-start/route.ts`: `QuickStartContext` used to
  // write the completion flag with a browser-held Supabase session, which B13-A
  // removed, so the write needed a server route. It uses `withRoute` like the rest.
  it('accounts for all 128 routes', () => {
    expect(files).toHaveLength(128)
    expect(migrated).toHaveLength(125)
  })

  it('keeps each wave at the size its own suite asserts', () => {
    const inGroup = (prefix: string) => migrated.filter((f) => f.startsWith(prefix)).length

    expect(inGroup('cron/')).toBe(6)
    expect(inGroup('auth/')).toBe(8)
    expect(inGroup('settings/')).toBe(11)
    expect(inGroup('admin/')).toBe(61)
  })

  it('leaves no route resolving admin authorization by hand', () => {
    for (const file of migrated) {
      const source = readFileSync(path.join(API_DIR, file), 'utf8')
      // The import is the thing that matters — a route that still pulls in the
      // guard is still deciding authorization for itself. Prose mentioning the
      // helper (several routes explain that `resolveActor` delegates to it) is not
      // a call site, so match the import rather than any occurrence of the name.
      expect(source, file).not.toMatch(/import\s*\{[^}]*\brequireAdminUser\b[^}]*\}/)
      expect(source, file).not.toMatch(/\brequireAdminUser\s*\(/)
    }
  })

  it('declares an explicit actor policy on every migrated route', () => {
    for (const file of migrated) {
      const source = readFileSync(path.join(API_DIR, file), 'utf8')
      expect(source, file).toContain('actor: { allow:')
    }
  })

  it('still authenticates every exempt route by its own means', () => {
    // Exempt from the wrapper, never from authorization. Each of these verifies a
    // credential itself, and this asserts the verification is still present.
    const callback = readFileSync(path.join(API_DIR, 'auth/callback/route.ts'), 'utf8')
    expect(callback).toMatch(/verifyOtp|exchangeCodeForSession|token_hash/)

    for (const hook of ['auth/send-email-hook/route.ts', 'email/webhooks/route.ts']) {
      const source = readFileSync(path.join(API_DIR, hook), 'utf8')
      expect(source, hook).toMatch(/createHmac|secretsMatch|secretMatchesAny/)
    }
  })
})
