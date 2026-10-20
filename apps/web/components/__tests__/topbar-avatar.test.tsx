/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// UX-01: the Topbar avatar must only show a photo when the learner has one. Before this
// fix any learner without a name, or whose name contained "aditya", saw the founder's photo.

import { TopbarAvatar } from '@/components/layout/TopbarAvatar'

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
