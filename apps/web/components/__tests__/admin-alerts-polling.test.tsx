/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ADMIN_ALERTS_SWR_CONFIG,
  ADMIN_DEDUPE_INTERVAL_MS,
  ADMIN_LIST_SWR_CONFIG,
  ALERTS_MAX_BACKOFF_MS,
  ALERTS_POLL_INTERVAL_MS,
  alertsErrorBackoffMs,
  alertsOnErrorRetry,
} from '@/components/admin/admin-swr-config'

const ADMIN_DIR = join(__dirname, '..', 'admin')
const readView = (name: string) => readFileSync(join(ADMIN_DIR, `${name}.tsx`), 'utf8')

describe('admin alerts polling config', () => {
  it('polls every 30s, pauses when hidden and revalidates on focus', () => {
    expect(ADMIN_ALERTS_SWR_CONFIG.refreshInterval).toBe(30_000)
    expect(ADMIN_ALERTS_SWR_CONFIG.refreshWhenHidden).toBe(false)
    expect(ADMIN_ALERTS_SWR_CONFIG.revalidateOnFocus).toBe(true)
    expect(ADMIN_ALERTS_SWR_CONFIG.onErrorRetry).toBe(alertsOnErrorRetry)
    expect(ADMIN_ALERTS_SWR_CONFIG.dedupingInterval).toBeGreaterThanOrEqual(10_000)
  })

  it('doubles the retry delay per failure and caps it at 5 minutes', () => {
    expect(ALERTS_MAX_BACKOFF_MS).toBe(300_000)
    expect(alertsErrorBackoffMs(1)).toBe(ALERTS_POLL_INTERVAL_MS * 2)
    expect(alertsErrorBackoffMs(2)).toBe(120_000)
    expect(alertsErrorBackoffMs(3)).toBe(240_000)
    expect(alertsErrorBackoffMs(4)).toBe(300_000)
    expect(alertsErrorBackoffMs(50)).toBe(300_000)
    expect(alertsErrorBackoffMs(0)).toBe(60_000)
  })

  describe('onErrorRetry', () => {
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    it('schedules the revalidation after the backoff delay, passing the retry count', () => {
      vi.useFakeTimers()
      const revalidate = vi.fn(() => Promise.resolve(true))
      const err = new Error('boom')

      alertsOnErrorRetry(err, '/api/admin/system/alerts', {} as never, revalidate, {
        retryCount: 2,
        dedupe: true,
      })

      vi.advanceTimersByTime(119_999)
      expect(revalidate).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(revalidate).toHaveBeenCalledTimes(1)
      expect(revalidate).toHaveBeenCalledWith({ retryCount: 2 })
    })

    it('skips the retry when the tab is hidden when it comes due', () => {
      vi.useFakeTimers()
      vi.stubGlobal('document', { visibilityState: 'visible' })
      const revalidate = vi.fn(() => Promise.resolve(true))

      alertsOnErrorRetry(new Error('boom'), 'k', {} as never, revalidate, { retryCount: 1, dedupe: true })
      ;(globalThis.document as { visibilityState: string }).visibilityState = 'hidden'
      vi.advanceTimersByTime(alertsErrorBackoffMs(1))
      expect(revalidate).not.toHaveBeenCalled()

      alertsOnErrorRetry(new Error('boom'), 'k', {} as never, revalidate, { retryCount: 1, dedupe: true })
      ;(globalThis.document as { visibilityState: string }).visibilityState = 'visible'
      vi.advanceTimersByTime(alertsErrorBackoffMs(1))
      expect(revalidate).toHaveBeenCalledTimes(1)
    })

    it('never waits longer than 5 minutes', () => {
      vi.useFakeTimers()
      const revalidate = vi.fn(() => Promise.resolve(true))

      alertsOnErrorRetry(new Error('boom'), 'k', {} as never, revalidate, {
        retryCount: 9,
        dedupe: true,
      })

      vi.advanceTimersByTime(ALERTS_MAX_BACKOFF_MS - 1)
      expect(revalidate).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(revalidate).toHaveBeenCalledTimes(1)
    })
  })
})

describe('admin list views SWR config', () => {
  it('dedupes for at least 10s without revalidating on mount', () => {
    expect(ADMIN_DEDUPE_INTERVAL_MS).toBeGreaterThanOrEqual(10_000)
    expect(ADMIN_LIST_SWR_CONFIG.dedupingInterval).toBeGreaterThanOrEqual(10_000)
    expect(ADMIN_LIST_SWR_CONFIG.revalidateOnMount).toBe(false)
  })

  it('AdminSystemAlertsView uses the alerts polling config', () => {
    const src = readView('AdminSystemAlertsView')
    expect(src).toContain('ADMIN_ALERTS_SWR_CONFIG')
    expect(src).not.toMatch(/refreshInterval:\s*30_000/)
  })

  it.each([
    'AdminAnnouncementsView',
    'AdminBroadcastsView',
    'AdminSystemAuditView',
    'AdminSystemErrorsView',
  ])('%s uses the shared list config and no short dedupe window', (name) => {
    const src = readView(name)
    expect(src).toContain('...ADMIN_LIST_SWR_CONFIG')
    expect(src).not.toMatch(/dedupingInterval:\s*[0-9]_?000\b/)
  })
})
