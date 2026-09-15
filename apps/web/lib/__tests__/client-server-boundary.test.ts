/**
 * The client/server module boundary.
 *
 * B9-C hit this the hard way: `PortfolioSettingsForm` imported a layout constant
 * from `lib/portfolio-db`, which reaches the notification dispatcher, which reaches
 * the email queue processor — and the browser build failed the moment
 * `node:async_hooks` landed at the end of that chain. The constant was innocent;
 * the import edge was not.
 *
 * A follow-up trace of all 201 `'use client'` entry points found one more instance
 * of the same shape: two client components importing pure onboarding defaults from
 * `lib/admin/settings-service`, which imports `createServiceRoleClient`. The build
 * output confirmed `getOnboardingSettings` and the `system_settings` query code
 * were being shipped to browsers that cannot use them.
 *
 * No secret ever leaked in either case — `SUPABASE_SERVICE_ROLE_KEY` is not
 * `NEXT_PUBLIC_`-prefixed, so Next.js replaces it with undefined in client code,
 * and a scan of every client chunk for the key's actual value found nothing. The
 * cost is bundle weight, server query code in the browser, and a latent build break
 * that only appears when someone adds a node-only dependency several hops away.
 *
 * These tests pin the two fixed boundaries. They are deliberately specific rather
 * than a general graph walk: a whole-graph assertion would be slow, and would fail
 * for `lib/supabase.ts`, which client code imports on purpose for
 * `createBrowserSupabaseClient`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../../')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** Client components and the server module each must not reach. */
const BOUNDARIES: Array<{ client: string; forbidden: string; allowed: string }> = [
  {
    client: 'components/settings/PortfolioSettingsForm.tsx',
    forbidden: '@/lib/portfolio-db',
    allowed: '@/lib/portfolio',
  },
  {
    client: 'app/onboarding/OnboardingWizard.tsx',
    forbidden: '@/lib/admin/settings-service',
    allowed: '@/lib/admin/onboarding-defaults',
  },
  {
    client: 'components/admin/OnboardingSettingsSection.tsx',
    forbidden: '@/lib/admin/settings-service',
    allowed: '@/lib/admin/onboarding-defaults',
  },
]

describe('client components do not import server data-layer modules', () => {
  for (const { client, forbidden, allowed } of BOUNDARIES) {
    it(`${client} takes its constants from ${allowed}`, () => {
      const source = read(client)

      expect(source, client).toContain(`from '${allowed}'`)

      // Only a VALUE import of the server module is the defect. A type-only import
      // is erased by the compiler and cannot drag anything into a bundle —
      // `PortfolioSettingsForm` legitimately keeps `import type { ... } from
      // '@/lib/portfolio-db'` for its prop shapes.
      //
      // Matched against whole import statements rather than with a newline-spanning
      // pattern: a multi-line `import React, { ... }` above would otherwise run on
      // and swallow the next statement's specifier.
      const statements = source.match(/^import[\s\S]*?from '[^']+'/gm) ?? []
      const offending = statements.filter(
        (s) => s.includes(`from '${forbidden}'`) && !/^import\s+type\b/.test(s)
      )

      expect(offending, `${client} value-imports ${forbidden}`).toEqual([])
    })
  }
})

describe('the client-safe modules stay client-safe', () => {
  const CLIENT_SAFE = ['lib/portfolio.ts', 'lib/admin/onboarding-defaults.ts']

  for (const clientSafe of CLIENT_SAFE) {
    it(`${clientSafe} pulls in no server-only dependency`, () => {
      const source = read(clientSafe)
      // Comments stripped: `lib/portfolio.ts` documents the B9-C chain by name.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

      expect(code, clientSafe).not.toContain('createServiceRoleClient')
      expect(code, clientSafe).not.toContain('node:')
      expect(code, clientSafe).not.toContain('next/headers')
      // Value imports only; a type import costs nothing at runtime.
      const valueImports = code.match(/^import\s+(?!type\s)[^;]*from '([^']+)'/gm) ?? []
      for (const line of valueImports) {
        expect(line, `${clientSafe}: ${line}`).not.toMatch(/-db'|\/supabase'|notifications\//)
      }
    })
  }
})

describe('server call sites are unchanged by the moves', () => {
  it('portfolio-db still re-exports the layout constants', () => {
    const source = read('lib/portfolio-db.ts')

    expect(source).toContain('VALID_PORTFOLIO_SECTIONS')
    expect(source).toContain('DEFAULT_PORTFOLIO_LAYOUT')
  })

  it('settings-service still re-exports the onboarding defaults', () => {
    const source = read('lib/admin/settings-service.ts')

    for (const name of [
      'DEFAULT_GOAL_OPTIONS',
      'DEFAULT_EXPERIENCE_OPTIONS',
      'DEFAULT_TOPIC_OPTIONS',
      'DEFAULT_PREFERENCE_OPTIONS',
      'DEFAULT_ONBOARDING_STEPS',
    ]) {
      expect(source, name).toContain(name)
    }
    expect(source).toContain("from './onboarding-defaults'")
  })

  it('the moved constants are still the same data', async () => {
    const defaults = await import('../admin/onboarding-defaults')
    const service = await import('../admin/settings-service')

    // Re-export, not a copy: a duplicate would drift.
    expect(service.DEFAULT_GOAL_OPTIONS).toBe(defaults.DEFAULT_GOAL_OPTIONS)
    expect(service.DEFAULT_ONBOARDING_STEPS).toBe(defaults.DEFAULT_ONBOARDING_STEPS)
    expect(defaults.DEFAULT_GOAL_OPTIONS.length).toBeGreaterThan(0)
  })
})
