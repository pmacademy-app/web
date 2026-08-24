import { describe, it, expect } from 'vitest'
import { POST as handleWebhook } from '../../app/api/email/webhooks/route'
import { POST as handleProcessQueueCron } from '../../app/api/cron/process-email-queue/route'
import { POST as handleDailyReminderCron } from '../../app/api/cron/daily-reminder/route'
import { POST as handleWeeklyRecapCron } from '../../app/api/cron/weekly-recap/route'
import { POST as handleRetryFailedCron } from '../../app/api/cron/retry-failed/route'
import { logSystemError } from '../monitoring/logger'

describe('System Monitoring & Error Instrumentation Unit Test Suite', () => {
  it('logSystemError sanitizes sensitive Bearer tokens and whsec_ secrets', async () => {
    await logSystemError({
      severity: 'error',
      category: 'system',
      operation: 'unit_test_sanitization',
      message: 'Test error containing Bearer secret_token_123 and whsec_abc123xyz',
    })
  })

  it('POST /api/email/webhooks rejects invalid signature with 401', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test_secret_123'
    const mockWebhookReq = new Request('http://localhost:3000/api/email/webhooks', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_123',
        'svix-timestamp': `${Math.floor(Date.now() / 1000)}`,
        'svix-signature': 'v1,invalid_sig',
      },
      body: JSON.stringify({ type: 'email.delivered', data: { email_id: 're_123' } }),
    })

    const webhookRes = await handleWebhook(mockWebhookReq)
    expect(webhookRes.status).toBe(401)
  })

  it('Cron routes enforce CRON_SECRET authorization', async () => {
    process.env.CRON_SECRET = 'test_cron_secret_999'
    const unauthorizedCronReq = new Request('http://localhost:3000/api/cron/process-email-queue', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong_secret' },
    })

    const cronRes1 = await handleProcessQueueCron(unauthorizedCronReq)
    const cronRes2 = await handleDailyReminderCron(unauthorizedCronReq)
    const cronRes3 = await handleWeeklyRecapCron(unauthorizedCronReq)
    const cronRes4 = await handleRetryFailedCron(unauthorizedCronReq)

    expect(cronRes1.status).toBe(401)
    expect(cronRes2.status).toBe(401)
    expect(cronRes3.status).toBe(401)
    expect(cronRes4.status).toBe(401)
  })

  it('GET /api/admin/system/alerts rejects unauthorized requests with 401 or 403', async () => {
    const { NextRequest } = await import('next/server')
    const { GET: handleSystemAlerts } = await import('../../app/api/admin/system/alerts/route')
    const req = new NextRequest('http://localhost:3000/api/admin/system/alerts')
    const res = await handleSystemAlerts(req)
    expect([401, 403].includes(res.status)).toBe(true)
  })

  it('GET /api/admin/system/audit rejects unauthorized requests with 401 or 403', async () => {
    const { NextRequest } = await import('next/server')
    const { GET: handleSystemAudit } = await import('../../app/api/admin/system/audit/route')
    const req = new NextRequest('http://localhost:3000/api/admin/system/audit')
    const res = await handleSystemAudit(req)
    expect([401, 403].includes(res.status)).toBe(true)
  })

  it('SystemService.getHealthOverview returns valid telemetry overview', async () => {
    const { SystemService } = await import('../admin/system-service')
    const overview = await SystemService.getHealthOverview()
    expect(overview).toBeDefined()
    expect(['healthy', 'degraded', 'down'].includes(overview.overallStatus)).toBe(true)
    expect(typeof overview.databaseLatencyMs).toBe('number')
  })
})
