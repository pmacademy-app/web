/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Growth R1 / Task 11: the referral modal reports which surface opened it. Existing callers pass
// no source and keep reporting 'modal'.

const analytics = vi.hoisted(() => ({
  trackReferralModalOpened: vi.fn(),
  trackReferralLinkCopied: vi.fn(),
  trackReferralShared: vi.fn(),
}))
vi.mock('@/lib/analytics', () => analytics)

import { ReferralShareModal } from '@/components/referral/ReferralShareModal'

const LINK = 'https://prodily.example.test/signup?ref=JANE42'

let container: HTMLDivElement
let root: Root

async function render(isOpen: boolean, source?: string) {
  await act(async () => {
    root.render(<ReferralShareModal isOpen={isOpen} onClose={() => {}} referralLink={LINK} source={source} />)
  })
}

async function copy() {
  const control = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Copy')
  if (!control) throw new Error('no Copy control')
  await act(async () => {
    control.click()
  })
}

beforeEach(() => {
  Object.values(analytics).forEach((fn) => fn.mockReset())
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ReferralShareModal — source', () => {
  it("defaults to 'modal' for the open event and the copy channel", async () => {
    await render(true)
    expect(analytics.trackReferralModalOpened).toHaveBeenCalledWith('modal')

    await copy()
    expect(analytics.trackReferralLinkCopied).toHaveBeenCalledWith('modal')
  })

  it('passes a given source to both events', async () => {
    await render(true, 'fellow_celebration')
    await copy()

    expect(analytics.trackReferralModalOpened).toHaveBeenCalledWith('fellow_celebration')
    expect(analytics.trackReferralLinkCopied).toHaveBeenCalledWith('fellow_celebration')
  })

  it('tracks one open per open, not per render, and nothing while closed', async () => {
    await render(false)
    expect(analytics.trackReferralModalOpened).not.toHaveBeenCalled()

    await render(true)
    await render(true)
    expect(analytics.trackReferralModalOpened).toHaveBeenCalledTimes(1)

    await render(false)
    await render(true)
    expect(analytics.trackReferralModalOpened).toHaveBeenCalledTimes(2)
  })

  it('is a named dialog that closes on Escape', async () => {
    const onClose = vi.fn()
    await act(async () => {
      root.render(<ReferralShareModal isOpen onClose={onClose} referralLink={LINK} source="fellow_celebration" />)
    })

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    const title = document.getElementById(dialog!.getAttribute('aria-labelledby') ?? '')
    expect(title?.textContent).toMatch(/Invite Peers/)

    await act(async () => {
      dialog!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sends only the source, never the link', async () => {
    await render(true, 'fellow_celebration')
    await copy()

    const sent = JSON.stringify([
      ...analytics.trackReferralModalOpened.mock.calls,
      ...analytics.trackReferralLinkCopied.mock.calls,
    ])
    expect(sent).not.toContain('JANE42')
  })
})
