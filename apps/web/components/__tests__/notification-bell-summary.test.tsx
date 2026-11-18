/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Performance plan 2026-11-18, item 10: the bell polls the summary mode (one unread head
// count), not the full list.

const swr = vi.hoisted(() => ({
  useApiQuery: vi.fn(() => ({ data: { success: true, unreadCount: 3 }, mutate: vi.fn() })),
}))

vi.mock('@/lib/api/hooks', () => ({ useApiQuery: swr.useApiQuery }))
vi.mock('@/components/notifications/NotificationCenterDrawer', () => ({ NotificationCenterDrawer: () => null }))

import { NotificationBell } from '@/components/notifications/NotificationBell'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('NotificationBell', () => {
  it('polls the summary mode and shows its unread count', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(<NotificationBell />))

    expect(swr.useApiQuery).toHaveBeenCalled()
    expect(swr.useApiQuery.mock.calls.every((call) => (call as unknown[])[0] === '/api/notifications?summary=1')).toBe(true)
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Notifications (3 unread updates)')
  })
})
