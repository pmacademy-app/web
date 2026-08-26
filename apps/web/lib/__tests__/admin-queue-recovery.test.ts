import { describe, it, expect } from 'vitest'

describe('Admin Email Queue Recovery & Suppression Invariants', () => {
  const isEligibleForRetry = (status: string): boolean => {
    return ['failed', 'dead_letter', 'retrying', 'skipped', 'suppressed'].includes(status)
  }

  const shouldBlockDueToSuppression = (
    email: string,
    templateKey: string,
    suppressedEmails: Set<string>
  ): boolean => {
    const isCritical = templateKey === 'auth.verify_email' || templateKey === 'auth.password_reset'
    if (isCritical) return false
    return suppressedEmails.has(email.toLowerCase())
  }

  it('rejects retrying delivered or currently processing items', () => {
    expect(isEligibleForRetry('delivered')).toBe(false)
    expect(isEligibleForRetry('processing')).toBe(false)
    expect(isEligibleForRetry('failed')).toBe(true)
    expect(isEligibleForRetry('dead_letter')).toBe(true)
    expect(isEligibleForRetry('retrying')).toBe(true)
  })

  it('blocks non-critical retries for suppressed recipient emails', () => {
    const suppressed = new Set(['unsubscribed@example.com', 'bounced@example.com'])

    // Non-critical emails to suppressed addresses are blocked
    expect(
      shouldBlockDueToSuppression('unsubscribed@example.com', 'learning.weekly_recap', suppressed)
    ).toBe(true)

    expect(
      shouldBlockDueToSuppression('unsubscribed@example.com', 'learning.daily_reminder', suppressed)
    ).toBe(true)

    // Critical authentication emails ALWAYS bypass suppression
    expect(
      shouldBlockDueToSuppression('unsubscribed@example.com', 'auth.verify_email', suppressed)
    ).toBe(false)

    expect(
      shouldBlockDueToSuppression('unsubscribed@example.com', 'auth.password_reset', suppressed)
    ).toBe(false)

    // Non-suppressed email passes
    expect(
      shouldBlockDueToSuppression('active@example.com', 'learning.weekly_recap', suppressed)
    ).toBe(false)
  })
})
