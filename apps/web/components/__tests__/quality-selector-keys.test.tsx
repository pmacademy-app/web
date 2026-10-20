/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The flashcard rater listens for 0-5 on the window. It must not rate a card while the
// learner is typing a digit into a field, or when a modifier key is held.

import { QualitySelector } from '@/components/review/QualitySelector'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

describe('QualitySelector keyboard shortcuts', () => {
  it('rates the card when a digit is pressed with focus on the page body', () => {
    const onSelect = vi.fn()
    act(() => root.render(<QualitySelector onSelect={onSelect} />))

    const event = press(document.body, '3')

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(3)
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores a digit typed into a focused input', () => {
    const onSelect = vi.fn()
    act(() => root.render(<QualitySelector onSelect={onSelect} />))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = press(input, '3')

    expect(onSelect).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('ignores a digit typed into a textarea or select', () => {
    const onSelect = vi.fn()
    act(() => root.render(<QualitySelector onSelect={onSelect} />))
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    document.body.append(textarea, select)

    press(textarea, '4')
    press(select, '2')

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ignores a digit typed into a contenteditable element', () => {
    const onSelect = vi.fn()
    act(() => root.render(<QualitySelector onSelect={onSelect} />))
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    // jsdom does not compute isContentEditable, so mirror what a browser reports.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    document.body.appendChild(editable)

    press(editable, '5')

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ignores digits pressed with a modifier key held', () => {
    const onSelect = vi.fn()
    act(() => root.render(<QualitySelector onSelect={onSelect} />))

    press(document.body, '1', { ctrlKey: true })
    press(document.body, '2', { metaKey: true })
    press(document.body, '3', { altKey: true })

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('ignores digits while disabled', () => {
    const onSelect = vi.fn()
    act(() => root.render(<QualitySelector onSelect={onSelect} disabled />))

    press(document.body, '3')

    expect(onSelect).not.toHaveBeenCalled()
  })
})
