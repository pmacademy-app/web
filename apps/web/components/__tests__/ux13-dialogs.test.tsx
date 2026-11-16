/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { ConfirmDestructiveAction } from '../settings/ConfirmDestructiveAction'
import { NotificationCenterDrawer } from '../notifications/NotificationCenterDrawer'
import { AdminModal } from '../admin/AdminModal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/api/client', () => ({
  apiGet: vi.fn().mockResolvedValue({ ok: true, data: { notifications: [] } }),
  apiPatch: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
  apiPost: vi.fn().mockResolvedValue({ ok: true, data: { success: true } }),
}))

describe('UX-13 / AG-20: Accessible Dialogs and Drawers via base-ui', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it('renders a learner modal (ConfirmDestructiveAction) with accessible name and role="dialog"', async () => {
    const handleClose = vi.fn()
    const handleConfirm = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      root.render(
        <ConfirmDestructiveAction
          isOpen={true}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title="Delete Account Confirmation"
          description="Permanent action notice."
          plainLanguageLossSummary="All your progress and badges will be lost."
          confirmationKeyword="DELETE"
          confirmButtonText="Delete My Account"
        />
      )
    })

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.textContent).toContain('Delete Account Confirmation')
    expect(dialog?.textContent).toContain('Permanent action notice.')
  })

  it('renders a drawer component (NotificationCenterDrawer) with accessible name and role="dialog"', async () => {
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        <NotificationCenterDrawer
          isOpen={true}
          onClose={handleClose}
        />
      )
    })

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.textContent).toContain('Notifications')
  })

  it('renders an admin modal (AdminModal) with accessible name and role="dialog"', async () => {
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        <AdminModal
          open={true}
          onClose={handleClose}
          title="Module Archive Warning"
          description="Archiving will hide this module."
        >
          <div data-testid="admin-child">Module content to archive</div>
        </AdminModal>
      )
    })

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.textContent).toContain('Module Archive Warning')
    expect(dialog?.textContent).toContain('Archiving will hide this module.')
    expect(dialog?.textContent).toContain('Module content to archive')
  })
})
