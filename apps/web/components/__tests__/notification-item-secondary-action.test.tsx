/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Growth R5 / B0: a notification's second action renders beside the card (never inside its link),
// and using it marks the notification read.

const analytics = vi.hoisted(() => ({ trackNotificationActionClicked: vi.fn() }))
vi.mock('@/lib/analytics', () => analytics)
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
// Render the share control synchronously as a stand-in that reports its props.
vi.mock('next/dynamic', () => ({
  default: () =>
    function ShareStub({ username, context }: { username: string; context?: string }) {
      return <span data-testid="share-stub" data-username={username} data-context={context} />
    },
}))

import { NotificationItemCard, type NotificationItem } from '@/components/notifications/NotificationItemCard'

const base: NotificationItem = {
  id: 'n1',
  userId: 'u1',
  title: 'You are now a PM Fellow!',
  body: 'Your badge is live.',
  category: 'achievements',
  isRead: false,
  deepLink: '/p/ada',
  createdAt: new Date().toISOString(),
}

let container: HTMLDivElement
let root: Root
let onMarkRead: ReturnType<typeof vi.fn<(id: string) => void>>

function render(item: NotificationItem) {
  act(() => {
    root.render(<NotificationItemCard item={item} onMarkRead={onMarkRead} />)
  })
}

const row = () => container.querySelector('[data-testid="notification-secondary-action"]')

beforeEach(() => {
  analytics.trackNotificationActionClicked.mockReset()
  onMarkRead = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('NotificationItemCard — secondary action', () => {
  it('renders no action row when there is none', () => {
    render(base)
    expect(row()).toBeNull()
  })

  it('renders a portfolio share outside the card link, with its context', () => {
    render({ ...base, secondaryAction: { kind: 'share_portfolio', label: 'Share', username: 'ada', context: 'fellow' } })

    const share = container.querySelector('[data-testid="share-stub"]')
    expect(share?.getAttribute('data-username')).toBe('ada')
    expect(share?.getAttribute('data-context')).toBe('fellow')
    expect(share?.closest('a')).toBeNull()
  })

  it('opens LinkedIn add-to-profile in a new tab and marks the notification read', () => {
    const url = 'https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME'
    render({ ...base, secondaryAction: { kind: 'linkedin_add_to_profile', label: 'Add to LinkedIn', url } })

    const link = row()!.querySelector('a')!
    expect(link.getAttribute('href')).toBe(url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')

    act(() => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onMarkRead).toHaveBeenCalledWith('n1')
    expect(analytics.trackNotificationActionClicked).toHaveBeenCalledWith('linkedin_add_to_profile')
  })

  it('renders an in-app link action', () => {
    render({ ...base, secondaryAction: { kind: 'link', label: 'Publish portfolio', href: '/settings?tab=portfolio' } })
    const link = row()!.querySelector('a')!
    expect(link.textContent).toBe('Publish portfolio')
    expect(link.getAttribute('href')).toBe('/settings?tab=portfolio')
  })
})
