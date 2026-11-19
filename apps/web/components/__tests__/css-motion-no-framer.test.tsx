/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Perf: framer-motion was replaced by CSS (transitions, tw-animate-css and two keyframes
// in globals.css) in the FAQ, frameworks and reviews explorers, the dashboard ring and
// radar cards, and the review flashcard. These tests pin that the engine is gone and
// that the accordion, flashcard and reveal behaviour it used to drive still holds.

vi.mock('@/lib/analytics', () => ({ trackFAQExpand: vi.fn() }))

import { FAQExplorer } from '@/components/marketing/faq-explorer'
import { FrameworksExplorer } from '@/components/marketing/frameworks-explorer'
import { ProgressRingCard } from '@/components/dashboard/ProgressRingCard'
import { Flashcard } from '@/components/review/Flashcard'
import { FAQ_ITEMS } from '@/config/content'
import type { FrameworkItem } from '@/lib/frameworks'

const APP_ROOT = join(__dirname, '..', '..')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(full)
  }
  return out
}

/** Drops comments so a doc note naming the old library does not count as an import. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('framer-motion is gone', () => {
  it('no source file imports framer-motion or motion', () => {
    const offenders = ['app', 'components', 'hooks', 'lib', 'blocks', 'renderer']
      .flatMap((d) => {
        try {
          return sourceFiles(join(APP_ROOT, d))
        } catch {
          return []
        }
      })
      .filter((f) => /from\s+['"](framer-motion|motion|motion\/react)['"]|require\(['"]framer-motion['"]\)/.test(code(readFileSync(f, 'utf8'))))
      .map((f) => relative(APP_ROOT, f))
    expect(offenders).toEqual([])
  })

  it('is not a dependency any more', () => {
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8'))
    expect(pkg.dependencies?.['framer-motion']).toBeUndefined()
    expect(pkg.devDependencies?.['framer-motion']).toBeUndefined()
    expect(readFileSync(join(APP_ROOT, 'vitest.config.mts'), 'utf8')).not.toContain('framer-motion')
  })

  it('the CSS replacements respect reduced motion', () => {
    const css = readFileSync(join(APP_ROOT, 'app', 'globals.css'), 'utf8')
    expect(css).toContain('@keyframes ring-draw')
    expect(css).toMatch(/\[data-reveal='pending'\]\s*\{\s*opacity: 0;/)
    const reduced = css.slice(css.indexOf('[data-reveal] {'))
    expect(reduced).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.animate-ring-draw/)
    for (const rel of [
      'components/dashboard/SkillRadarCard.tsx',
      'components/marketing/reviews-explorer.tsx',
      'components/review/Flashcard.tsx',
      'components/dashboard/ProgressRingCard.tsx',
    ]) {
      expect(readFileSync(join(APP_ROOT, rel), 'utf8'), rel).toContain('motion-reduce:')
    }
  })
})

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
  vi.unstubAllGlobals()
})

function render(node: React.ReactNode) {
  act(() => {
    root.render(node)
  })
}

describe('FAQ accordion (CSS grid-rows collapse)', () => {
  it('keeps the button/region wiring and toggles aria-expanded', () => {
    render(<FAQExplorer />)
    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-controls^="faq-answer-"]')
    expect(buttons.length).toBe(FAQ_ITEMS.length)

    // First answer starts open, like before.
    expect(buttons[0].getAttribute('aria-expanded')).toBe('true')
    const region = container.querySelector('#faq-answer-0')!
    expect(region.getAttribute('role')).toBe('region')
    expect(region.getAttribute('aria-labelledby')).toBe('faq-btn-0')
    expect(region.textContent).toContain(FAQ_ITEMS[0].answer)
    expect(container.querySelector('#faq-answer-1')).toBeNull()

    // Open the second: the first collapses and stays mounted (inert) until its
    // transition ends, like AnimatePresence's exit.
    act(() => buttons[1].click())
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false')
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true')
    const closing = container.querySelector('#faq-answer-0')!
    expect(closing.getAttribute('data-state')).toBe('closed')
    expect(closing.hasAttribute('inert')).toBe(true)
    act(() => {
      closing.dispatchEvent(new Event('transitionend', { bubbles: true }))
    })
    expect(container.querySelector('#faq-answer-0')).toBeNull()
    expect(container.querySelector('#faq-answer-1')?.getAttribute('data-state')).toBe('open')

    // Close it again from the same button.
    act(() => buttons[1].click())
    expect(buttons[1].getAttribute('aria-expanded')).toBe('false')
  })
})

const FRAMEWORK: FrameworkItem = {
  slug: 'accountability-triangle',
  name: 'The Accountability Triangle',
  lessonNumber: 1,
  lessonSlug: 'lesson-1',
  moduleNumber: 1,
  moduleSlug: 'm1',
  moduleTitle: 'Foundations & Mindset',
  summary: 's',
  definition: 'd',
  keyTakeaway: 'k',
}

describe('frameworks reveal (visible at rest)', () => {
  it('leaves cards visible when there is no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<FrameworksExplorer frameworks={[FRAMEWORK]} />)
    const card = container.querySelector('#accountability-triangle')!
    expect(card.hasAttribute('data-reveal')).toBe(false)
    expect(card.textContent).toContain('The Accountability Triangle')
  })

  it('hides an off-screen card only until the observer reports it in view', () => {
    let callback: IntersectionObserverCallback = () => {}
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<FrameworksExplorer frameworks={[FRAMEWORK]} />)
    const card = container.querySelector('#accountability-triangle')!
    // jsdom lays everything out at 0x0, i.e. not intersecting the viewport.
    expect(card.getAttribute('data-reveal')).toBe('pending')
    act(() => {
      callback([{ isIntersecting: true, target: card } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(card.getAttribute('data-reveal')).toBe('shown')
  })
})

describe('ProgressRingCard ring (CSS keyframe)', () => {
  it('renders the final offset with the sweep start in --ring-from', () => {
    render(<ProgressRingCard completedLessons={45} totalLessons={90} />)
    const circles = container.querySelectorAll('circle')
    const ring = circles[1] as SVGCircleElement
    const circumference = (42 - 16) * 2 * Math.PI
    expect(ring.getAttribute('class')).toContain('animate-ring-draw')
    expect(ring.style.getPropertyValue('--ring-from')).toBe(`${circumference}px`)
    expect(parseFloat(ring.style.strokeDashoffset)).toBeCloseTo(circumference / 2, 3)
  })
})

describe('Flashcard flip (CSS 3D transform)', () => {
  const card = { id: 'c1', lessonId: 'l1', front: 'Front text', back: 'Back text' }

  it('keeps role, label and Space/Enter keyboard flip', () => {
    const onFlip = vi.fn()
    render(<Flashcard card={card} isFlipped={false} onFlip={onFlip} />)
    const button = container.querySelector<HTMLElement>('[role="button"]')!
    expect(button.getAttribute('tabindex')).toBe('0')
    expect(button.getAttribute('aria-label')).toBe('Flashcard concept question. Click or press Space to flip.')
    act(() => {
      button.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
      button.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))
    })
    expect(onFlip).toHaveBeenCalledTimes(2)
    act(() => button.click())
    expect(onFlip).toHaveBeenCalledTimes(3)
  })

  it('rotates the card 180deg on Y with preserve-3d when flipped', () => {
    render(<Flashcard card={card} isFlipped onFlip={() => {}} />)
    const button = container.querySelector<HTMLElement>('[role="button"]')!
    expect(button.getAttribute('aria-label')).toBe('Flashcard answer revealed. Click or press Space to flip.')
    const inner = button.firstElementChild as HTMLElement
    expect(inner.className).toContain('[transform:rotateY(180deg)]')
    expect(inner.style.transformStyle).toBe('preserve-3d')
  })
})
