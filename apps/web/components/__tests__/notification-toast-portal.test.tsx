/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The toast is mounted inside the Topbar <header>, whose backdrop-filter would become the
// containing block for `position: fixed`. It renders into <body> so it is placed against the
// viewport and stacks above the mobile tab bar.

import { NotificationToast } from '@/components/notifications/NotificationToast'
import { dispatchClientNotificationEvent } from '@/lib/events/client-event-bus'

let host: HTMLElement
let root: Root

const toast = () => document.body.querySelector<HTMLElement>('[data-testid="notification-toast"]')

beforeEach(() => {
  // Stands in for the Topbar header.
  host = document.createElement('header')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('NotificationToast — portal', () => {
  it('renders nothing until a notification event arrives', async () => {
    await act(async () => {
      root.render(<NotificationToast />)
    })
    expect(toast()).toBeNull()
    expect(host.childElementCount).toBe(0)
  })

  it('renders into document.body, not inside the component that owns it', async () => {
    await act(async () => {
      root.render(<NotificationToast />)
    })
    await act(async () => {
      dispatchClientNotificationEvent({ title: 'Lesson complete', body: 'Nice work.', variant: 'success' })
    })

    const el = toast()
    expect(el).not.toBeNull()
    expect(el!.parentElement).toBe(document.body)
    expect(host.contains(el)).toBe(false)
    expect(el!.getAttribute('role')).toBe('status')
    expect(el!.textContent).toContain('Lesson complete')
  })

  it('announces an error assertively and can be dismissed', async () => {
    await act(async () => {
      root.render(<NotificationToast />)
    })
    await act(async () => {
      dispatchClientNotificationEvent({ title: 'Could not save', body: 'Try again.', variant: 'error' })
    })

    const el = toast()
    expect(el!.getAttribute('role')).toBe('alert')

    await act(async () => {
      el!.querySelector<HTMLButtonElement>('button[aria-label="Dismiss toast"]')!.click()
    })
    expect(toast()).toBeNull()
  })

  it('is removed from the body when its owner unmounts', async () => {
    await act(async () => {
      root.render(<NotificationToast />)
    })
    await act(async () => {
      dispatchClientNotificationEvent({ title: 'Saved', body: 'Done.' })
    })
    expect(toast()).not.toBeNull()

    await act(async () => {
      root.render(null)
    })
    expect(toast()).toBeNull()
  })
})
