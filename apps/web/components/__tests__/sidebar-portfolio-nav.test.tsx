/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const trackNavPortfolioClicked = vi.fn()

// vitest.setup.ts mocks next/link to render only its children; these assertions need the
// real anchor attributes (href, target, rel, aria-label, data-*), so render a plain <a>.
// Like the real Link, it runs the caller's onClick and then prevents the browser default,
// so jsdom never attempts a document navigation it cannot perform.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: unknown }) => {
    // `prefetch` is a Link-only prop; keep it off the DOM anchor.
    const anchorProps: Record<string, unknown> = { ...rest }
    delete anchorProps.prefetch
    return (
      <a
        href={href}
        {...anchorProps}
        onClick={(e) => {
          onClick?.(e)
          e.preventDefault()
        }}
      >
        {children}
      </a>
    )
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

vi.mock('@/components/search/SearchOverlayProvider', () => ({
  useSearch: () => ({ openSearch: vi.fn() }),
}))

// The sign-out path pulls in the Supabase client; the nav item never touches it.
vi.mock('@/lib/auth/logout', () => ({
  logout: vi.fn(),
  formatLogoutFailures: vi.fn(),
  LEARNER_LOGIN_PATH: '/login',
}))

vi.mock('@/lib/analytics', () => ({
  trackNavPortfolioClicked: (...args: unknown[]) => trackNavPortfolioClicked(...args),
}))

import Sidebar from '@/components/layout/Sidebar'

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(element: React.ReactElement): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
  return container
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

type SidebarTestProps = Partial<React.ComponentProps<typeof Sidebar>>

function renderSidebar(props: SidebarTestProps = {}) {
  return render(<Sidebar isOpen={false} onClose={vi.fn()} {...props} />)
}

/** Every top-level nav link rendered inside the given sidebar copy, in order. */
function navHrefs(scope: ParentNode): string[] {
  const nav = scope.querySelector('nav[aria-label="Main Navigation"]')!
  return Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href')!)
}

function desktopAside(el: HTMLElement) {
  return el.querySelector('aside')!
}

beforeEach(() => {
  trackNavPortfolioClicked.mockClear()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('Sidebar — portfolio nav item', () => {
  it('renders "My Portfolio" right after Capstones, opening the public page in a new tab', () => {
    const el = renderSidebar({ username: 'ada lovelace', isPortfolioPublic: true })
    const aside = desktopAside(el)

    const hrefs = navHrefs(aside)
    const capstonesIndex = hrefs.indexOf('/capstones')
    expect(capstonesIndex).toBeGreaterThan(-1)
    expect(hrefs[capstonesIndex + 1]).toBe('/p/ada%20lovelace')

    const link = aside.querySelector<HTMLAnchorElement>('a[data-portfolio-nav]')!
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.textContent).toBe('My Portfolio (opens in a new tab)')
    expect(link.querySelector('.sr-only')?.textContent).toBe(' (opens in a new tab)')
    expect(link.hasAttribute('data-quick-start-target')).toBe(false)
  })

  it('renders "Publish portfolio" to the settings tab, same tab, when private', () => {
    const el = renderSidebar({ username: 'ada', isPortfolioPublic: false })
    const link = desktopAside(el).querySelector<HTMLAnchorElement>('a[data-portfolio-nav]')!

    expect(link.getAttribute('href')).toBe('/settings?tab=portfolio')
    expect(link.hasAttribute('target')).toBe(false)
    expect(link.textContent).toBe('Publish portfolio')
  })

  it.each([
    ['null', null],
    ['empty', ''],
    ['whitespace', '   '],
  ])('hides the item when the username is %s', (_name, username) => {
    const el = renderSidebar({ username, isPortfolioPublic: true })
    expect(el.querySelector('a[data-portfolio-nav]')).toBeNull()
    expect(navHrefs(desktopAside(el))).not.toContain('/settings?tab=portfolio')
  })

  it('keeps the quick-start targets unchanged (no portfolio target)', () => {
    const el = renderSidebar({ username: 'ada', isPortfolioPublic: true })
    const targets = Array.from(desktopAside(el).querySelectorAll('[data-quick-start-target]')).map((n) =>
      n.getAttribute('data-quick-start-target')
    )
    expect(targets).toEqual(['curriculum', 'capstones', 'badges', 'review', 'leaderboard', 'settings'])
  })

  it('tracks clicks with the expanded desktop surface', () => {
    const onClose = vi.fn()
    const el = renderSidebar({ username: 'ada', isPortfolioPublic: true, onClose })
    click(desktopAside(el).querySelector('a[data-portfolio-nav]')!)

    expect(trackNavPortfolioClicked).toHaveBeenCalledTimes(1)
    expect(trackNavPortfolioClicked).toHaveBeenCalledWith('public', 'sidebar')
    expect(onClose).toHaveBeenCalled()
  })

  it('uses an aria-label and the collapsed surface when the sidebar is collapsed', () => {
    const el = renderSidebar({ username: 'ada', isPortfolioPublic: true, isCollapsed: true })
    const link = desktopAside(el).querySelector<HTMLAnchorElement>('a[data-portfolio-nav]')!

    expect(link.getAttribute('aria-label')).toBe('My Portfolio (opens in a new tab)')
    click(link)
    expect(trackNavPortfolioClicked).toHaveBeenCalledWith('public', 'sidebar_collapsed')
  })

  it('labels the collapsed private item without the new-tab suffix', () => {
    const el = renderSidebar({ username: 'ada', isPortfolioPublic: false, isCollapsed: true })
    const link = desktopAside(el).querySelector<HTMLAnchorElement>('a[data-portfolio-nav]')!
    expect(link.getAttribute('aria-label')).toBe('Publish portfolio')
  })

  it('tracks clicks from the mobile drawer with the drawer surface', () => {
    const onClose = vi.fn()
    const el = renderSidebar({ username: 'ada', isPortfolioPublic: false, isOpen: true, onClose })
    const links = el.querySelectorAll<HTMLAnchorElement>('a[data-portfolio-nav]')
    // One copy in the desktop aside, one in the drawer.
    expect(links).toHaveLength(2)
    const drawerLink = Array.from(links).find((a) => !a.closest('aside'))!

    click(drawerLink)
    expect(trackNavPortfolioClicked).toHaveBeenCalledWith('private', 'mobile_drawer')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
