/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Perf (zod/mini): the login, signup and reset-password client schemas moved from full
// zod to zod/mini. These real renders pin the exact inline messages a learner sees, so
// the switch cannot change copy or the order in which a field's errors win.

const routerStub = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }
const searchState = { params: new URLSearchParams('') }

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
  useSearchParams: () => searchState.params,
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
vi.mock('@/lib/supabase', () => ({ createBrowserSupabaseClient: vi.fn() }))
vi.mock('@/app/(auth)/reset-password/actions', () => ({ updatePasswordAction: vi.fn() }))

const apiPostMock = vi.fn()
vi.mock('@/lib/api/client', () => ({ apiPost: (...args: unknown[]) => apiPostMock(...args) }))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  apiPostMock.mockReset()
  searchState.params = new URLSearchParams('')
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(node: React.ReactNode) {
  act(() => {
    root.render(node)
  })
}

function setValue(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`no input ${selector}`)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit(index = 0) {
  const form = container.querySelectorAll('form')[index]
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

const text = () => container.textContent ?? ''

describe('login form messages', () => {
  it('shows the required messages for an empty submit', async () => {
    const LoginForm = (await import('@/app/(auth)/login/LoginForm')).default
    render(<LoginForm next={null} errorParam={null} verified={false} resetSuccess={false} />)
    await submit()
    expect(text()).toContain('Email is required.')
    expect(text()).toContain('Password is required.')
    expect(apiPostMock).not.toHaveBeenCalled()
  })

  it('shows the format and length messages for bad values', async () => {
    const LoginForm = (await import('@/app/(auth)/login/LoginForm')).default
    render(<LoginForm next={null} errorParam={null} verified={false} resetSuccess={false} />)
    setValue('input[name="email"]', 'not-an-email')
    setValue('input[name="password"]', '12345')
    await submit()
    expect(text()).toContain('Please enter a valid email address.')
    expect(text()).toContain('Password must be at least 6 characters.')
    expect(text()).not.toContain('Email is required.')
    expect(apiPostMock).not.toHaveBeenCalled()
  })
})

describe('signup form messages', () => {
  it('shows every required message for an empty submit', async () => {
    const SignupForm = (await import('@/app/(auth)/signup/SignupForm')).default
    render(<SignupForm />)
    await submit()
    expect(text()).toContain('Full name is required.')
    expect(text()).toContain('Email is required.')
    expect(text()).toContain('Password is required.')
    expect(text()).toContain('Please accept the Terms of Service and Privacy Policy to continue.')
    expect(text()).toMatch(/Please confirm you are at least \d+ years old to continue\./)
    expect(apiPostMock).not.toHaveBeenCalled()
  })

  it('shows the length and format messages for bad values', async () => {
    const SignupForm = (await import('@/app/(auth)/signup/SignupForm')).default
    render(<SignupForm />)
    setValue('input[name="name"]', 'A')
    setValue('input[name="email"]', 'a@b')
    setValue('input[name="password"]', 'short')
    await submit()
    expect(text()).toContain('Name must be at least 2 characters.')
    expect(text()).toContain('Please enter a valid email address.')
    expect(text()).toContain('Password must be at least 10 characters.')
  })

  it('shows the max-length message for a long name', async () => {
    const SignupForm = (await import('@/app/(auth)/signup/SignupForm')).default
    render(<SignupForm />)
    setValue('input[name="name"]', 'x'.repeat(81))
    await submit()
    expect(text()).toContain('Name must be less than 80 characters.')
  })
})

describe('reset-password form messages', () => {
  it('request mode: required then format message for the email', async () => {
    const ResetPasswordPage = (await import('@/app/(auth)/reset-password/page')).default
    render(<ResetPasswordPage />)
    await submit()
    expect(text()).toContain('Email is required.')

    setValue('input[name="email"]', 'nope')
    await submit()
    expect(text()).toContain('Please enter a valid email address.')
  })

  it('update mode: required, length and mismatch messages', async () => {
    searchState.params = new URLSearchParams('mode=update')
    const ResetPasswordPage = (await import('@/app/(auth)/reset-password/page')).default
    render(<ResetPasswordPage />)
    await submit()
    expect(text()).toContain('New password is required.')
    expect(text()).toContain('Please confirm your new password.')

    setValue('input[name="newPassword"]', 'short')
    setValue('input[name="confirmPassword"]', 'different')
    await submit()
    expect(text()).toContain('Password must be at least 10 characters.')
    expect(text()).toContain('Passwords do not match.')
  })
})

describe('client auth schemas use zod/mini', () => {
  it.each([
    'app/(auth)/login/LoginForm.tsx',
    'app/(auth)/signup/SignupForm.tsx',
    'app/(auth)/reset-password/page.tsx',
  ])('%s imports zod/mini, not full zod', (rel) => {
    const source = readFileSync(join(__dirname, '..', '..', rel), 'utf8')
    expect(source).toMatch(/from 'zod\/mini'/)
    expect(source).not.toMatch(/from 'zod'/)
  })
})
