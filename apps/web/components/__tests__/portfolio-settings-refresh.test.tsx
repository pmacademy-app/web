/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const refresh = vi.fn()
const mutate = vi.fn()
const apiPost = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, prefetch: vi.fn() }),
  usePathname: () => '/settings',
}))

vi.mock('@/lib/api/hooks', () => ({
  useApiQuery: () => ({
    data: {
      settings: {
        username: 'ada',
        name: 'Ada Lovelace',
        bio: '',
        avatarUrl: '',
        linkedinUrl: '',
        githubUrl: '',
        websiteUrl: '',
        isPortfolioPublic: false,
        portfolioLayout: ['hero', 'radar', 'capstones', 'progress', 'achievements'],
        featuredCapstoneId: null,
        portfolioViewCount: 0,
        verificationOverride: null,
      },
      submittedCapstones: [],
    },
    isLoading: false,
    mutate,
  }),
}))

vi.mock('@/lib/api/client', () => ({
  apiPost: (...args: unknown[]) => apiPost(...args),
}))

vi.mock('@/lib/analytics', () => ({
  trackPortfolioLayoutUpdated: vi.fn(),
  trackPortfolioFeaturedCapstoneSet: vi.fn(),
}))

vi.mock('@/lib/events/client-event-bus', () => ({
  showClientToast: vi.fn(),
}))

// Child cards fetch or upload on their own; the save path under test never touches them.
vi.mock('@/components/settings/PortfolioReadinessCard', () => ({ PortfolioReadinessCard: () => null }))
vi.mock('@/components/settings/PortfolioVerificationCard', () => ({ PortfolioVerificationCard: () => null }))
vi.mock('@/components/settings/FellowRequestCard', () => ({ FellowRequestCard: () => null }))
vi.mock('@/components/profile/AvatarUpload', () => ({ AvatarUpload: () => null }))

import { PortfolioSettingsForm } from '@/components/settings/PortfolioSettingsForm'

let root: Root | null = null
let container: HTMLDivElement | null = null

function renderForm(): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(<PortfolioSettingsForm />)
  })
  return container
}

async function submit(el: HTMLElement) {
  const form = el.querySelector('form')
  expect(form).not.toBeNull()
  await act(async () => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  refresh.mockClear()
  mutate.mockClear()
  apiPost.mockReset()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('PortfolioSettingsForm — layout refresh after save', () => {
  it('refreshes the server layout exactly once when the save succeeds', async () => {
    apiPost.mockResolvedValue({ ok: true, data: { settings: { isPortfolioPublic: true } }, status: 200 })
    const el = renderForm()

    await submit(el)

    expect(apiPost).toHaveBeenCalledTimes(1)
    expect(apiPost.mock.calls[0][0]).toBe('/api/settings/portfolio')
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the save is rejected', async () => {
    apiPost.mockResolvedValue({ ok: false, error: { message: 'Username is taken' } })
    const el = renderForm()

    await submit(el)

    expect(apiPost).toHaveBeenCalledTimes(1)
    expect(mutate).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})
