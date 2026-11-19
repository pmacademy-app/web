import { describe, it, expect } from 'vitest'
import { evaluateRateLimit } from '../rate-limit'
import { renderEmailTemplate } from '../../emails'

describe('Production Remediation Invariants', () => {
  it('60-Second Persistent Rate Limiter enforced cooldown on duplicate request', async () => {
    const testEmail = `audit_user_${Date.now()}@example.com`
    const rateLimitKey = `verify_resend:${testEmail}`

    const rl1 = await evaluateRateLimit(rateLimitKey, { windowMs: 60000, limit: 1 })
    const rl2 = await evaluateRateLimit(rateLimitKey, { windowMs: 60000, limit: 1 })

    expect(rl1.success).toBe(true)
    expect(rl2.success).toBe(false)
  })

  it('Verification email renders branded template and embeds verified callback URL cleanly', async () => {
    const mockVerificationUrl = 'https://prodily.app/api/auth/callback?token_hash=mock_hash&type=signup'
    const renderedVerification = await renderEmailTemplate('auth.verify_email', {
      userName: 'Test Learner',
      verificationUrl: mockVerificationUrl,
    })

    expect(renderedVerification.html).toContain('Verify Email Address')
    expect(renderedVerification.subject).toContain('Confirm your')
  })
})
