/**
 * @vitest-environment jsdom
 */

/**
 * L10: when markdown parsing or sanitizing throws, the RichEditor preview used to put the raw
 * value straight into dangerouslySetInnerHTML. The fallback must render it as text.
 */
import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { renderToString } from 'react-dom/server'

vi.mock('marked', () => ({
  marked: {
    parse: () => {
      throw new Error('parser crashed')
    },
  },
}))

import { RichEditor } from '@/components/capstones/RichEditor'

describe('RichEditor preview fallback (L10)', () => {
  it('escapes the raw value instead of rendering it as HTML', () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>'
    const html = renderToString(<RichEditor value={payload} onChange={() => {}} isLocked />)

    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert(2)')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })
})
