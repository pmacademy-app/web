/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  buildEmailContent,
  deriveFirstName,
  loadLogRecords,
  saveLogRecord,
  isFreshOptOut,
  CAMPAIGN_ID,
  EXCLUDED_EMAILS,
} from '../../scripts/local-campaigns/reengagement_pm_journey_aug_2026/send-reengagement-pm-journey'

describe('Prodily PM Journey Re-engagement Marketing Campaign Suite', () => {
  const siteUrl = 'https://prodily.app'
  const ctaUrl = 'https://prodily.app/academy'
  let tempLogFile: string

  beforeEach(() => {
    tempLogFile = path.join(os.tmpdir(), `test_campaign_log_${Date.now()}_${Math.random().toString(36).slice(2)}.json`)
  })

  afterEach(() => {
    if (fs.existsSync(tempLogFile)) {
      try {
        fs.unlinkSync(tempLogFile)
      } catch {
        // ignore cleanup error
      }
    }
  })

  describe('1. Campaign Identification & Configuration', () => {
    it('has the correct campaign ID', () => {
      expect(CAMPAIGN_ID).toBe('reengagement_pm_journey_aug_2026')
    })

    it('defines excluded internal and admin email addresses', () => {
      expect(EXCLUDED_EMAILS).toBeInstanceOf(Set)
      expect(EXCLUDED_EMAILS.has('adityagangwaniexam@gmail.com')).toBe(true)
      expect(EXCLUDED_EMAILS.has('pmacademyapp@gmail.com')).toBe(true)
    })
  })

  describe('2. Email Content & Personalization', () => {
    it('generates exact subject and personalized greeting for identified learner', () => {
      const { subject, text, html } = buildEmailContent('Sarah', ctaUrl, siteUrl)

      expect(subject).toBe('You left something unfinished')
      expect(text).toContain('Hey Sarah,')
      expect(html).toContain('Hey Sarah,')
    })

    it('generates fallback greeting for anonymous learner', () => {
      const { text, html } = buildEmailContent('there', ctaUrl, siteUrl)

      expect(text).toContain('Hey there,')
      expect(html).toContain('Hey there,')
    })

    it('contains all required email body paragraphs and copy', () => {
      const { text, html } = buildEmailContent('Alex', ctaUrl, siteUrl)

      const requiredPhrases = [
        'You started learning PM with Prodily — and I noticed you haven’t been back in a while.',
        'Your progress is still there.',
        'If you’ve got 10 minutes today, come back and pick up where you left off.',
        'Continue where you left off →',
        'No big commitment. Just 10 minutes.',
        '— Aditya',
        'Founder, Prodily',
      ]

      for (const phrase of requiredPhrases) {
        expect(text).toContain(phrase)
        expect(html).toContain(phrase)
      }
    })

    it('includes single primary text CTA pointing to academy URL and clean unsubscribe link', () => {
      const { html, text } = buildEmailContent('Alex', ctaUrl, siteUrl)

      expect(html).toContain(`href="${ctaUrl}"`)
      expect(html).toContain(`href="${siteUrl}/settings?tab=notifications"`)
      expect(text).toContain(ctaUrl)
      expect(text).toContain(`${siteUrl}/settings?tab=notifications`)
    })
  })

  describe('3. First Name Derivation Helper', () => {
    it('extracts first name from full name string', () => {
      expect(deriveFirstName('Sarah Connor')).toBe('Sarah')
      expect(deriveFirstName('  John   Robert   Doe  ')).toBe('John')
      expect(deriveFirstName('Taylor')).toBe('Taylor')
    })

    it('falls back to username when name is missing', () => {
      expect(deriveFirstName(null, 'product_lead', null)).toBe('product_lead')
      expect(deriveFirstName('', 'alex_pm', null)).toBe('alex_pm')
    })

    it('falls back to formatted email local part when name and username are missing', () => {
      expect(deriveFirstName(null, null, 'emily.smith@example.com')).toBe('Emily')
      expect(deriveFirstName('', '', 'david+testing@gmail.com')).toBe('David')
    })

    it('falls back to "there" when no identifier is provided', () => {
      expect(deriveFirstName(null, null, null)).toBe('there')
      expect(deriveFirstName('', '', '')).toBe('there')
      expect(deriveFirstName('   ', '  ', '  ')).toBe('there')
    })
  })

  describe('4. Idempotent Log File Persistence', () => {
    it('returns empty map when log file does not exist', () => {
      const map = loadLogRecords(tempLogFile)
      expect(map.size).toBe(0)
    })

    it('saves and reloads send records correctly without duplicates', () => {
      saveLogRecord(
        {
          userId: 'usr-1',
          email: 'sarah@example.com',
          status: 'success',
          sentAt: new Date().toISOString(),
        },
        tempLogFile
      )

      saveLogRecord(
        {
          userId: 'usr-2',
          email: 'john@example.com',
          status: 'failed',
          sentAt: new Date().toISOString(),
          error: 'Rate limit',
        },
        tempLogFile
      )

      const map = loadLogRecords(tempLogFile)
      expect(map.size).toBe(2)
      expect(map.get('usr-1')?.status).toBe('success')
      expect(map.get('usr-2')?.status).toBe('failed')

      // Update existing record
      saveLogRecord(
        {
          userId: 'usr-2',
          email: 'john@example.com',
          status: 'success',
          sentAt: new Date().toISOString(),
        },
        tempLogFile
      )

      const updatedMap = loadLogRecords(tempLogFile)
      expect(updatedMap.size).toBe(2)
      expect(updatedMap.get('usr-2')?.status).toBe('success')
    })
  })

  describe('5. Real-Time Opt-Out Verification (isFreshOptOut)', () => {
    it('returns true when marketing_email is false', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { all_notifications: true, all_email: true, marketing_email: false },
          }),
        }),
      } as any

      const optedOut = await isFreshOptOut(mockSupabase, 'usr-opted-out')
      expect(optedOut).toBe(true)
    })

    it('returns true when all_email or all_notifications is false', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { all_notifications: false, all_email: true, marketing_email: true },
          }),
        }),
      } as any

      const optedOut = await isFreshOptOut(mockSupabase, 'usr-silent')
      expect(optedOut).toBe(true)
    })

    it('returns false when user preferences allow marketing emails', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { all_notifications: true, all_email: true, marketing_email: true },
          }),
        }),
      } as any

      const optedOut = await isFreshOptOut(mockSupabase, 'usr-active')
      expect(optedOut).toBe(false)
    })

    it('defaults to false when no preference record exists', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      } as any

      const optedOut = await isFreshOptOut(mockSupabase, 'usr-new')
      expect(optedOut).toBe(false)
    })
  })
})
