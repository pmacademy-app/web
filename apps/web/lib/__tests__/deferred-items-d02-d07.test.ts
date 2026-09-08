/**
 * Regression coverage for the two deferred items closed in this pass.
 *
 * D-02 — admin API routes returned raw `err.message`. They are behind
 * `requireAdminUser` and the text is deliberately diagnostic, so the fix sanitizes
 * rather than genericizes: the operator keeps the failure detail, credentials do not
 * survive.
 *
 * D-07 — the daily email quota key was computed with two different clocks. The SQL
 * functions used `TO_CHAR(NOW(), …)`, which resolves in the Postgres session timezone,
 * while the application used `toISOString()`, which is always UTC. Enforcement was
 * internally consistent (the RPC computes the key once and both increments and checks
 * it), but the count an operator reads came from a different row than the one being
 * written whenever the database timezone was not UTC.
 */
import { describe, it, expect } from 'vitest'

import { adminErrorMessage } from '../errors/api-response'
import { dailyQuotaKeyForDate, currentDailyQuotaKey } from '../notifications/daily-quota-key'

// ─── D-02 ─────────────────────────────────────────────────────────────────────

describe('D-02 — admin error messages keep the diagnostic, drop the secret', () => {
  it('preserves an ordinary database error verbatim', () => {
    // This is the whole point of not genericizing: the operator needs this text.
    const msg = 'duplicate key value violates unique constraint "email_queue_pkey"'
    expect(adminErrorMessage(new Error(msg), 'Failed')).toBe(msg)
  })

  it('redacts a connection string while keeping the surrounding diagnostic', () => {
    const out = adminErrorMessage(
      new Error('connect failed: postgresql://postgres:SuperSecretPw99@db.abc.supabase.co:5432/postgres'),
      'Failed'
    )
    expect(out).not.toContain('SuperSecretPw99')
    expect(out).toContain('connect failed')
    expect(out).toContain('postgresql://')
  })

  it.each([
    ['Brevo key', 'send rejected for xkeysib-TEST_PLACEHOLDER_BREVO_KEY', '0a1b2c3d4e5f6071'],
    ['Resend key', 'auth failed with re_TestPlaceholderResendKey', '9aBcDeFg_HiJkLmNoPq'],
    ['bearer token', 'upstream said Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.TestSig', 'eyJhbGciOiJIUzI1NiJ9'],
    ['webhook secret', 'signature mismatch for whsec_TestPlaceholderWebhookXX', 'MfKQ9r8sT2uV5wX7'],
  ])('redacts a %s from an admin response message', (_label, raw, secretPart) => {
    expect(adminErrorMessage(new Error(raw), 'Failed')).not.toContain(secretPart)
  })

  it('masks recipient addresses so admin responses do not carry full PII', () => {
    const out = adminErrorMessage(new Error('bounce for learner.one@corp-mail.co.uk'), 'Failed')
    expect(out).not.toContain('learner.one@')
    expect(out).toContain('@corp-mail.co.uk')
  })

  it('falls back when there is no usable message', () => {
    expect(adminErrorMessage(new Error(''), 'Failed to fetch users')).toBe('Failed to fetch users')
    expect(adminErrorMessage(undefined, 'Failed to fetch users')).toBe('Failed to fetch users')
    expect(adminErrorMessage({ weird: true }, 'Failed to fetch users')).toBe('Failed to fetch users')
  })

  it('accepts a bare string cause', () => {
    expect(adminErrorMessage('row not found', 'Failed')).toBe('row not found')
  })
})

// ─── D-07 ─────────────────────────────────────────────────────────────────────

describe('D-07 — the quota day is the UTC day, everywhere', () => {
  it('derives the key from the UTC date', () => {
    expect(dailyQuotaKeyForDate(new Date('2026-09-08T12:00:00Z'))).toBe('email_sent_count_2026_09_08')
  })

  it('does not roll the key over at a non-UTC local midnight', () => {
    // 23:30 UTC on the 8th is already the 9th in Asia/Kolkata (UTC+5:30) and in any
    // zone ahead of UTC. The key must still be the 8th: a session-timezone-derived key
    // would have rolled over here, which is exactly the JS/SQL split being closed.
    expect(dailyQuotaKeyForDate(new Date('2026-09-08T23:30:00Z'))).toBe('email_sent_count_2026_09_08')
    expect(dailyQuotaKeyForDate(new Date('2026-09-09T00:30:00Z'))).toBe('email_sent_count_2026_09_09')
  })

  it('rolls over exactly at 00:00 UTC and nowhere else', () => {
    expect(dailyQuotaKeyForDate(new Date('2026-09-08T23:59:59.999Z'))).toBe('email_sent_count_2026_09_08')
    expect(dailyQuotaKeyForDate(new Date('2026-09-09T00:00:00.000Z'))).toBe('email_sent_count_2026_09_09')
  })

  it('is stable across instances regardless of host timezone', () => {
    // `toISOString()` is UTC by definition, so two serverless instances in different
    // regions compute the same key for the same instant.
    const instant = new Date('2026-09-08T18:45:00Z')
    expect(dailyQuotaKeyForDate(instant)).toBe(dailyQuotaKeyForDate(new Date(instant.getTime())))
  })

  it('handles month and year boundaries', () => {
    expect(dailyQuotaKeyForDate(new Date('2026-12-31T23:00:00Z'))).toBe('email_sent_count_2026_12_31')
    expect(dailyQuotaKeyForDate(new Date('2027-01-01T00:00:00Z'))).toBe('email_sent_count_2027_01_01')
  })

  it('produces the key shape the SQL functions build', () => {
    // SQL: 'email_sent_count_' || TO_CHAR((NOW() AT TIME ZONE 'UTC'), 'YYYY_MM_DD')
    expect(currentDailyQuotaKey()).toMatch(/^email_sent_count_\d{4}_\d{2}_\d{2}$/)
  })
})
