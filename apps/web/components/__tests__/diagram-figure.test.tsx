/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import DiagramFigure from '@/components/diagrams/DiagramFigure'
import type { DiagramPlan } from '@/lib/diagrams/plan'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class NoopObserver {
  observe() {}
  disconnect() {}
}

const PLAN: DiagramPlan = {
  version: 1,
  title: 'The Assumption Map',
  direction: 'LR',
  nodes: {
    A: { id: 'A', title: 'New idea', role: 'start' },
    B: { id: 'B', title: 'List assumptions', role: 'step' },
    C: { id: 'C', title: 'Test the riskiest', role: 'goal' },
  },
  edges: [
    { from: 'A', to: 'B' },
    { from: 'B', to: 'C' },
  ],
  layout: { kind: 'chain', steps: ['A', 'B', 'C'] },
  loops: [{ from: 'C', to: 'A', kind: 'loop', label: 'repeat' }],
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = NoopObserver
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const button = (text: RegExp) => [...host.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '') || text.test(b.getAttribute('aria-label') ?? ''))

describe('DiagramFigure', () => {
  it('renders every box, the title, the loop marker and a text alternative', () => {
    act(() => root.render(<DiagramFigure plan={PLAN} title={PLAN.title} />))
    const text = host.textContent ?? ''
    expect(text).toContain('The Assumption Map')
    for (const n of Object.values(PLAN.nodes)) expect(text).toContain(n.title)
    expect(text).toContain('loops back to')
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Diagram: New idea, then List assumptions, then Test the riskiest.')
  })

  it('walks through the boxes one at a time', () => {
    act(() => root.render(<DiagramFigure plan={PLAN} />))
    act(() => button(/walk through 3 steps/i)!.click())
    expect(host.textContent).toContain('Step 1 of 3')
    expect(host.querySelectorAll('[data-state="now"]').length).toBeGreaterThan(0)
    act(() => button(/next step/i)!.click())
    expect(host.textContent).toContain('Step 2 of 3')
    act(() => button(/previous step/i)!.click())
    expect(host.textContent).toContain('Step 1 of 3')
    act(() => button(/stop walk-through/i)!.click())
    expect(host.textContent).toContain('Walk through 3 steps')
    expect(host.querySelectorAll('[data-state="now"]').length).toBe(0)
  })
})
