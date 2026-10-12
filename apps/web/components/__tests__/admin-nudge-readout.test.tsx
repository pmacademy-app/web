/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AdminNudgeReadout } from '@/lib/admin/nudge-readout'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const apiPost = vi.fn()
vi.mock('@/lib/api/client', () => ({
  apiPost: (...args: unknown[]) => apiPost(...args),
}))

import { AdminNudgeReadoutCard, formatLift } from '@/components/admin/AdminNudgeReadoutCard'
import { AdminLifecyclePreviewButton } from '@/components/admin/AdminLifecyclePreviewButton'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  apiPost.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const readout = (over: Partial<AdminNudgeReadout>): AdminNudgeReadout => ({
  key: 'nudge.portfolio_ready',
  name: 'Portfolio ready',
  sent: 0,
  heldOut: 0,
  reminded: 0,
  treatedRate: 0,
  holdoutRate: 0,
  lift: 0,
  ready: false,
  ...over,
})

const cells = (key: string) =>
  Array.from(container.querySelectorAll(`tr[data-nudge="${key}"] td`)).map((td) => td.textContent)

describe('AdminNudgeReadoutCard', () => {
  it('shows sent, held out, reminded, both rates and the lift per nudge', () => {
    act(() =>
      root.render(
        <AdminNudgeReadoutCard
          retireReady={false}
          nudges={[
            readout({ sent: 240, heldOut: 100, reminded: 80, treatedRate: 0.25, holdoutRate: 0.1, lift: 0.15, ready: true }),
            readout({
              key: 'nudge.fellow_eligible',
              name: 'Fellow eligible',
              sent: 50,
              heldOut: 20,
              reminded: 5,
              treatedRate: 0.1,
              holdoutRate: 0.15,
              lift: -0.05,
            }),
          ]}
        />,
      ),
    )

    expect(cells('nudge.portfolio_ready')).toEqual(['240', '100', '80', '25.0%', '10.0%', '+15.0 pts'])
    expect(cells('nudge.fellow_eligible')).toEqual(['50', '20', '5', '10.0%', '15.0%', '−5.0 pts'])
    expect(container.textContent).toContain('currently public (not time-bound)')
    expect(container.textContent).toContain('requested Fellow within 14 days')
  })

  it('shows n/a with an explanation instead of a zero lift when nobody is held out', () => {
    act(() =>
      root.render(
        <AdminNudgeReadoutCard
          retireReady={false}
          nudges={[
            readout({ sent: 40, heldOut: 0, treatedRate: 0.25, holdoutRate: 0, lift: 0, liftAvailable: false }),
            readout({
              key: 'nudge.fellow_eligible',
              name: 'Fellow eligible',
              sent: 50,
              heldOut: 20,
              treatedRate: 0.1,
              holdoutRate: 0.1,
              lift: 0,
              liftAvailable: true,
            }),
          ]}
        />,
      ),
    )

    const liftCell = container.querySelector('tr[data-nudge="nudge.portfolio_ready"] td:last-child')!
    expect(liftCell.textContent).toContain('n/a')
    expect(liftCell.textContent).not.toContain('pts')
    expect(liftCell.textContent).toContain('No holdout group yet')
    expect(liftCell.querySelector('[title="No holdout group yet"]')).not.toBeNull()
    expect(liftCell.className).toContain('text-admin-fg-muted')
    // A measured lift of zero is still a number.
    expect(cells('nudge.fellow_eligible').slice(-1)).toEqual(['0.0 pts'])
  })

  it('gates retiring the manual campaign scripts (B12), never the holdout', () => {
    act(() => root.render(<AdminNudgeReadoutCard retireReady={false} nudges={[readout({})]} />))
    let line = container.querySelector('[data-testid="nudge-retire-line"]')!
    expect(line.getAttribute('data-ready')).toBe('false')
    expect(line.className).toContain('text-admin-fg-muted')
    expect(line.textContent).toContain('Keep the manual scripts')
    expect(line.textContent).toContain('≥200 treated users')

    act(() => root.render(<AdminNudgeReadoutCard retireReady nudges={[readout({ ready: true })]} />))
    line = container.querySelector('[data-testid="nudge-retire-line"]')!
    expect(line.getAttribute('data-ready')).toBe('true')
    expect(line.textContent).toContain('Ready to retire the manual campaign scripts')
    expect(line.querySelector('svg')?.getAttribute('class')).toContain('text-admin-success')
    expect(container.textContent?.toLowerCase()).not.toContain('retire the holdout')
  })

  it('uses readable text tokens and sizes for informational text', () => {
    act(() => root.render(<AdminNudgeReadoutCard retireReady nudges={[readout({})]} />))
    expect(container.innerHTML).not.toContain('text-admin-fg-subtle')
    expect(container.innerHTML).not.toContain('text-[10px]')
    const line = container.querySelector('[data-testid="nudge-retire-line"]')!
    expect(line.className).toContain('text-xs')
    expect(line.className).not.toContain('text-admin-success')
  })

  it('shows a warning instead of a zero table when the readout failed', () => {
    act(() => root.render(<AdminNudgeReadoutCard retireReady={false} failed nudges={[readout({})]} />))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded')
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelector('[data-testid="nudge-retire-line"]')).toBeNull()
  })

  it('formats lift in signed percentage points', () => {
    expect(formatLift(0.123)).toBe('+12.3 pts')
    expect(formatLift(-0.02)).toBe('−2.0 pts')
    expect(formatLift(0)).toBe('0.0 pts')
  })
})

describe('AdminLifecyclePreviewButton', () => {
  const clickPreview = async () => {
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes("Preview today's run (no emails sent)"),
    )
    expect(button).toBeTruthy()
    await act(async () => {
      button!.click()
    })
  }

  it('POSTs a forced dry run and shows the counts', async () => {
    apiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        success: true,
        dryRun: true,
        force: true,
        paused: false,
        lifecycleQueued: 7,
        queuedBySequence: { 'lifecycle.inactive_3d': 4, 'lifecycle.inactive_7d': 3 },
        heldOut: 2,
        skippedTimezone: 0,
        skippedNoSegment: 11,
        nudges: { 'nudge.portfolio_ready': 5, 'nudge.fellow_eligible': 1 },
        nudgesHeldOut: 3,
        nudgePagesSkipped: 0,
      },
    })

    act(() => root.render(<AdminLifecyclePreviewButton names={{ 'nudge.portfolio_ready': 'Portfolio ready' }} />))
    await clickPreview()

    expect(apiPost).toHaveBeenCalledTimes(1)
    expect(apiPost.mock.calls[0][0]).toBe('/api/admin/automations/lifecycle-preview?force=true')

    const result = container.querySelector('[data-testid="lifecycle-preview-result"]')!
    expect(result).toBeTruthy()
    const text = result.textContent ?? ''
    expect(text).toContain('Lifecycle queued7')
    expect(text).toContain('Lifecycle held out2')
    expect(text).toContain('Nudges held out3')
    expect(text).toContain('lifecycle.inactive_3d4')
    expect(text).toContain('Portfolio ready5')
    expect(text).toContain('nudge.fellow_eligible1')
  })

  it('shows the error when the preview fails', async () => {
    apiPost.mockResolvedValue({ ok: false, error: { kind: 'http', code: 'X', message: 'Nope', status: 500 } })
    act(() => root.render(<AdminLifecyclePreviewButton />))
    await clickPreview()
    const error = container.querySelector('[data-testid="lifecycle-preview-error"]')
    expect(error?.textContent).toBe('Nope')
    // One announcement mechanism: the polite live region, with no nested alert.
    expect(error?.closest('[aria-live="polite"]')).not.toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('[data-testid="lifecycle-preview-result"]')).toBeNull()
  })
})
