import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CAPSTONE_REVIEW_EXPECTATION } from '../capstones'

const webRoot = path.resolve(import.meta.dirname, '../..')
const read = (rel: string) => readFileSync(path.join(webRoot, rel), 'utf8')

describe('Phase 7 (7.4) — route consolidation', () => {
  it('/progress/badges permanently redirects to the canonical /badges', () => {
    const src = read('app/(app)/progress/badges/page.tsx')
    expect(src).toContain('permanentRedirect')
    expect(src).toContain("permanentRedirect('/badges')")
  })

  it('/progress/capstones permanently redirects to the canonical /capstones', () => {
    const src = read('app/(app)/progress/capstones/page.tsx')
    expect(src).toContain('permanentRedirect')
    expect(src).toContain("permanentRedirect('/capstones')")
  })

  it('the sidebar no longer lists the duplicate /progress/{badges,capstones} nav entries', () => {
    const src = read('components/layout/Sidebar.tsx')
    expect(src).not.toContain("href: '/progress/badges'")
    expect(src).not.toContain("href: '/progress/capstones'")
    // ...but the canonical top-level destinations remain in the primary nav.
    expect(src).toContain("href: '/badges'")
    expect(src).toContain("href: '/capstones'")
    // ...and the remaining progress subpages are untouched.
    expect(src).toContain("href: '/progress/radar'")
    expect(src).toContain("href: '/progress/certificates'")
  })
})

describe('Phase 7 (7.4) — reminder due count is real, not hardcoded', () => {
  it('the admin run-now reminder path uses the SRS due count and no longer hardcodes dueCount: 5', () => {
    const src = read('app/api/admin/emails/automations/run-now/route.ts')
    expect(src).toContain('getDueCardsCount')
    expect(src).not.toMatch(/dueCount:\s*5/)
  })

  it('the cron daily-reminder path uses the SRS due count and suppresses at zero', () => {
    const src = read('app/api/cron/daily-reminder/route.ts')
    expect(src).toContain('getDueCardsCount')
    expect(src).not.toMatch(/dueCount:\s*5/)
  })
})

describe('Phase 7 (7.3) — review expectation is honest, not a fabricated SLA', () => {
  it('states best-effort review with no guaranteed turnaround window', () => {
    const combined = `${CAPSTONE_REVIEW_EXPECTATION.reviewNote} ${CAPSTONE_REVIEW_EXPECTATION.short}`.toLowerCase()
    expect(combined).toContain('best-effort')
    expect(combined).toContain('not guaranteed')
    // No fabricated numeric turnaround promise (e.g. "within 3 days", "48 hours", "2 business days").
    expect(combined).not.toMatch(/within\s+\d+\s+(hour|day|business)/)
    expect(combined).not.toMatch(/\d+\s+business day/)
  })

  it('reassures that submission itself is complete (portfolio + XP) regardless of review', () => {
    const outcome = CAPSTONE_REVIEW_EXPECTATION.outcome.toLowerCase()
    expect(outcome).toContain('portfolio')
    expect(outcome).toContain('xp')
  })
})
