/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import fs from 'fs'
import path from 'path'
import { useUsageTimeTracker, resetUsageTimeTrackerState } from '../../hooks/useUsageTimeTracker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// CQ-09: the tracker must call the caller's latest prompt callback, not the one captured on
// the first render, without suppressing react-hooks/exhaustive-deps.

const HOOK_PATH = path.resolve(__dirname, '../../hooks/useUsageTimeTracker.ts')
const LEGACY_COPY_PATH = path.resolve(__dirname, '../hooks/useUsageTimeTracker.ts')

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

function Harness({ onPrompt }: { onPrompt: (key: string) => void }) {
  useUsageTimeTracker({ onPromptTriggered: onPrompt })
  return null
}

function render(onPrompt: (key: string) => void) {
  act(() => {
    root.render(React.createElement(Harness, { onPrompt }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  resetUsageTimeTrackerState()
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return new Response(
        JSON.stringify({ success: true, completedPrompts: [], eligiblePrompts: ['usage_1hr'] }),
        { status: 200 }
      )
    }
    return new Response(JSON.stringify({ success: true, completedPrompts: [], eligiblePrompts: [] }), {
      status: 200,
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('CQ-09 useUsageTimeTracker', () => {
  it('calls the latest prompt callback after the parent re-renders with a new one', async () => {
    const first = vi.fn()
    const second = vi.fn()

    render(first)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    render(second)
    await act(async () => {
      window.dispatchEvent(new Event('learner:feedback:sync'))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(true)
    expect(second).toHaveBeenCalledWith('usage_1hr')
    expect(first).not.toHaveBeenCalled()
  })

  it('does not call the callback after unmount', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ success: true, completedPrompts: [], eligiblePrompts: ['usage_1hr'] }), {
          status: 200,
        })
    )
    const onPrompt = vi.fn()
    render(onPrompt)
    act(() => root.unmount())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(onPrompt).not.toHaveBeenCalled()
    root = createRoot(container)
  })

  it('has no eslint-disable in the canonical hook', () => {
    const source = fs.readFileSync(HOOK_PATH, 'utf8')
    expect(source).not.toMatch(/eslint-disable/)
  })

  it('has no duplicate re-export under lib/hooks', () => {
    expect(fs.existsSync(LEGACY_COPY_PATH)).toBe(false)
  })
})
