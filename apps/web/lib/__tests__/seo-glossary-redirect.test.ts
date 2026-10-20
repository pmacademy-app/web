import { describe, it, expect, vi, beforeEach } from 'vitest'

const navigation = vi.hoisted(() => ({
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:308:${path}`)
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:307:${path}`)
  }),
}))

vi.mock('next/navigation', () => navigation)

import GlossaryPage from '../../app/(marketing)/glossary/page'
import sitemap from '../../app/sitemap'
import { NAV_LINKS, FOOTER_LINK_GROUPS } from '@/config/navigation'

describe('SEO-04 glossary retirement', () => {
  beforeEach(() => {
    navigation.permanentRedirect.mockClear()
    navigation.redirect.mockClear()
  })

  it('/glossary issues a permanent (308) redirect to /frameworks', () => {
    expect(() => GlossaryPage()).toThrow('NEXT_REDIRECT:308:/frameworks')
    expect(navigation.permanentRedirect).toHaveBeenCalledWith('/frameworks')
    expect(navigation.redirect).not.toHaveBeenCalled()
  })

  it('sitemap no longer lists /glossary', async () => {
    const entries = await sitemap()
    const glossary = entries.filter((e) => new URL(e.url).pathname === '/glossary')
    expect(glossary).toHaveLength(0)
  })

  it('navigation no longer links to /glossary', () => {
    const hrefs = [
      ...NAV_LINKS.map((l) => l.href),
      ...FOOTER_LINK_GROUPS.flatMap((g) => g.links.map((l) => l.href)),
    ]
    expect(hrefs).not.toContain('/glossary')
  })
})
