import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import axe from 'axe-core'

// The global setup mock renders next/link as bare children, which would erase
// the anchors this suite is about. Render them as real <a> elements instead.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { Footer } from '@/components/layout/footer'
import { BRAND } from '@/lib/brand'

const html = renderToString(React.createElement(Footer))
const dom = new JSDOM(`<!DOCTYPE html><html lang="en"><body>${html}</body></html>`)
// jsdom's window is loosely typed here; narrow it to the DOM lib types.
const { document } = dom.window as unknown as { document: Document }

function socialAnchors() {
  return Array.from(document.querySelectorAll('a')).filter((a) =>
    /linkedin|x\.com|instagram/.test(a.getAttribute('href') ?? '')
  )
}

describe('Footer — social links', () => {
  it('renders LinkedIn, X and Instagram with the canonical BRAND urls', () => {
    const hrefs = socialAnchors().map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      BRAND.social.linkedin,
      BRAND.social.twitter,
      BRAND.social.instagram,
    ])
  })

  it('labels each icon link and opens it safely in a new tab', () => {
    for (const anchor of socialAnchors()) {
      expect(anchor.getAttribute('aria-label')).toMatch(/^Prodily on (LinkedIn|X|Instagram)/)
      expect(anchor.getAttribute('target')).toBe('_blank')
      expect(anchor.getAttribute('rel')).toContain('noopener')
    }
  })

  it('keeps the existing footer navigation intact', () => {
    const navHrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(navHrefs).toContain('/curriculum')
    expect(navHrefs).toContain('/privacy')
    expect(navHrefs).toContain('/terms')
  })

  it('has no serious or critical accessibility violations', async () => {
    // Scoped to the follow block. A whole-footer audit also reports a
    // pre-existing aria-label on the BrandLogo <span>, which is out of scope here.
    const followBlock = socialAnchors()[0]?.closest('div')
    expect(followBlock).toBeTruthy()

    const results = await axe.run(followBlock as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    )
    expect(blocking.map((v) => v.id)).toEqual([])
  })
})
