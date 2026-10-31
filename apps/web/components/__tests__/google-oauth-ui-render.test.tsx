/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Google OAuth T5 fix round: real renders of the signup Google gating and the
// "Managed by Google" settings note, instead of source-string checks only.

const routerStub = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/',
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt} />,
}))
vi.mock('@/components/auth/TurnstileWidget', () => ({
  TurnstileWidget: () => <div data-testid="turnstile-stub" />,
}))
vi.mock('@/components/referral/ReferralBadge', () => ({ ReferralBadge: () => null }))
vi.mock('@/components/auth/ResendVerificationCard', () => ({ ResendVerificationCard: () => null }))
vi.mock('@/lib/analytics', () => ({ trackReferralSignupCompleted: vi.fn() }))
vi.mock('@/lib/auth/telemetry', () => ({ recordAuthTelemetry: vi.fn() }))

const logoutMock = vi.fn(async () => ({ ok: true, failures: [] }))
vi.mock('@/lib/auth/logout', () => ({
  LEARNER_LOGIN_PATH: '/login',
  logout: (...args: unknown[]) => logoutMock(...(args as [])),
}))

const securityState: { data: Record<string, unknown> | undefined } = { data: undefined }
vi.mock('@/lib/api/hooks', () => ({
  useApiQuery: () => ({ data: securityState.data, isLoading: false, mutate: vi.fn(), error: undefined }),
}))
vi.mock('@/hooks/use-dirty-form-guard', () => ({ useDirtyFormGuard: () => undefined }))
vi.mock('@/lib/events/client-event-bus', () => ({ showClientToast: vi.fn() }))

let container: HTMLDivElement
let root: Root

function render(node: React.ReactNode) {
  act(() => {
    root.render(node)
  })
}

function click(el: Element) {
  act(() => {
    ;(el as HTMLElement).click()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  logoutMock.mockClear()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllEnvs()
})

async function loadSignupPage(flag: string) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH_ENABLED', flag)
  return (await import('@/app/(auth)/signup/SignupForm')).default
}

const googleLink = () =>
  Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Continue with Google'))

describe('signup: Google button follows both consent boxes', () => {
  it('stays disabled until both boxes are ticked, and disables again when one is cleared', async () => {
    const SignupPage = await loadSignupPage('true')
    render(<SignupPage />)

    const terms = container.querySelector<HTMLInputElement>('#signup-accept-terms')!
    const age = container.querySelector<HTMLInputElement>('#signup-confirm-age')!
    expect(terms.checked).toBe(false)
    expect(age.checked).toBe(false)

    let button = googleLink()!
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.hasAttribute('href')).toBe(false)
    // Still reachable by keyboard, and it says why it is unavailable.
    expect(button.getAttribute('tabindex')).toBe('0')
    const hintId = button.getAttribute('aria-describedby')
    expect(hintId).toBe('google-consent-hint')
    expect(container.querySelector(`#${hintId}`)?.textContent).toContain('Tick both boxes')

    click(terms)
    button = googleLink()!
    expect(button.getAttribute('aria-disabled')).toBe('true')

    click(age)
    button = googleLink()!
    expect(button.hasAttribute('aria-disabled')).toBe(false)
    expect(button.getAttribute('href')).toBe('/api/auth/google?terms=1&age=1')
    expect(button.hasAttribute('aria-describedby')).toBe(false)

    click(terms)
    button = googleLink()!
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })

  it('a disabled Google link does not navigate when clicked', async () => {
    const SignupPage = await loadSignupPage('true')
    render(<SignupPage />)
    const button = googleLink()!
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    act(() => {
      button.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('a failed email submit focuses Name, not the consent boxes rendered above it', async () => {
    const SignupPage = await loadSignupPage('true')
    render(<SignupPage />)
    const form = container.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    // Validation resolves asynchronously; let it settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(document.activeElement?.id).toBe('signup-name')
  })

  it('with the flag off there is no Google button and consent sits inside the form', async () => {
    const SignupPage = await loadSignupPage('false')
    render(<SignupPage />)
    expect(googleLink()).toBeUndefined()
    const form = container.querySelector('form')!
    expect(form.querySelector('#signup-accept-terms')).not.toBeNull()
  })
})

describe('Security settings: Google-only accounts', () => {
  async function renderTab() {
    const { SecuritySettingsTab } = await import('@/components/settings/SecuritySettingsTab')
    render(<SecuritySettingsTab />)
  }

  it('shows "Managed by Google" on both cards when hasPassword is false', async () => {
    securityState.data = { success: true, email: 'learner@example.com', hasPassword: false }
    await renderTab()
    const notes = container.querySelectorAll('[role="note"]')
    expect(notes).toHaveLength(2)
    expect(notes[0].textContent).toContain('Managed by Google')
    expect(notes[0].textContent).toContain('learner@example.com')
    // Forms are kept.
    expect(container.textContent).toContain('Update Password')
    expect(container.textContent).toContain('Send Confirmation Link')
  })

  it('the set-password action logs out and lands on the reset page', async () => {
    securityState.data = { success: true, email: 'learner@example.com', hasPassword: false }
    await renderTab()
    const action = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Log out and set a password')
    )!
    await act(async () => {
      action.click()
    })
    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(logoutMock.mock.calls[0]).toEqual([routerStub, { redirectTo: '/reset-password' }])
  })

  it.each([
    ['true', { success: true, email: 'a@example.com', hasPassword: true }],
    ['missing (older server)', { success: true, email: 'a@example.com' }],
  ])('shows no note when hasPassword is %s', async (_label, data) => {
    securityState.data = data
    await renderTab()
    expect(container.querySelectorAll('[role="note"]')).toHaveLength(0)
  })
})
