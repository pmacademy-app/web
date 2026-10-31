/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  useCapstoneAutosave,
  capstoneDraftStorageKey,
} from '../../hooks/useCapstoneAutosave'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// CQ-08: capstone autosave must not lose the last debounce window of typing, must keep its
// state updater pure, and must scope the local backup to the signed-in learner.

type HookResult = ReturnType<typeof useCapstoneAutosave>
type HookProps = Parameters<typeof useCapstoneAutosave>[0]

let container: HTMLDivElement
let root: Root
let latest: HookResult
let fetchMock: ReturnType<typeof vi.fn>

function Harness(props: HookProps) {
  const result = useCapstoneAutosave(props)
  React.useLayoutEffect(() => {
    latest = result
  })
  return null
}

function render(props: HookProps, strict = false) {
  const el = React.createElement(Harness, props)
  act(() => {
    root.render(strict ? React.createElement(React.StrictMode, null, el) : el)
  })
}

function draftPosts() {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url).endsWith('/draft') && (init as RequestInit | undefined)?.method === 'POST'
  )
}

function postedContent(call: unknown[]) {
  const init = call[1] as RequestInit
  return JSON.parse(String(init.body)).content as string
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
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

describe('CQ-08 capstoneDraftStorageKey', () => {
  it('scopes the key to the user and the module', () => {
    expect(capstoneDraftStorageKey('user-a', 'discovery')).toBe('capstone-draft:user-a:discovery')
  })

  it('gives two users different keys for the same module', () => {
    expect(capstoneDraftStorageKey('user-a', 'discovery')).not.toBe(
      capstoneDraftStorageKey('user-b', 'discovery')
    )
  })
})

describe('CQ-08 useCapstoneAutosave', () => {
  it('backs up every keystroke to the user-scoped key before the debounce fires', () => {
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: '' })

    act(() => latest.setContent('first draft'))

    expect(localStorage.getItem('capstone-draft:user-a:discovery')).toBe('first draft')
    expect(draftPosts()).toHaveLength(0)
  })

  it('writes two users to two different keys and never to the legacy unscoped key', () => {
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: '' })
    act(() => latest.setContent('alpha text'))
    act(() => root.unmount())

    root = createRoot(container)
    render({ moduleSlug: 'discovery', userId: 'user-b', initialContent: '' })
    act(() => latest.setContent('bravo text'))

    expect(localStorage.getItem('capstone-draft:user-a:discovery')).toBe('alpha text')
    expect(localStorage.getItem('capstone-draft:user-b:discovery')).toBe('bravo text')
    expect(localStorage.getItem('pm_academy_capstone_draft_discovery')).toBeNull()
  })

  it('restores a longer local backup only for the same user', () => {
    localStorage.setItem('capstone-draft:user-a:discovery', 'a much longer local draft')

    render({ moduleSlug: 'discovery', userId: 'user-b', initialContent: 'server' })
    expect(latest.content).toBe('server')
    act(() => root.unmount())

    root = createRoot(container)
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: 'server' })
    expect(latest.content).toBe('a much longer local draft')
  })

  it('sends a restored local draft to the server without any typing (S3)', async () => {
    localStorage.setItem('capstone-draft:user-a:discovery', 'a much longer local draft')

    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: 'server', debounceMs: 2500 })
    expect(latest.content).toBe('a much longer local draft')
    expect(latest.isDirty).toBe(true)
    expect(draftPosts()).toHaveLength(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })

    expect(draftPosts()).toHaveLength(1)
    expect(postedContent(draftPosts()[0])).toBe('a much longer local draft')
    expect(latest.status).toBe('saved')
    expect(latest.isDirty).toBe(false)
  })

  it('flushes a restored local draft on unmount before the debounce fires (S3)', () => {
    localStorage.setItem('capstone-draft:user-a:discovery', 'a much longer local draft')

    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: 'server', debounceMs: 2500 })
    act(() => root.unmount())

    expect(draftPosts()).toHaveLength(1)
    expect(postedContent(draftPosts()[0])).toBe('a much longer local draft')
    root = createRoot(container)
  })

  it('does not save when the local draft is not newer than the server copy', async () => {
    localStorage.setItem('capstone-draft:user-a:discovery', 'short')

    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: 'a longer server draft', debounceMs: 2500 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })

    expect(latest.content).toBe('a longer server draft')
    expect(draftPosts()).toHaveLength(0)
  })

  it('does not read or write storage before the user is known', () => {
    localStorage.setItem('pm_academy_capstone_draft_discovery', 'someone elses draft')
    render({ moduleSlug: 'discovery', userId: null, initialContent: '' })

    act(() => latest.setContent('typed before identity'))

    expect(latest.content).toBe('typed before identity')
    expect(Object.keys(localStorage).filter((k) => k.startsWith('capstone-draft:'))).toHaveLength(0)
  })

  it('removes the legacy unscoped draft key once the user is known', () => {
    localStorage.setItem('pm_academy_capstone_draft_discovery', 'someone elses draft')
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: '' })

    expect(latest.content).toBe('')
    expect(localStorage.getItem('pm_academy_capstone_draft_discovery')).toBeNull()
  })

  it('debounces only the network save', async () => {
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: '', debounceMs: 2500 })

    act(() => latest.setContent('one'))
    act(() => latest.setContent('one two'))
    expect(draftPosts()).toHaveLength(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })

    expect(draftPosts()).toHaveLength(1)
    expect(postedContent(draftPosts()[0])).toBe('one two')
    expect(latest.status).toBe('saved')
    expect(latest.isDirty).toBe(false)
  })

  it('flushes pending edits on unmount instead of dropping them', () => {
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: '', debounceMs: 2500 })

    act(() => latest.setContent('typed just before leaving'))
    act(() => root.unmount())

    expect(draftPosts()).toHaveLength(1)
    expect(postedContent(draftPosts()[0])).toBe('typed just before leaving')
    expect((draftPosts()[0][1] as RequestInit).keepalive).toBe(true)

    // Unmounting cleared the timer, so nothing fires a second save later.
    vi.advanceTimersByTime(5000)
    expect(draftPosts()).toHaveLength(1)

    root = createRoot(container)
  })

  it('does not send a save on unmount when nothing is pending', () => {
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: 'server' })
    act(() => root.unmount())

    expect(draftPosts()).toHaveLength(0)
    root = createRoot(container)
  })

  it('flushes pending edits on pagehide', () => {
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: '', debounceMs: 2500 })

    act(() => latest.setContent('tab closing'))
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(draftPosts()).toHaveLength(1)
    expect(postedContent(draftPosts()[0])).toBe('tab closing')
  })

  it('keeps the state updater pure under StrictMode', async () => {
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: 'start' }, true)
    const updater = vi.fn((prev: string) => `${prev} more`)

    act(() => latest.setContent(updater))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })

    expect(updater).toHaveBeenCalledTimes(1)
    expect(latest.content).toBe('start more')
    expect(draftPosts()).toHaveLength(1)
  })

  it('clearLocalDraft removes the user-scoped key after a successful submit', () => {
    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: '' })
    act(() => latest.setContent('submitted work'))
    expect(localStorage.getItem('capstone-draft:user-a:discovery')).toBe('submitted work')

    act(() => latest.clearLocalDraft())

    expect(localStorage.getItem('capstone-draft:user-a:discovery')).toBeNull()
  })

  it('does not let an older save response mark newer content as saved', async () => {
    let resolveFirst: (r: Response) => void = () => {}
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((r) => (resolveFirst = r)))
      .mockImplementation(async () => new Response('{}', { status: 200 }))

    render({ moduleSlug: 'discovery', userId: 'user-a', initialContent: '', debounceMs: 100 })

    act(() => latest.setContent('older'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    act(() => latest.setContent('older newer'))

    await act(async () => {
      resolveFirst(new Response('{}', { status: 200 }))
      await Promise.resolve()
    })

    expect(latest.isDirty).toBe(true)
  })
})
