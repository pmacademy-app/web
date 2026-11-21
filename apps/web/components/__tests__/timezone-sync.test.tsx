/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import fs from 'node:fs'
import path from 'node:path'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const apiPost = vi.fn(async () => ({ ok: true, data: { success: true } }))
vi.mock('@/lib/api/client', () => ({ apiPost: (...a: unknown[]) => apiPost(...(a as [])) }))

import TimezoneSync from '@/components/layout/TimezoneSync'

let root: Root | null = null
let el: HTMLDivElement | null = null
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone

function mount(stored: string | null) {
  el = document.createElement('div')
  root = createRoot(el)
  act(() => root!.render(<TimezoneSync storedTimezone={stored} />))
}

beforeEach(() => {
  apiPost.mockClear()
  sessionStorage.clear()
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  el = null
})

describe('TimezoneSync', () => {
  it('saves the browser timezone when the stored one differs', () => {
    mount('Not/AZone')
    expect(apiPost).toHaveBeenCalledWith('/api/streaks/timezone', { timezone: browserTz })
  })

  it('does nothing when the stored timezone already matches', () => {
    mount(browserTz)
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('tries only once per tab session for the same zone', () => {
    mount('Not/AZone')
    act(() => root?.unmount())
    mount('Not/AZone')
    expect(apiPost).toHaveBeenCalledTimes(1)
  })

  it('is mounted in the authenticated layout, and the route is rate limited', () => {
    const root = path.resolve(__dirname, '../..')
    expect(fs.readFileSync(path.join(root, 'app/(app)/layout.tsx'), 'utf8')).toContain('<TimezoneSync storedTimezone={profile?.timezone} />')
    expect(fs.readFileSync(path.join(root, 'app/api/streaks/timezone/route.ts'), 'utf8')).toMatch(/rateLimit:\s*\[/)
  })
})
