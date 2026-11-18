/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Perf plan item 7: the marketing CTA reads a readable `prodily_signed_in=1` hint cookie and
// asks `/api/auth/session` only when it is present, so signed-out visitors make no call.

const api = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/lib/api/client', () => api)

import { useSessionCta, hasSignedInHint, SIGNED_IN_HINT_COOKIE } from '@/hooks/use-session-cta'
import { SIGNED_IN_HINT_COOKIE as SERVER_HINT_COOKIE } from '@/lib/auth/session-cookies'

let container: HTMLDivElement
let root: Root
let seen: boolean[] = []

function Probe() {
  const { authenticated } = useSessionCta()
  React.useEffect(() => {
    seen.push(authenticated)
  })
  return <span data-testid="cta">{authenticated ? 'dashboard' : 'signup'}</span>
}

function setHint() {
  document.cookie = `${SIGNED_IN_HINT_COOKIE}=1; path=/`
}

function clearAllCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`
  }
}

async function mount() {
  await act(async () => {
    root.render(<Probe />)
  })
  // Let the shared request settle.
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  seen = []
  api.apiGet.mockReset()
  clearAllCookies()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  clearAllCookies()
})

describe('useSessionCta', () => {
  it('uses the same cookie name the server writes', () => {
    expect(SIGNED_IN_HINT_COOKIE).toBe(SERVER_HINT_COOKIE)
  })

  it('makes no request and stays signed out when the hint cookie is absent', async () => {
    await mount()
    expect(api.apiGet).not.toHaveBeenCalled()
    expect(container.textContent).toBe('signup')
  })

  it('ignores other cookies and a hint with a different value', async () => {
    document.cookie = 'other=1; path=/'
    document.cookie = `${SIGNED_IN_HINT_COOKIE}=0; path=/`
    expect(hasSignedInHint()).toBe(false)
    await mount()
    expect(api.apiGet).not.toHaveBeenCalled()
  })

  it('confirms with the session route when the hint is present', async () => {
    setHint()
    api.apiGet.mockResolvedValue({ ok: true, data: { authenticated: true }, status: 200 })
    await mount()
    expect(api.apiGet).toHaveBeenCalledTimes(1)
    expect(api.apiGet).toHaveBeenCalledWith('/api/auth/session', { cache: 'no-store' })
    expect(container.textContent).toBe('dashboard')
    // The first render matches the server HTML.
    expect(seen[0]).toBe(false)
    expect(hasSignedInHint()).toBe(true)
  })

  it('clears a stale hint when the route says signed out, so the next view makes no call', async () => {
    setHint()
    api.apiGet.mockResolvedValue({ ok: true, data: { authenticated: false }, status: 200 })
    await mount()
    expect(container.textContent).toBe('signup')
    expect(hasSignedInHint()).toBe(false)
  })

  it('keeps the hint on a failed request (a network blip is not a sign-out)', async () => {
    setHint()
    api.apiGet.mockResolvedValue({ ok: false, error: { kind: 'network' } })
    await mount()
    expect(container.textContent).toBe('signup')
    expect(hasSignedInHint()).toBe(true)
  })
})
