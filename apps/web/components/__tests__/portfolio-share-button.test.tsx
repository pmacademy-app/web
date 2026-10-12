/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { ShareButton } from '@/components/portfolio/ShareButton'

/**
 * Public-portfolio share controls: LinkedIn / X intents, native share with an
 * AbortError guard, and copy-link fallback. Analytics rule: one click = one
 * `portfolio_share_clicked` event.
 */

// Tell React this is an act() environment, so it does not log a console.error per act()
// call. The hydration test asserts console.error stays silent.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SITE = 'https://portfolio.example.test'
const USERNAME = 'jane_doe'
const CANONICAL_URL = `${SITE}/p/${USERNAME}`

type GtagFn = (...args: unknown[]) => void
type ShareFn = (data?: ShareData) => Promise<void>
type WriteTextFn = (text: string) => Promise<void>

let root: Root | null = null
let container: HTMLDivElement | null = null
let gtag: ReturnType<typeof vi.fn<GtagFn>>
let openSpy: MockInstance<typeof window.open>
let writeText: ReturnType<typeof vi.fn<WriteTextFn>>

function render(element: React.ReactElement): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
  return container
}

/** Clicks and flushes the async handler (share / clipboard promises) inside act. */
async function click(element: Element | null) {
  if (!element) throw new Error('element not found')
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function byLabel(label: string) {
  return container!.querySelector(`[aria-label="${label}"]`)
}

function primaryButton() {
  return (
    Array.from(container!.querySelectorAll('button')).find((b) =>
      /Share Portfolio|Copy Link|Link Copied!|Copy failed/.test(b.textContent ?? ''),
    ) ?? null
  )
}

function liveRegion() {
  return container!.querySelector('[aria-live="polite"]')
}

function liveRegionText() {
  return liveRegion()?.textContent ?? ''
}

/** The read-only fallback field shown after a failed copy. */
function manualLink() {
  return container!.querySelector<HTMLInputElement>('input[readonly]')
}

/** A share() result that never settles, like some iOS Safari/WebView builds. */
function neverSettles(): Promise<void> {
  return new Promise<void>(() => {})
}

function setNavigatorProp(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
}

function trackedPlatforms(): string[] {
  return gtag.mock.calls
    .filter(([kind, name]) => kind === 'event' && name === 'portfolio_share_clicked')
    .map(([, , params]) => (params as { platform: string }).platform)
}

function openedUrl(): string {
  return String(openSpy.mock.calls[0][0])
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE)
  gtag = vi.fn<GtagFn>()
  window.gtag = gtag
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  writeText = vi.fn<WriteTextFn>(() => Promise.resolve())
  setNavigatorProp('clipboard', { writeText })
  setNavigatorProp('share', undefined)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  delete window.gtag
  delete (navigator as unknown as Record<string, unknown>).share
  delete (navigator as unknown as Record<string, unknown>).clipboard
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// Growth R4 / A5: owner-only Fellow wording. Fellow is a distinction, never a credential.
describe('ShareButton — fellow context', () => {
  it('announces the Fellow selection in the X text, with the canonical portfolio URL', async () => {
    render(<ShareButton username={USERNAME} name="Jane Doe" context="fellow" />)

    await click(byLabel('Share on X (opens in a new window)'))

    const url = new URL(openedUrl())
    expect(url.searchParams.get('url')).toBe(CANONICAL_URL)
    expect(url.searchParams.get('text')).toBe(
      'I was selected as a PM Fellow at Prodily PM Academy. Here is my Product Management portfolio:',
    )
  })

  it('keeps the LinkedIn intent to the portfolio URL only', async () => {
    render(<ShareButton username={USERNAME} name="Jane Doe" context="fellow" />)

    await click(byLabel('Share on LinkedIn (opens in a new window)'))

    expect(openedUrl()).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(CANONICAL_URL)}`)
  })

  it('never calls Fellow a certificate or credential, nor links to LinkedIn add-to-profile', async () => {
    const el = render(<ShareButton username={USERNAME} name="Jane Doe" context="fellow" />)

    await click(byLabel('Share on X (opens in a new window)'))
    await click(byLabel('Share on LinkedIn (opens in a new window)'))

    const everything = [el.innerHTML, ...openSpy.mock.calls.map((call) => String(call[0]))].join(' ')
    expect(decodeURIComponent(everything)).not.toMatch(/certif|credential|profile\/add/i)
  })
})

describe('ShareButton — social intents', () => {
  it('opens the LinkedIn share-offsite intent with the canonical portfolio URL', async () => {
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    await click(byLabel('Share on LinkedIn (opens in a new window)'))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const [url, target, features] = openSpy.mock.calls[0]
    expect(url).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(CANONICAL_URL)}`,
    )
    expect(target).toBe('_blank')
    expect(features).toContain('noopener')
    expect(trackedPlatforms()).toEqual(['linkedin'])
  })

  it('opens the X tweet intent with neutral, always-true text and the canonical URL', async () => {
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    await click(byLabel('Share on X (opens in a new window)'))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const url = new URL(openedUrl())
    expect(url.origin + url.pathname).toBe('https://twitter.com/intent/tweet')
    expect(url.searchParams.get('url')).toBe(CANONICAL_URL)
    const text = url.searchParams.get('text') ?? ''
    expect(text).toBe("Jane Doe's Product Management portfolio on Prodily PM Academy")
    expect(text).not.toMatch(/\bmy\b/i)
    // Encoded on the wire, not just parseable.
    expect(openedUrl()).toContain(`url=${encodeURIComponent(CANONICAL_URL)}`)
    expect(trackedPlatforms()).toEqual(['x'])
  })

  it('encodes display names containing &, # and apostrophes so they cannot break the intent URL', async () => {
    const trickyName = "Ana & Bo's #1"
    render(<ShareButton username={USERNAME} name={trickyName} />)

    await click(byLabel('Share on X (opens in a new window)'))

    const raw = openedUrl()
    const expectedText = `${trickyName}'s Product Management portfolio on Prodily PM Academy`
    expect(raw).toContain(`text=${encodeURIComponent(expectedText)}&url=`)
    // No raw & or # leaked from the name into the query string.
    expect(raw).not.toContain('Ana &')
    expect(raw).not.toContain('#1')
    const url = new URL(raw)
    expect(url.searchParams.get('text')).toBe(expectedText)
    expect(url.searchParams.get('url')).toBe(CANONICAL_URL)
  })

  it('falls back to the username when no display name is given', async () => {
    render(<ShareButton username={USERNAME} />)

    await click(byLabel('Share on X (opens in a new window)'))

    const url = new URL(openedUrl())
    expect(url.searchParams.get('text')).toContain(`${USERNAME}'s Product Management portfolio`)
  })
})

describe('ShareButton — primary action', () => {
  it('without native share: labelled "Copy Link", copies the canonical URL, shows and announces success', async () => {
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    expect(primaryButton()?.textContent).toContain('Copy Link')
    // No standalone copy icon when the primary action already copies.
    expect(byLabel('Copy portfolio link')).toBeNull()

    await click(primaryButton())

    expect(writeText).toHaveBeenCalledWith(CANONICAL_URL)
    expect(primaryButton()?.textContent).toContain('Link Copied!')
    expect(liveRegionText()).toBe('Portfolio link copied to clipboard')
    expect(manualLink()).toBeNull()
    expect(trackedPlatforms()).toEqual(['copy'])
  })

  it('shows a visible failure, the selectable URL and an announcement when copy fails, without tracking', async () => {
    writeText.mockImplementation(() => Promise.reject(new Error('denied')))
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    await click(primaryButton())

    const primary = primaryButton()
    expect(primary?.textContent).toContain('Copy failed')
    expect(primary?.getAttribute('title')).toBe(CANONICAL_URL)
    const field = manualLink()
    expect(field?.value).toBe(CANONICAL_URL)
    // The visible "Copy this link:" label is programmatically tied to the field.
    const label = container!.querySelector(`label[for="${field?.id}"]`)
    expect(field?.id).toBeTruthy()
    expect(label?.textContent).toBe('Copy this link:')
    expect(liveRegionText()).toMatch(/Could not copy the link/)
    expect(trackedPlatforms()).toEqual([])

    // The manual link disappears again after a successful copy.
    writeText.mockImplementation(() => Promise.resolve())
    await click(primaryButton())
    expect(manualLink()).toBeNull()
    expect(primaryButton()?.textContent).toContain('Link Copied!')
    expect(trackedPlatforms()).toEqual(['copy'])
  })

  it('with native share: labelled "Share Portfolio"; cancelling the sheet (AbortError) does nothing further', async () => {
    const share = vi.fn<ShareFn>(() =>
      Promise.reject(new DOMException('Share canceled', 'AbortError')),
    )
    setNavigatorProp('share', share)
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    expect(primaryButton()?.textContent).toContain('Share Portfolio')

    await click(primaryButton())

    expect(share).toHaveBeenCalledTimes(1)
    expect(share.mock.calls[0][0]).toMatchObject({
      url: CANONICAL_URL,
      text: "Jane Doe's Product Management portfolio on Prodily PM Academy",
    })
    expect(writeText).not.toHaveBeenCalled()
    expect(primaryButton()?.textContent).toContain('Share Portfolio')
    expect(trackedPlatforms()).toEqual(['native'])
  })

  it('falls back to copying on a non-abort share failure, emitting only the one native event', async () => {
    const share = vi.fn<ShareFn>(() =>
      Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
    )
    setNavigatorProp('share', share)
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    await click(primaryButton())

    expect(share).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(CANONICAL_URL)
    expect(primaryButton()?.textContent).toContain('Link Copied!')
    expect(trackedPlatforms()).toEqual(['native'])
  })

  it('treats a second click during an open share (InvalidStateError) as a no-op: no copy, one event', async () => {
    let resolveFirst: () => void = () => {}
    const share = vi
      .fn<ShareFn>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(() =>
        Promise.reject(new DOMException('A share is already in progress', 'InvalidStateError')),
      )
    setNavigatorProp('share', share)
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    await click(primaryButton())
    await click(primaryButton())

    expect(share).toHaveBeenCalledTimes(2)
    expect(writeText).not.toHaveBeenCalled()
    // Nothing is tracked until the first share settles.
    expect(trackedPlatforms()).toEqual([])

    await act(async () => {
      resolveFirst()
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(trackedPlatforms()).toEqual(['native'])
  })

  it('never locks: a share that never settles does not block the next click', async () => {
    const share = vi.fn<ShareFn>(() => neverSettles())
    setNavigatorProp('share', share)
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    await click(primaryButton())
    await click(primaryButton())

    expect(share).toHaveBeenCalledTimes(2)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('re-announces a repeated "copied" message in the live region', async () => {
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    await click(primaryButton())
    const first = liveRegion()?.firstElementChild
    expect(first?.textContent).toBe('Portfolio link copied to clipboard')

    await click(primaryButton())
    const second = liveRegion()?.firstElementChild
    expect(second?.textContent).toBe('Portfolio link copied to clipboard')
    // A fresh node (not the same one with unchanged text) is what makes screen readers speak again.
    expect(second).not.toBe(first)
    expect(first?.isConnected).toBe(false)
  })

  it('keeps a separate copy-link control when native share is available', async () => {
    setNavigatorProp('share', vi.fn<ShareFn>(() => Promise.resolve()))
    render(<ShareButton username={USERNAME} name="Jane Doe" />)

    await click(byLabel('Copy portfolio link'))

    expect(writeText).toHaveBeenCalledWith(CANONICAL_URL)
    expect(trackedPlatforms()).toEqual(['copy'])
  })
})

describe('ShareButton — hydration', () => {
  it('hydrates server HTML without a mismatch, then reveals native share controls', async () => {
    setNavigatorProp('share', vi.fn<ShareFn>(() => Promise.resolve()))
    const element = <ShareButton username={USERNAME} name="Jane Doe" />

    // The server snapshot reports no native share, whatever the environment says.
    const html = renderToString(element)
    expect(html).toContain('Copy Link')
    expect(html).not.toContain('Copy portfolio link')

    container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recoverableErrors: unknown[] = []

    await act(async () => {
      root = hydrateRoot(container!, element, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
    })

    expect(recoverableErrors).toEqual([])
    expect(consoleError).not.toHaveBeenCalled()
    expect(primaryButton()?.textContent).toContain('Share Portfolio')
    expect(byLabel('Copy portfolio link')).not.toBeNull()
  })
})

// Growth R5 / B13b: a capstone page shares its own URL with third-person text.
describe('ShareButton — capstone context', () => {
  it('shares the capstone page, not the portfolio, with a visitor-safe text', async () => {
    render(
      <ShareButton
        username={USERNAME}
        name="Jane Doe"
        context="capstone"
        capstone={{ moduleSlug: 'discovery', title: 'Problem Discovery Brief' }}
      />,
    )

    await click(byLabel('Share on X (opens in a new window)'))

    const url = new URL(openedUrl())
    expect(url.searchParams.get('url')).toBe(`${CANONICAL_URL}/capstones/discovery`)
    expect(url.searchParams.get('text')).toBe(
      'Jane Doe\'s "Problem Discovery Brief" product management case study on Prodily PM Academy',
    )
    expect(url.searchParams.get('text')).not.toMatch(/\bmy\b/i)
  })
})
