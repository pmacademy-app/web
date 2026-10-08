/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// The global setup mocks `next/link` as children-only, which drops href/target/onClick.
// Render a real anchor instead, and stop jsdom from attempting navigation on click.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        e.preventDefault()
      }}
    >
      {children}
    </a>
  ),
}))

// The global setup mocks `next/dynamic` to render nothing. Model the real behaviour
// instead: show `loading` first, then the lazily imported component (React.lazy +
// Suspense), so the card's own share wrapper is exercised around the loaded button.
vi.mock('next/dynamic', async () => {
  const ReactActual = await vi.importActual<typeof import('react')>('react')
  return {
    default: (
      loader: () => Promise<React.ComponentType<Record<string, unknown>>>,
      options?: { loading?: () => React.ReactNode },
    ) => {
      const Lazy = ReactActual.lazy(async () => ({ default: await loader() }))
      return function DynamicComponent(props: Record<string, unknown>) {
        return ReactActual.createElement(
          ReactActual.Suspense,
          { fallback: options?.loading ? options.loading() : null },
          ReactActual.createElement(Lazy, props),
        )
      }
    },
  }
})

vi.mock('@/components/portfolio/ShareButton', () => ({
  ShareButton: ({ username }: { username: string }) => (
    <span data-testid="share-button" data-username={username}>
      Share Portfolio
    </span>
  ),
}))

import { PortfolioProofCard } from '@/components/dashboard/PortfolioProofCard'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

type Props = React.ComponentProps<typeof PortfolioProofCard>

let root: Root | null = null
let container: HTMLDivElement | null = null
let gtag: ReturnType<typeof vi.fn>

function render(overrides: Partial<Props> = {}): HTMLDivElement {
  const props: Props = {
    username: 'jane-pm',
    isPortfolioPublic: true,
    completedLessons: 12,
    hasCertificate: false,
    ...overrides,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(<PortfolioProofCard {...props} />)
  })
  return container
}

/** Lets the client-only (next/dynamic) ShareButton finish loading. */
async function waitForShareButton(el: HTMLElement): Promise<Element> {
  for (let i = 0; i < 20; i++) {
    const share = el.querySelector('[data-testid="share-button"]')
    if (share) return share
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error('ShareButton never loaded')
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function linkByText(el: HTMLElement, text: string): HTMLAnchorElement {
  const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes(text))
  if (!link) throw new Error(`No link containing "${text}"`)
  return link
}

function proofEvents() {
  return gtag.mock.calls.filter((call) => call[1] === 'dashboard_proof_card_clicked')
}

beforeEach(() => {
  gtag = vi.fn()
  ;(window as unknown as { gtag: unknown }).gtag = gtag
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  delete (window as unknown as { gtag?: unknown }).gtag
})

describe('PortfolioProofCard — section', () => {
  it('is a labelled region with a visible "Portfolio & Proof" h2', () => {
    const el = render()
    const section = el.querySelector('section')!
    const h2 = el.querySelector('h2')!
    expect(h2.textContent).toContain('Portfolio & Proof')
    expect(section.getAttribute('aria-labelledby')).toBe(h2.id)
  })
})

describe('PortfolioProofCard — public portfolio', () => {
  it('shows the Public pill and live copy', () => {
    const el = render({ username: 'jane-pm', isPortfolioPublic: true })
    expect(el.textContent).toContain('Public')
    expect(el.textContent).toContain('Your portfolio is live')
    expect(el.textContent).toContain('Share it with recruiters and peers to show your PM work.')
  })

  it('links to the encoded, trimmed portfolio URL in a new tab', () => {
    const el = render({ username: '  jane pm/x ' })
    const link = linkByText(el, 'View portfolio')
    expect(link.getAttribute('href')).toBe(`/p/${encodeURIComponent('jane pm/x')}`)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.querySelector('.sr-only')?.textContent).toBe(' (opens in a new tab)')
  })

  it('renders the client-only share control, inside the tracking wrapper, with the trimmed username', async () => {
    const el = render({ username: ' jane-pm ' })
    const wrapper = el.querySelector('[data-proof-card-share]')
    expect(wrapper).not.toBeNull()
    const share = await waitForShareButton(el)
    expect(share.getAttribute('data-username')).toBe('jane-pm')
    expect(wrapper!.contains(share)).toBe(true)
  })

  it('tracks view_portfolio on View click', () => {
    const el = render()
    click(linkByText(el, 'View portfolio'))
    expect(proofEvents()).toEqual([
      ['event', 'dashboard_proof_card_clicked', { action: 'view_portfolio', portfolio_state: 'public' }],
    ])
  })

  it('tracks share_portfolio exactly once per click inside the share wrapper', async () => {
    const el = render()
    click(await waitForShareButton(el))
    expect(proofEvents()).toEqual([
      ['event', 'dashboard_proof_card_clicked', { action: 'share_portfolio', portfolio_state: 'public' }],
    ])
  })
})

describe('PortfolioProofCard — private portfolio', () => {
  it('offers Publish portfolio, no share control, and tracks publish_portfolio', () => {
    const el = render({ username: 'jane-pm', isPortfolioPublic: false })
    expect(el.textContent).toContain('Private')
    expect(el.textContent).toContain('Your portfolio is private')
    expect(el.textContent).toContain('Publish it to share your capstones and progress with recruiters.')
    expect(el.querySelector('[data-testid="share-button"]')).toBeNull()
    expect(el.textContent).not.toContain('View portfolio')

    const link = linkByText(el, 'Publish portfolio')
    expect(link.getAttribute('href')).toBe('/settings?tab=portfolio')
    click(link)
    expect(proofEvents()).toEqual([
      ['event', 'dashboard_proof_card_clicked', { action: 'publish_portfolio', portfolio_state: 'private' }],
    ])
  })
})

describe('PortfolioProofCard — no portfolio', () => {
  it.each([null, '', '   '])('username %j offers Set up portfolio and tracks setup_portfolio', (username) => {
    const el = render({ username, isPortfolioPublic: true })
    expect(el.textContent).toContain('Not set up')
    expect(el.textContent).toContain('Set up your portfolio')
    expect(el.textContent).toContain('Choose a username to get a public PM portfolio link.')
    expect(el.querySelector('[data-testid="share-button"]')).toBeNull()

    const link = linkByText(el, 'Set up portfolio')
    expect(link.getAttribute('href')).toBe('/settings?tab=portfolio')
    click(link)
    expect(proofEvents()).toEqual([
      ['event', 'dashboard_proof_card_clicked', { action: 'setup_portfolio', portfolio_state: 'none' }],
    ])
  })
})

describe('PortfolioProofCard — certificate', () => {
  it('shows the earned state with a View certificate link', () => {
    const el = render({ hasCertificate: true })
    expect(el.textContent).toContain('Earned')
    expect(el.textContent).toContain('Certificate earned')
    expect(el.querySelector('[role="progressbar"]')).toBeNull()
    const link = linkByText(el, 'View certificate')
    expect(link.getAttribute('href')).toBe('/progress/certificates')
  })

  it('shows progress toward 90 lessons with an accessible progressbar', () => {
    const el = render({ completedLessons: 12, hasCertificate: false })
    const bar = el.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('12')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('90')
    expect(bar.getAttribute('aria-label')).toBeTruthy()
    expect(el.textContent).toContain('12 / 90 lessons')
    expect(el.textContent).toContain(
      'Complete all 90 lessons to earn a verifiable certificate you can add to LinkedIn.',
    )
    expect(linkByText(el, 'View certificates').getAttribute('href')).toBe('/progress/certificates')
  })

  it('keeps the In progress state at 89 lessons', () => {
    const el = render({ completedLessons: 89 })
    expect(el.textContent).toContain('In progress')
    expect(el.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('89')
    expect(el.textContent).toContain('89 / 90 lessons')
  })

  it.each([0, -3])('shows the Not started state for %d lessons with a 0 / 90 bar', (input) => {
    const el = render({ completedLessons: input, hasCertificate: false })
    expect(el.textContent).toContain('Not started')
    expect(el.textContent).not.toContain('In progress')
    const bar = el.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
    expect(el.textContent).toContain('0 / 90 lessons')
    expect(el.textContent).toContain(
      'Every lesson you finish counts toward a verifiable certificate you can add to LinkedIn.',
    )
    expect(linkByText(el, 'View certificates').getAttribute('href')).toBe('/progress/certificates')
  })

  it.each([90, 120])('shows the Ready state at %d lessons without a certificate row', (input) => {
    const el = render({ completedLessons: input, hasCertificate: false, username: 'jane-pm', isPortfolioPublic: false })
    expect(el.textContent).toContain('Ready')
    expect(el.textContent).toContain("You've completed all 90 lessons")
    expect(el.textContent).toContain('Claim your verifiable certificate and add it to LinkedIn.')
    expect(el.textContent).not.toContain('Complete all 90 lessons')
    expect(el.querySelector('[role="progressbar"]')).toBeNull()

    const link = linkByText(el, 'Claim certificate')
    expect(link.getAttribute('href')).toBe('/progress/certificates')
    click(link)
    expect(proofEvents()).toEqual([
      ['event', 'dashboard_proof_card_clicked', { action: 'view_certificates', portfolio_state: 'private' }],
    ])
  })

  it('prefers the earned state over Ready when a certificate row exists', () => {
    const el = render({ completedLessons: 90, hasCertificate: true })
    expect(el.textContent).toContain('Certificate earned')
    expect(el.textContent).not.toContain('Claim certificate')
  })

  it.each([
    ['public', { username: 'jane-pm', isPortfolioPublic: true }],
    ['private', { username: 'jane-pm', isPortfolioPublic: false }],
    ['none', { username: null, isPortfolioPublic: false }],
  ] as const)('certificates link tracks view_certificates with portfolio_state %s', (state, props) => {
    const el = render({ ...props, hasCertificate: false })
    click(linkByText(el, 'View certificates'))
    expect(proofEvents()).toEqual([
      ['event', 'dashboard_proof_card_clicked', { action: 'view_certificates', portfolio_state: state }],
    ])
  })

  it('earned certificate link also tracks view_certificates', () => {
    const el = render({ hasCertificate: true, username: 'jane-pm', isPortfolioPublic: true })
    click(linkByText(el, 'View certificate'))
    expect(proofEvents()).toEqual([
      ['event', 'dashboard_proof_card_clicked', { action: 'view_certificates', portfolio_state: 'public' }],
    ])
  })
})
