/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Growth R1 / Task 10: one celebration modal for a certificate, a published capstone and a
// Fellow grant. Only a certificate may offer LinkedIn's "add to profile"; analytics carry the
// kind and the action, never a certificate code, username or notification id.

const analytics = vi.hoisted(() => ({
  trackAchievementCelebrationViewed: vi.fn(),
  trackAchievementCelebrationCtaClicked: vi.fn(),
  // Used by the real ShareButton rendered inside the modal.
  trackPortfolioShareClicked: vi.fn(),
}))

// The global setup mocks `next/link` as children-only, which drops href. Render a real anchor.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/analytics', () => analytics)
// The real builder, wrapped so the Fellow tests can assert it was never called.
vi.mock('@/lib/certificates/linkedin-url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/certificates/linkedin-url')>()
  return { ...actual, buildLinkedInCertificationUrl: vi.fn(actual.buildLinkedInCertificationUrl) }
})

import { AchievementCelebrationModal } from '@/components/celebration/AchievementCelebrationModal'
import { buildLinkedInCertificationUrl } from '@/lib/certificates/linkedin-url'
import { PORTFOLIO_SETTINGS_HREF } from '@/lib/portfolio'
import type {
  AchievementCelebration,
  CapstoneCelebration,
  CelebrationPortfolio,
  CertificateCelebration,
  FellowCelebration,
} from '@/lib/api/contracts/achievement-celebration'

const CODE = 'PRD-2026-ABC123'
const USERNAME = 'jane_doe'
const VERIFY_URL = `https://prodily.example.test/verify/${CODE}`

const publicPortfolio: CelebrationPortfolio = { username: USERNAME, displayName: 'Jane Doe', isPublic: true }
const privatePortfolio: CelebrationPortfolio = { username: USERNAME, displayName: 'Jane Doe', isPublic: false }
const noUsernamePortfolio: CelebrationPortfolio = { username: null, displayName: null, isPublic: true }

function certificate(overrides: Partial<CertificateCelebration['certificate']> = {}): CertificateCelebration {
  return {
    kind: 'certificate',
    notificationId: 'ntf-certificate-1',
    portfolio: publicPortfolio,
    certificate: {
      code: CODE,
      type: 'full_curriculum',
      moduleSlug: null,
      moduleTitle: null,
      issuedAt: '2026-09-15T10:00:00.000Z',
      careerTitle: 'Associate Product Manager',
      verificationUrl: VERIFY_URL,
      ...overrides,
    },
  }
}

function capstone(portfolio: CelebrationPortfolio = publicPortfolio): CapstoneCelebration {
  return {
    kind: 'capstone',
    notificationId: 'ntf-capstone-1',
    portfolio,
    capstone: { moduleSlug: 'product-discovery', moduleTitle: 'Product Discovery' },
  }
}

function fellow(portfolio: CelebrationPortfolio = publicPortfolio): FellowCelebration {
  return { kind: 'fellow', notificationId: 'ntf-fellow-1', portfolio }
}

let container: HTMLDivElement
let root: Root
let onClose: ReturnType<typeof vi.fn<() => void>>

async function render(celebration: AchievementCelebration | null, opts: { strict?: boolean } = {}) {
  const tree = <AchievementCelebrationModal celebration={celebration} onClose={onClose} />
  await act(async () => {
    root.render(opts.strict ? <React.StrictMode>{tree}</React.StrictMode> : tree)
  })
}

// base-ui renders the dialog in a portal, so everything is queried from the body.
const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
const dialogText = () => dialog()?.textContent ?? ''
const linkByText = (text: string) =>
  Array.from(dialog()?.querySelectorAll('a') ?? []).find((a) => a.textContent?.trim() === text) ?? null
const shareGroup = () => dialog()?.querySelector('[aria-label="Share this portfolio"]') ?? null
const hrefs = () => Array.from(document.body.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')

/** Clicks inside act; the document listener keeps jsdom from attempting a real navigation. */
async function click(element: Element | null) {
  if (!element) throw new Error('element not found')
  const stopNavigation = (event: Event) => event.preventDefault()
  document.addEventListener('click', stopNavigation)
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  document.removeEventListener('click', stopNavigation)
}

beforeEach(() => {
  Object.values(analytics).forEach((fn) => fn.mockClear())
  vi.mocked(buildLinkedInCertificationUrl).mockClear()
  vi.spyOn(window, 'open').mockImplementation(() => null)
  onClose = vi.fn<() => void>()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('AchievementCelebrationModal — certificate', () => {
  it('links to LinkedIn add-to-profile in a new tab, labelled "Add to LinkedIn Profile"', async () => {
    await render(certificate())

    const link = linkByText('Add to LinkedIn Profile')
    expect(link).not.toBeNull()
    const href = link!.getAttribute('href') ?? ''
    expect(href).toContain('linkedin.com/profile/add')
    expect(href).toContain(`certId=${CODE}`)
    expect(href).toContain(encodeURIComponent(VERIFY_URL))
    expect(link!.getAttribute('target')).toBe('_blank')
    expect(link!.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('names and describes the dialog, and shows the career title', async () => {
    await render(certificate())

    const el = dialog()!
    const title = document.getElementById(el.getAttribute('aria-labelledby') ?? '')
    const description = document.getElementById(el.getAttribute('aria-describedby') ?? '')
    expect(title?.textContent).toBe('Certificate earned')
    expect(description?.textContent?.length).toBeGreaterThan(0)
    expect(dialogText()).toContain('Associate Product Manager')
  })

  it('offers a link to the certificates page that also closes the modal', async () => {
    await render(certificate())

    const link = linkByText('View certificate')
    expect(link?.getAttribute('href')).toBe('/progress/certificates')
    await click(link)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('uses module-credential copy for a module certificate', async () => {
    await render(certificate({ type: 'module', moduleSlug: 'product-discovery', moduleTitle: 'Product Discovery' }))

    const el = dialog()!
    expect(document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Module credential earned',
    )
    expect(dialogText()).toContain('Product Discovery')
    expect(dialogText()).not.toContain('Certificate earned')
    // Still a LinkedIn-eligible credential.
    expect(linkByText('Add to LinkedIn Profile')?.getAttribute('href')).toContain('linkedin.com/profile/add')
  })

  it('keeps module-credential copy when the module title is unknown', async () => {
    await render(certificate({ type: 'module', moduleSlug: null, moduleTitle: null }))

    expect(dialogText()).toContain('Module credential earned')
    expect(dialogText()).not.toContain('Certificate earned')
  })
})

describe('AchievementCelebrationModal — capstone', () => {
  it('shows the module and the share controls when the portfolio is public', async () => {
    await render(capstone(publicPortfolio))

    expect(dialogText()).toContain('Capstone published')
    expect(dialogText()).toContain('Product Discovery')
    expect(shareGroup()).not.toBeNull()
    expect(linkByText('Publish portfolio')).toBeNull()
  })

  it('links to portfolio settings when the portfolio is private', async () => {
    await render(capstone(privatePortfolio))

    expect(shareGroup()).toBeNull()
    expect(linkByText('Publish portfolio')?.getAttribute('href')).toBe(PORTFOLIO_SETTINGS_HREF)
  })

  it('links to portfolio settings when there is no username yet', async () => {
    await render(capstone(noUsernamePortfolio))

    expect(shareGroup()).toBeNull()
    expect(linkByText('Publish portfolio')?.getAttribute('href')).toBe(PORTFOLIO_SETTINGS_HREF)
  })
})

describe('AchievementCelebrationModal — fellow', () => {
  it.each([
    ['public', publicPortfolio],
    ['private', privatePortfolio],
  ])('never offers LinkedIn add-to-profile (%s portfolio)', async (_label, portfolio) => {
    await render(fellow(portfolio))

    expect(dialogText()).toContain("You're a PM Fellow")
    expect(document.body.innerHTML).not.toContain('profile/add')
    expect(hrefs().some((href) => href.includes('linkedin.com'))).toBe(false)
    expect(buildLinkedInCertificationUrl).not.toHaveBeenCalled()
  })

  it.each([
    ['public', publicPortfolio],
    ['private', privatePortfolio],
  ])('is never worded as a certificate or credential (%s portfolio)', async (_label, portfolio) => {
    await render(fellow(portfolio))

    expect(dialog()!.outerHTML).not.toMatch(/certif|credential/i)
  })

  it('shares a public portfolio and asks to publish a private one', async () => {
    await render(fellow(publicPortfolio))
    expect(shareGroup()).not.toBeNull()
    expect(linkByText('Publish portfolio')).toBeNull()

    await render(fellow(privatePortfolio))
    expect(shareGroup()).toBeNull()
    expect(linkByText('Publish portfolio')?.getAttribute('href')).toBe(PORTFOLIO_SETTINGS_HREF)
  })
})

describe('AchievementCelebrationModal — open state', () => {
  it('renders nothing for a null celebration', async () => {
    await render(null)

    expect(dialog()).toBeNull()
    expect(analytics.trackAchievementCelebrationViewed).not.toHaveBeenCalled()
  })

  it('renders no "Invite peers" control yet, even when onInvitePeers is passed', async () => {
    await act(async () => {
      root.render(
        <AchievementCelebrationModal celebration={capstone()} onClose={onClose} onInvitePeers={() => {}} />,
      )
    })

    expect(dialog()).not.toBeNull()
    expect(dialogText()).not.toMatch(/invite/i)
  })

  it('the close control calls onClose', async () => {
    await render(certificate())

    const close = Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Close')
    await click(close ?? null)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape calls onClose', async () => {
    await render(certificate())

    await act(async () => {
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('AchievementCelebrationModal — analytics', () => {
  it('tracks one view per notification id', async () => {
    await render(certificate())
    expect(analytics.trackAchievementCelebrationViewed).toHaveBeenCalledTimes(1)
    expect(analytics.trackAchievementCelebrationViewed).toHaveBeenCalledWith('certificate')

    // Same achievement, new object: a re-render is not a second view.
    await render(certificate())
    expect(analytics.trackAchievementCelebrationViewed).toHaveBeenCalledTimes(1)

    // Hidden and shown again (the host does this while Quick Start is open).
    await render(null)
    await render(certificate())
    expect(analytics.trackAchievementCelebrationViewed).toHaveBeenCalledTimes(1)

    await render(capstone())
    expect(analytics.trackAchievementCelebrationViewed).toHaveBeenCalledTimes(2)
    expect(analytics.trackAchievementCelebrationViewed).toHaveBeenLastCalledWith('capstone')
  })

  it('tracks one view under StrictMode', async () => {
    await render(fellow(), { strict: true })

    expect(analytics.trackAchievementCelebrationViewed).toHaveBeenCalledTimes(1)
    expect(analytics.trackAchievementCelebrationViewed).toHaveBeenCalledWith('fellow')
  })

  it('tracks add_to_linkedin on the certificate CTA', async () => {
    await render(certificate())
    await click(linkByText('Add to LinkedIn Profile'))

    expect(analytics.trackAchievementCelebrationCtaClicked).toHaveBeenCalledTimes(1)
    expect(analytics.trackAchievementCelebrationCtaClicked).toHaveBeenCalledWith('certificate', 'add_to_linkedin')
    // The LinkedIn tab opens beside the app; the celebration stays up.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('tracks share_portfolio when a share control is used, and nothing for a click between them', async () => {
    await render(capstone(publicPortfolio))

    await click(shareGroup())
    expect(analytics.trackAchievementCelebrationCtaClicked).not.toHaveBeenCalled()

    await click(dialog()!.querySelector('[aria-label="Share on LinkedIn (opens in a new window)"]'))
    expect(analytics.trackAchievementCelebrationCtaClicked).toHaveBeenCalledTimes(1)
    expect(analytics.trackAchievementCelebrationCtaClicked).toHaveBeenCalledWith('capstone', 'share_portfolio')
    // ShareButton keeps its own event.
    expect(analytics.trackPortfolioShareClicked).toHaveBeenCalledWith('linkedin')
  })

  it('tracks publish_portfolio and closes when the learner goes to publish', async () => {
    await render(fellow(privatePortfolio))
    await click(linkByText('Publish portfolio'))

    expect(analytics.trackAchievementCelebrationCtaClicked).toHaveBeenCalledTimes(1)
    expect(analytics.trackAchievementCelebrationCtaClicked).toHaveBeenCalledWith('fellow', 'publish_portfolio')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('never sends a certificate code, username or notification id', async () => {
    await render(certificate())
    await click(linkByText('Add to LinkedIn Profile'))
    await render(capstone(publicPortfolio))
    await click(dialog()!.querySelector('[aria-label="Share on LinkedIn (opens in a new window)"]'))
    await render(fellow(privatePortfolio))
    await click(linkByText('Publish portfolio'))

    const sent = JSON.stringify([
      ...analytics.trackAchievementCelebrationViewed.mock.calls,
      ...analytics.trackAchievementCelebrationCtaClicked.mock.calls,
    ])
    expect(analytics.trackAchievementCelebrationCtaClicked).toHaveBeenCalledTimes(3)
    expect(sent).not.toContain(CODE)
    expect(sent).not.toContain(USERNAME)
    expect(sent).not.toContain('ntf-')
  })
})
