/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress-bar'

/**
 * B14-C — component tests are possible, and the three B11-A primitives have them.
 *
 * `F-REL-10`: `vitest.config.mts` restricted `include` to `.test.ts` files under
 * `lib/__tests__` with `environment: 'node'`, so a component test could not be
 * collected, let alone run. This file is the proof that it now can — the docblock above opts this file into
 * jsdom while every existing suite keeps the `node` default.
 *
 * ## Why no testing-library
 *
 * These render through `react-dom/client` and React 19's `act` rather than adding
 * `@testing-library/react`. The batch is scoped to making component tests *possible*
 * and covering the primitives, and jsdom was already a dependency from B11-C's
 * accessibility gate — so this needs no new package to prove the capability works.
 * If component coverage grows beyond the primitives, testing-library is the right next
 * step; three tests do not justify the dependency yet.
 *
 * ## Why these assert behaviour, not class strings
 *
 * `b11a-design-system.test.ts` already asserts the CVA output, and repeating that here
 * would test the same thing twice through a slower path. What that test *cannot* reach
 * is anything requiring a live DOM: whether a click actually fires, whether `loading`
 * really blocks a second submit, whether a controlled input round-trips. That is what a
 * component test is for, so that is what these do.
 */

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(element: React.ReactElement): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
  return container
}

/** Dispatches a real DOM click, so React's synthetic handler runs as it would live. */
function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount())
    root = null
  }
  container?.remove()
  container = null
})

describe('B14-C — Button (B11-A primitive)', () => {
  it('invokes its handler on a real click', () => {
    const onClick = vi.fn()
    const dom = render(
      <Button type="button" onClick={onClick}>
        Save changes
      </Button>
    )

    const button = dom.querySelector('button')
    expect(button).not.toBeNull()
    expect(button!.textContent).toContain('Save changes')

    click(button!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('blocks a second submit while loading, rather than only looking busy', () => {
    const onClick = vi.fn()
    const dom = render(
      <Button type="button" loading onClick={onClick}>
        Saving
      </Button>
    )

    const button = dom.querySelector('button') as HTMLButtonElement
    // `loading` must imply `disabled`. If it only rendered a spinner, an impatient
    // double-click would submit the form twice — which is the actual failure this
    // prop exists to prevent.
    expect(button.disabled).toBe(true)

    click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not fire when disabled', () => {
    const onClick = vi.fn()
    const dom = render(
      <Button type="button" disabled onClick={onClick}>
        Delete
      </Button>
    )

    click(dom.querySelector('button')!)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('forwards its ref to the underlying element', () => {
    const ref = React.createRef<HTMLButtonElement>()
    render(
      <Button type="button" ref={ref}>
        Focus me
      </Button>
    )

    // Ref forwarding is what lets a parent focus this button — a dialog returning
    // focus on close, a form focusing its first invalid control.
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    act(() => ref.current!.focus())
    expect(document.activeElement).toBe(ref.current)
  })
})

describe('B14-C — Input (B11-A primitive)', () => {
  it('round-trips a controlled value through onChange', () => {
    function ControlledInput() {
      const [value, setValue] = React.useState('')
      return (
        <Input
          aria-label="Full name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )
    }

    const dom = render(<ControlledInput />)
    const input = dom.querySelector('input') as HTMLInputElement

    act(() => {
      // React attaches its own value setter, so assigning `.value` directly does not
      // notify it. Going through the native prototype setter is what makes the
      // dispatched event carry the new value the way a real keystroke would.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      setter.call(input, 'Ada Lovelace')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(input.value).toBe('Ada Lovelace')
  })

  it('marks itself invalid for assistive technology when error is set', () => {
    const dom = render(<Input aria-label="Email" error />)
    const input = dom.querySelector('input') as HTMLInputElement

    // A red border is not an error state. `aria-invalid` is what a screen reader
    // announces, and B11-A made `error` responsible for setting it.
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('omits aria-invalid entirely when valid, rather than setting it to false', () => {
    const dom = render(<Input aria-label="Email" />)
    const input = dom.querySelector('input') as HTMLInputElement

    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('forwards its ref so a form can focus the first invalid field', () => {
    const ref = React.createRef<HTMLInputElement>()
    render(<Input aria-label="Email" ref={ref} />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
    act(() => ref.current!.focus())
    expect(document.activeElement).toBe(ref.current)
  })
})

describe('B14-C — ProgressBar (B11-A primitive)', () => {
  it('exposes its value to assistive technology', () => {
    const dom = render(<ProgressBar value={42} max={100} label="Module progress" />)
    const bar = dom.querySelector('[role="progressbar"]') as HTMLElement

    expect(bar).not.toBeNull()
    expect(bar.getAttribute('aria-valuenow')).toBe('42')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-label')).toBe('Module progress')
  })

  it('clamps an out-of-range value instead of overflowing its track', () => {
    const over = render(<ProgressBar value={150} max={100} />)
    const overFill = over.querySelector('[role="progressbar"] > div') as HTMLElement
    expect(overFill.style.width).toBe('100%')

    act(() => root!.unmount())
    root = null
    container?.remove()

    const under = render(<ProgressBar value={-20} max={100} />)
    const underFill = under.querySelector('[role="progressbar"] > div') as HTMLElement
    expect(underFill.style.width).toBe('0%')
  })

  it('updates the rendered width when its value changes', () => {
    const dom = render(<ProgressBar value={10} max={100} label="Progress" />)
    const fill = () => dom.querySelector('[role="progressbar"] > div') as HTMLElement

    expect(fill().style.width).toBe('10%')

    act(() => {
      root!.render(<ProgressBar value={80} max={100} label="Progress" />)
    })

    expect(fill().style.width).toBe('80%')
  })
})

describe('B14-C — the component-test capability itself', () => {
  it('runs in a DOM environment', () => {
    // If this file were collected under the default `node` environment, `document`
    // would be undefined and every test above would fail for the wrong reason.
    expect(typeof document).toBe('object')
    expect(typeof window).toBe('object')
  })
})
