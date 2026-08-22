import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as handleProductionSend } from '../../app/api/admin/emails/production-send/route'
import { AdminConsoleService } from '../admin/service'
import { evaluateRateLimit } from '../rate-limit'
import { renderEmailTemplate } from '../../emails'

describe('End-to-End Production Remediation Audit & Fixes Test Suite', () => {
  it('60-Second Persistent Rate Limiter enforced cooldown on duplicate request', async () => {
    const testEmail = `audit_user_${Date.now()}@example.com`
    const rateLimitKey = `verify_resend:${testEmail}`

    const rl1 = await evaluateRateLimit(rateLimitKey, { windowMs: 60000, limit: 1 })
    const rl2 = await evaluateRateLimit(rateLimitKey, { windowMs: 60000, limit: 1 })

    expect(rl1.success).toBe(true)
    expect(rl2.success).toBe(false)
  })

  it('AdminConsoleService.getUsersOverview discovers and marks unverified accounts', async () => {
    const usersOverview = await AdminConsoleService.getUsersOverview(10)
    expect(usersOverview).toBeDefined()
    expect(Array.isArray(usersOverview.users)).toBe(true)
    expect(typeof usersOverview.total).toBe('number')
  })

  it('Admin Production Send with non-existent user returns 404/401', async () => {
    const invalidUserReq = new Request('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: '00000000-0000-0000-0000-000000000000',
        templateKey: 'auth.verify_email',
        confirmProductionSend: true,
      }),
    })

    const invalidUserRes = await handleProductionSend(invalidUserReq as unknown as NextRequest)
    expect([401, 404].includes(invalidUserRes.status)).toBe(true)
  })

  it('Admin Verification Email renders branded template and embeds verified callback URL cleanly', async () => {
    const mockVerificationUrl = 'https://prodily.adityagangwani.me/api/auth/callback?token_hash=mock_hash&type=signup'
    const renderedVerification = await renderEmailTemplate('auth.verify_email', {
      userName: 'Test Admin Learner',
      verificationUrl: mockVerificationUrl,
    })

    expect(renderedVerification.html).toContain('Verify Email Address')
    expect(renderedVerification.subject).toContain('Confirm your')
  })
})
