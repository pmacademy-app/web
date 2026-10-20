/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Admin R6 C4: capstone rows link to the public capstone page only when it renders
// (publicPath set), the list notes that publishing refreshes the share card, and each Fellow
// request shows the learner's collapsible Fellow history.

vi.mock('@/lib/api/client', () => ({ apiPost: vi.fn(), apiPatch: vi.fn() }))
vi.mock('@/components/admin/CapstoneReviewDrawer', () => ({ CapstoneReviewDrawer: () => null }))

import { CapstonesView } from '@/components/admin/CapstonesView'
import { FellowRequestsView } from '@/components/admin/FellowRequestsView'
import { FellowRequestHistory } from '@/components/admin/FellowRequestHistory'
import type { AdminCapstoneRow } from '@/lib/admin/achievements-aggregation'
import type { AdminFellowRequestItem, FellowHistoryEvent } from '@/lib/admin/fellow-request-service'

function capstone(id: string, publicPath: string | null): AdminCapstoneRow {
  return {
    id,
    userId: `u-${id}`,
    learnerName: `Learner ${id}`,
    moduleSlug: 'mod',
    moduleTitle: 'Module',
    capstoneTitle: `Capstone ${id}`,
    content: '',
    wordCount: 10,
    status: publicPath ? 'reviewed' : 'submitted',
    isPublic: Boolean(publicPath),
    submittedAt: '2026-01-01T00:00:00Z',
    reviewedAt: publicPath ? '2026-01-02T00:00:00Z' : null,
    username: publicPath ? 'ada' : null,
    portfolioPublic: Boolean(publicPath),
    publicPath,
  }
}

const HISTORY: FellowHistoryEvent[] = [
  { kind: 'request', at: '2026-01-01T00:00:00Z', requestId: 'old', status: 'rejected', reviewedAt: '2026-01-03T00:00:00Z', rejectionReason: 'Portfolio thin' },
  { kind: 'admin_grant', at: '2026-02-01T00:00:00Z', adminEmail: 'admin@example.test' },
  { kind: 'celebration', at: '2026-02-01T00:01:00Z', seen: true },
  { kind: 'admin_revoke', at: '2026-03-01T00:00:00Z', adminEmail: null },
  { kind: 'request', at: '2026-04-01T00:00:00Z', requestId: 'r1', status: 'pending', reviewedAt: null, rejectionReason: null },
]

function fellowItem(history: FellowHistoryEvent[]): AdminFellowRequestItem {
  return {
    id: 'r1',
    userId: 'u1',
    userName: 'Ada',
    username: 'ada',
    email: 'ada@example.test',
    status: 'pending',
    requestedAt: '2026-04-01T00:00:00Z',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    isEligible: true,
    isPortfolioPublic: true,
    readinessCompletedCount: 4,
    readinessTotalCount: 4,
    isFellow: false,
    history,
  }
}

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

function mount(node: React.ReactNode) {
  act(() => root.render(node))
}

function historyToggle(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('History'))
}

describe('CapstonesView public page link (C4)', () => {
  it('links to the public page only when publicPath is set, opening a new tab safely', () => {
    const onParamsChange = vi.fn()
    mount(
      <CapstonesView
        capstones={[capstone('a', '/p/ada/capstone/mod'), capstone('b', null)]}
        status={null}
        onParamsChange={onParamsChange}
        selectedCapstoneId={null}
        selectedCapstoneDetail={null}
      />
    )
    const links = Array.from(container.querySelectorAll('a')).filter((a) => a.textContent?.includes('View public page'))
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/p/ada/capstone/mod')
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')

    // Clicking the link must not also open the review drawer for the row.
    act(() => links[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    expect(onParamsChange).not.toHaveBeenCalled()
  })

  it('notes that publishing refreshes the share card', () => {
    mount(
      <CapstonesView capstones={[]} status={null} onParamsChange={vi.fn()} selectedCapstoneId={null} selectedCapstoneDetail={null} />
    )
    expect(container.textContent).toContain('Publishing refreshes the share card')
  })
})

describe('Fellow request history (C4)', () => {
  it('shows a collapsed History (n) toggle that expands to the events, oldest first', () => {
    mount(<FellowRequestsView initialQueue={[fellowItem(HISTORY)]} status={null} onParamsChange={vi.fn()} />)
    const toggle = historyToggle()
    expect(toggle?.textContent).toContain('History (5)')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('ol')).toBeNull()

    act(() => toggle!.click())
    expect(toggle!.getAttribute('aria-expanded')).toBe('true')
    const list = container.querySelector('ol')!
    const controlsId = toggle!.getAttribute('aria-controls') ?? ''
    expect(controlsId).not.toBe('')
    expect(container.querySelector(`[id="${controlsId}"]`)?.contains(list)).toBe(true)
    const items = Array.from(list.querySelectorAll('li')).map((li) => li.textContent ?? '')
    expect(items).toHaveLength(5)
    expect(items[0]).toContain('Request declined')
    expect(items[0]).not.toContain('rejected')
    expect(items[0]).toContain('Portfolio thin')
    expect(items[1]).toContain('set by admin')
    expect(items[1]).toContain('admin@example.test')
    expect(items[2]).toContain('celebration')
    expect(items[2]).toContain('seen')
    expect(items[3]).toContain('removed by admin')
    expect(items[4]).toContain('Request pending (this request)')
    expect(container.textContent).toContain('45 days')
  })

  it('never calls Fellow a certificate or credential', () => {
    mount(<FellowRequestHistory history={HISTORY} currentRequestId="r1" />)
    act(() => historyToggle()!.click())
    expect(container.textContent?.toLowerCase()).not.toMatch(/certificate|credential/)
  })

  it('renders nothing when the history is empty or missing', () => {
    mount(<FellowRequestHistory history={[]} currentRequestId="r1" />)
    expect(historyToggle()).toBeUndefined()
    mount(<FellowRequestHistory history={undefined} currentRequestId="r1" />)
    expect(historyToggle()).toBeUndefined()
  })
})
