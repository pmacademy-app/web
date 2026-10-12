/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Growth R5 / B4: an earned badge can be shared from /badges; a private portfolio is asked to publish.

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/dynamic', () => ({
  default: () =>
    function ShareStub(props: { username: string; context?: string; badgeName?: string }) {
      return <span data-testid="share-stub" data-username={props.username} data-context={props.context} data-badge={props.badgeName} />
    },
}))

import { BadgeCard } from '@/components/badges/BadgeCard'
import type { BadgeProgressItem } from '@/lib/badges'

const badge = (isEarned: boolean): BadgeProgressItem =>
  ({
    definition: { key: 'module_complete', name: 'Module Master', description: 'Finish a module', category: 'learning', icon: 'Trophy', targetGoal: 1, criteriaText: '' },
    isEarned,
    earnedAt: isEarned ? '2026-10-01T00:00:00Z' : null,
    currentValue: isEarned ? 1 : 0,
    targetValue: 1,
    progressPercentage: isEarned ? 100 : 0,
  }) as unknown as BadgeProgressItem

let container: HTMLDivElement
let root: Root

function render(node: React.ReactNode) {
  act(() => {
    root.render(node)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('BadgeCard share', () => {
  it('shares an earned badge from a public portfolio with the badge wording', () => {
    render(<BadgeCard badge={badge(true)} portfolio={{ username: 'ada', isPublic: true }} />)
    const share = container.querySelector('[data-testid="share-stub"]')
    expect(share?.getAttribute('data-context')).toBe('badge')
    expect(share?.getAttribute('data-badge')).toBe('Module Master')
  })

  it('asks a private portfolio to publish', () => {
    render(<BadgeCard badge={badge(true)} portfolio={{ username: 'ada', isPublic: false }} />)
    expect(container.querySelector('[data-testid="badge-share"] a')?.getAttribute('href')).toBe('/settings?tab=portfolio')
  })

  it('shows no share control for a badge not yet earned, or without a portfolio', () => {
    render(<BadgeCard badge={badge(false)} portfolio={{ username: 'ada', isPublic: true }} />)
    expect(container.querySelector('[data-testid="badge-share"]')).toBeNull()
    render(<BadgeCard badge={badge(true)} />)
    expect(container.querySelector('[data-testid="badge-share"]')).toBeNull()
  })
})
