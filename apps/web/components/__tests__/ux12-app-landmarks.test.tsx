/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import AppShell from '../layout/AppShell'
import Sidebar from '../layout/Sidebar'
import AuthLayout from '../../app/(auth)/layout'
import { LeaderboardHeader } from '../leaderboard/LeaderboardHeader'
import LoginForm from '../../app/(auth)/login/LoginForm'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mockPathname = '/dashboard'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: unknown }) => {
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

vi.mock('@/components/search/SearchOverlayProvider', () => ({
  SearchOverlayProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSearch: () => ({ openSearch: vi.fn() }),
}))

vi.mock('@/components/layout/SystemAnnouncementBanner', () => ({
  SystemAnnouncementBanner: () => null,
}))

vi.mock('@/components/layout/Topbar', () => ({
  default: () => <header role="banner">Topbar</header>,
}))

vi.mock('@/components/layout/MobileTabBar', () => ({
  MobileTabBar: () => <nav aria-label="Mobile Navigation">MobileTabBar</nav>,
}))

vi.mock('@/components/search/SearchOverlay', () => ({
  SearchOverlay: () => null,
}))

vi.mock('@/components/feedback/LearnerFeedbackProvider', () => ({
  LearnerFeedbackProvider: () => null,
}))

describe('UX-12 / AG-19: App landmarks, skip links, headings, and nav state', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockPathname = '/dashboard'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders a skip link as the first focusable element in AppShell targeting main-content', async () => {
    const dummyUser = {
      id: 'test-user-id',
      email: 'user@example.com',
      username: 'testuser',
      full_name: 'Test User',
      name: 'Test User',
      level: 1,
      avatar_url: null,
      cohort_id: null,
      is_portfolio_public: true,
    }

    await act(async () => {
      root.render(
        <AppShell userProfile={dummyUser}>
          <div data-testid="page-child">Dashboard content</div>
        </AppShell>
      )
    })

    const skipLink = container.querySelector('a[href="#main-content"]')
    expect(skipLink).not.toBeNull()
    expect(skipLink?.textContent?.trim()).toBe('Skip to main content')

    const main = container.querySelector('main#main-content')
    expect(main).not.toBeNull()
    expect(main?.getAttribute('tabIndex')).toBe('-1')

    // Confirm skip link is the very first focusable element
    const focusable = container.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    expect(focusable[0]).toBe(skipLink)
  })

  it('renders a skip link in AuthLayout targeting main-content', async () => {
    await act(async () => {
      root.render(
        <AuthLayout>
          <div>Login page form</div>
        </AuthLayout>
      )
    })

    const skipLink = container.querySelector('a[href="#main-content"]')
    expect(skipLink).not.toBeNull()
    expect(skipLink?.textContent?.trim()).toBe('Skip to main content')

    const main = container.querySelector('main#main-content')
    expect(main).not.toBeNull()
    expect(main?.getAttribute('tabIndex')).toBe('-1')
  })

  it('sets aria-current="page" on the active route in Sidebar', async () => {
    mockPathname = '/academy'

    await act(async () => {
      root.render(
        <Sidebar
          isOpen={true}
          onClose={vi.fn()}
          username="testuser"
          isPortfolioPublic={true}
        />
      )
    })

    const links = Array.from(container.querySelectorAll('a'))
    const curriculumLink = links.find((a) => a.getAttribute('href') === '/academy')
    const dashboardLink = links.find((a) => a.getAttribute('href') === '/dashboard')

    expect(curriculumLink?.getAttribute('aria-current')).toBe('page')
    expect(dashboardLink?.getAttribute('aria-current')).toBeNull()
  })

  it('renders exactly one h1 in LeaderboardHeader', async () => {
    await act(async () => {
      root.render(
        <LeaderboardHeader
          personalEntry={null}
          initialOptedIn={true}
          cohortsList={[]}
          friendEntries={[]}
          currentUserId="test-user-id"
        />
      )
    })

    const h1Elements = container.querySelectorAll('h1')
    expect(h1Elements.length).toBe(1)
    expect(h1Elements[0].textContent).toContain('Consistency Leaderboard')
  })

  it('renders auth form inputs with correct autoComplete attributes', async () => {
    await act(async () => {
      root.render(<LoginForm next={null} errorParam={null} verified={false} resetSuccess={false} />)
    })

    const emailInput = container.querySelector('#login-email')
    expect(emailInput?.getAttribute('autoComplete')).toBe('email')

    const passwordInput = container.querySelector('#login-password')
    expect(passwordInput?.getAttribute('autoComplete')).toBe('current-password')
  })
})
