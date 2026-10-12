/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AdminUserProofSummary } from '@/lib/admin/user-proof-service'
import { UserProofPanel, formatProofDate } from '@/components/admin/UserProofPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
})

const summary = (over: Partial<AdminUserProofSummary> = {}): AdminUserProofSummary => ({
  userId: 'u1',
  portfolio: { isPublic: false, readyButPrivate: true, readinessPercent: 100 },
  fellowState: 'eligible',
  latestRequest: null,
  nextCapstone: null,
  lessons: { completed: 40, total: 40, curriculumComplete: true },
  nextStep: { kind: 'publish_portfolio', text: 'Publish the portfolio: everything else is done.', path: '/settings' },
  lastNudge: null,
  ...over,
})

function render(proof: AdminUserProofSummary | null) {
  act(() => root.render(<UserProofPanel proof={proof} />))
  return container.textContent ?? ''
}

describe('UserProofPanel', () => {
  it('renders nextStep.text exactly as given', () => {
    render(summary())
    expect(container.querySelector('[data-testid="proof-next-step"]')?.textContent).toBe(
      'Publish the portfolio: everything else is done.',
    )
  })

  it('shows portfolio and Fellow state', () => {
    const text = render(summary())
    expect(text).toContain('Ready but private')
    expect(text).toContain('100% ready')
    expect(text).toContain('Eligible, not requested')
  })

  it('shows the latest request with dates', () => {
    const text = render(
      summary({
        fellowState: 'approved',
        latestRequest: { status: 'approved', requestedAt: '2026-09-01T10:00:00Z', reviewedAt: '2026-09-03T10:00:00Z' },
      }),
    )
    expect(text).toContain('Fellow')
    expect(text).toContain('Approved')
    expect(text).toContain('Requested Sep 1, 2026, reviewed Sep 3, 2026')
  })

  it('labels a held-out nudge as not sent', () => {
    const text = render(
      summary({ lastNudge: { key: 'nudge.fellow_eligible', round: 'initial', heldOut: true, at: '2026-10-01T00:00:00Z' } }),
    )
    expect(text).toContain('Fellow eligible (first send)')
    expect(text).toContain('Held out (no nudge sent)')
    expect(text).not.toMatch(/Sent,/)
  })

  it('labels a sent reminder as sent', () => {
    const text = render(
      summary({ lastNudge: { key: 'nudge.portfolio_ready', round: 'reminder', heldOut: false, at: '2026-10-01T00:00:00Z' } }),
    )
    expect(text).toContain('Portfolio ready (reminder)')
    expect(text).toContain('Sent, Oct 1, 2026')
  })

  it('shows an inline note when the summary failed to load', () => {
    const text = render(null)
    expect(text).toContain('Proof state could not be loaded')
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it('never calls Fellow a certificate or credential', () => {
    const states: AdminUserProofSummary['fellowState'][] = ['not_eligible', 'eligible', 'pending', 'approved', 'rejected']
    for (const fellowState of states) {
      const text = render(
        summary({
          fellowState,
          latestRequest: { status: 'pending', requestedAt: '2026-09-01T00:00:00Z', reviewedAt: null },
          nextCapstone: { slug: 'm1', title: 'Discovery capstone', href: '/academy/m1/capstone' },
          lastNudge: { key: 'nudge.fellow_eligible', round: 'reminder', heldOut: false, at: '2026-10-01T00:00:00Z' },
        }),
      )
      expect(text).not.toMatch(/certificate|credential/i)
    }
  })

  it('formats missing or invalid dates as a dash', () => {
    expect(formatProofDate(null)).toBe('—')
    expect(formatProofDate('nope')).toBe('—')
  })
})
