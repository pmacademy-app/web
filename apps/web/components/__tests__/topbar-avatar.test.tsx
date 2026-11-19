/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// UX-01: the Topbar avatar must only show a photo when the learner has one. Before this
// fix any learner without a name, or whose name contained "aditya", saw the founder's photo.

import { TopbarAvatar } from '@/components/layout/TopbarAvatar'

// vitest.setup.ts stubs next/image to render nothing. The avatar is a next/image now,
// so this suite uses the real component to see the markup it actually ships.
vi.mock('next/image', async () => await vi.importActual('next/image'))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(element: React.ReactElement) {
  act(() => root.render(element))
}

describe('TopbarAvatar', () => {
  it('shows the uppercased initial and no image for a named learner without a photo', () => {
    render(<TopbarAvatar name="Aditya" avatarUrl={null} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('A')
  })

  it('uppercases a lowercase initial', () => {
    render(<TopbarAvatar name="maya" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('M')
  })

  it('shows the user icon and no image when there is no name', () => {
    render(<TopbarAvatar name={null} avatarUrl={null} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).toBe('')
  })

  it('treats a whitespace-only name as no name', () => {
    render(<TopbarAvatar name="   " />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders the uploaded photo when avatar_url is set', () => {
    render(<TopbarAvatar name="Aditya" avatarUrl="https://cdn.example.com/u/1.png" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/u/1.png')
  })

  it('renders a 32px next/image so a Supabase photo is served small', () => {
    const url = 'https://abc123.supabase.co/storage/v1/object/public/avatars/u1/a.png'
    render(<TopbarAvatar name="Aditya" avatarUrl={url} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('width')).toBe('32')
    expect(img.getAttribute('height')).toBe('32')
    expect(img.getAttribute('alt')).toBe('')
    // Through the optimizer at 32px (1x) and 64px (2x), never the full-size original.
    const src = img.getAttribute('src')!
    expect(src).toContain('/_next/image?url=')
    expect(decodeURIComponent(src)).toContain(url)
    expect(src).toMatch(/[?&]w=64(&|$)/)
    const srcset = img.getAttribute('srcset') ?? ''
    expect(srcset).toMatch(/w=32&q=\d+ 1x/)
    expect(srcset).toMatch(/w=64&q=\d+ 2x/)
  })

  it('serves a host outside remotePatterns as-is instead of through the optimizer', () => {
    render(<TopbarAvatar name="Aditya" avatarUrl="  https://lh3.googleusercontent.com/a/photo  " />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://lh3.googleusercontent.com/a/photo')
    expect(img.getAttribute('width')).toBe('32')
  })

  it('uses next/image, not a raw img tag', () => {
    const source = readFileSync(join(__dirname, '..', 'layout', 'TopbarAvatar.tsx'), 'utf8')
    expect(source).toContain("from 'next/image'")
    expect(source).not.toMatch(/<img/)
    expect(source).toMatch(/width=\{32\}/)
    expect(source).toMatch(/height=\{32\}/)
  })

  it('falls back to the initial when the photo fails to load', () => {
    render(<TopbarAvatar name="Aditya" avatarUrl="https://cdn.example.com/broken.png" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()

    act(() => {
      img!.dispatchEvent(new Event('error'))
    })

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('A')
  })

  it('falls back to the user icon when the photo fails and there is no name', () => {
    render(<TopbarAvatar name={null} avatarUrl="https://cdn.example.com/broken.png" />)
    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'))
    })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('retries when a new avatar URL arrives after a failure', () => {
    render(<TopbarAvatar name="Aditya" avatarUrl="https://cdn.example.com/broken.png" />)
    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'))
    })
    expect(container.querySelector('img')).toBeNull()

    render(<TopbarAvatar name="Aditya" avatarUrl="https://cdn.example.com/new.png" />)

    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/new.png')
  })

  it('is hidden from assistive tech because the menu button carries the label', () => {
    render(<TopbarAvatar name="Aditya" />)
    const avatar = container.querySelector('[data-testid="topbar-avatar"]')
    expect(avatar?.getAttribute('aria-hidden')).toBe('true')
  })

  it('never falls back to the founder photo', () => {
    const topbarDir = join(__dirname, '..', 'layout')
    for (const file of ['Topbar.tsx', 'TopbarAvatar.tsx']) {
      const source = readFileSync(join(topbarDir, file), 'utf8')
      expect(source).not.toMatch(/aditya/i)
    }
  })
})
