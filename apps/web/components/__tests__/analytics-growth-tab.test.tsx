/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AdminAnalyticsGrowthData } from '@/lib/admin/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { AnalyticsGrowthTab, GROWTH_GA_NOTE } from '@/components/admin/AnalyticsGrowthTab'

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

const growth = (over: Partial<AdminAnalyticsGrowthData> = {}): AdminAnalyticsGrowthData => ({
  celebrations: { created: 40, claimed: 25 },
  referrals: { created: 12, signedUp: 12, activated: 7, rewarded: 3 },
  publicCapstonePages: 9,
  fellowRequests: { total: 6, pending: 2, approved: 3, rejected: 1 },
  ...over,
})

function render(data?: AdminAnalyticsGrowthData) {
  act(() => root.render(<AnalyticsGrowthTab data={data} />))
  return container.textContent ?? ''
}

describe('AnalyticsGrowthTab', () => {
  it('renders the referral funnel as signed up -> activated -> rewarded, with no duplicate created step', () => {
    render(growth())
    const funnel = container.querySelector('ol[aria-label="Referral funnel"]')!
    const labels = Array.from(funnel.querySelectorAll('li > div:first-child > span:first-child')).map(
      (el) => el.textContent
    )
    expect(labels).toEqual(['Referrals (signed up)', 'Activated', 'Rewarded'])
    expect(funnel.textContent).toContain('12')
    expect(funnel.textContent).toContain('7')
    expect(funnel.textContent).toContain('3')
  })

  it('labels public capstone pages as a current count and shows the GA-only note', () => {
    const text = render(growth())
    expect(text).toContain('currently public (not limited to the range)')
    expect(text).toContain(GROWTH_GA_NOTE)
    expect(GROWTH_GA_NOTE).toBe(
      'Share clicks by context (portfolio, badge, capstone, Fellow) are tracked in Google Analytics only.'
    )
  })

  it('shows celebrations and Fellow request statuses', () => {
    const text = render(growth())
    expect(text).toContain('40')
    expect(text).toContain('25')
    expect(text).toContain('Pending')
    expect(text).toContain('Approved')
    expect(text).toContain('Rejected')
  })

  it('never uses certificate or credential wording', () => {
    const text = render(growth()).toLowerCase()
    expect(text).not.toContain('certificate')
    expect(text).not.toContain('credential')
  })

  it('uses width-only bar transitions that respect reduced motion', () => {
    render(growth())
    const bars = container.querySelectorAll('[style*="width"]')
    expect(bars.length).toBeGreaterThan(0)
    bars.forEach((bar) => {
      expect(bar.className).toContain('transition-[width]')
      expect(bar.className).toContain('motion-reduce:transition-none')
      expect(bar.className).not.toContain('transition-all')
    })
  })

  it('caps bar widths at 100% even when a later step exceeds an earlier one', () => {
    render(growth({ celebrations: { created: 2, claimed: 10 } }))
    container.querySelectorAll<HTMLElement>('[style*="width"]').forEach((bar) => {
      expect(parseFloat(bar.style.width)).toBeLessThanOrEqual(100)
    })
  })

  it('shows a load warning when growth.failed is set', () => {
    render(growth({ failed: true }))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })

  it('shows no warning on a clean load', () => {
    render(growth())
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows a load warning when growth data is missing', () => {
    render(undefined)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
})
