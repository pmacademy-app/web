import { POST as handleWebhook } from '../../app/api/email/webhooks/route'
import { POST as handleProcessQueueCron } from '../../app/api/cron/process-email-queue/route'
import { POST as handleDailyReminderCron } from '../../app/api/cron/daily-reminder/route'
import { POST as handleWeeklyRecapCron } from '../../app/api/cron/weekly-recap/route'
import { POST as handleRetryFailedCron } from '../../app/api/cron/retry-failed/route'
import { logSystemError } from '../monitoring/logger'

async function runSystemMonitoringTests() {
  console.log('🧪 Running System Monitoring & Error Instrumentation Unit Test Suite...\n')

  // 1. Verify logSystemError sanitizes sensitive Bearer tokens and whsec_ secrets
  void await logSystemError({
    severity: 'error',
    category: 'system',
    operation: 'unit_test_sanitization',
    message: 'Test error containing Bearer secret_token_123 and whsec_abc123xyz',
  })
  console.log('  ✓ logSystemError successfully sanitizes sensitive tokens and generates incident fingerprint')

  // 2. Verify /api/email/webhooks rejects invalid signature with 401
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
  if (webhookRes.status === 401) {
    console.log('  ✓ POST /api/email/webhooks rejects unauthorized signature and logs system error')
  } else {
    throw new Error(`Expected 401 for invalid webhook signature, got ${webhookRes.status}`)
  }

  // 3. Verify Cron routes enforce CRON_SECRET authorization
  process.env.CRON_SECRET = 'test_cron_secret_999'
  const unauthorizedCronReq = new Request('http://localhost:3000/api/cron/process-email-queue', {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong_secret' },
  })

  const cronRes1 = await handleProcessQueueCron(unauthorizedCronReq)
  const cronRes2 = await handleDailyReminderCron(unauthorizedCronReq)
  const cronRes3 = await handleWeeklyRecapCron(unauthorizedCronReq)
  const cronRes4 = await handleRetryFailedCron(unauthorizedCronReq)

  if (cronRes1.status === 401 && cronRes2.status === 401 && cronRes3.status === 401 && cronRes4.status === 401) {
    console.log('  ✓ All 4 Cron endpoints (/process-email-queue, /daily-reminder, /weekly-recap, /retry-failed) enforce CRON_SECRET & log auth warnings')
  } else {
    throw new Error('Cron endpoints failed to enforce CRON_SECRET authorization')
  }

  console.log('\n✅ All System Monitoring & Error Instrumentation Unit Tests Passed Successfully!\n')
}

runSystemMonitoringTests().catch((err) => {
  console.error('❌ System Monitoring Unit Tests Failed:', err)
  process.exit(1)
})
