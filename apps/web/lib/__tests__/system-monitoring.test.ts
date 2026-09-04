import { describe, it, expect, vi } from 'vitest'
import { sanitizeErrorMessage } from '../monitoring/logger'
import { POST as handleWebhook } from '../../app/api/email/webhooks/route'
import { POST as handleProcessQueueCron } from '../../app/api/cron/process-email-queue/route'
import { POST as handleDailyReminderCron } from '../../app/api/cron/daily-reminder/route'
import { POST as handleWeeklyRecapCron } from '../../app/api/cron/weekly-recap/route'
import { POST as handleRetryFailedCron } from '../../app/api/cron/retry-failed/route'

// ---------------------------------------------------------------------------
// IMPORTANT: This test suite must NEVER call logSystemError with a live
// Supabase client, because CI has a real SUPABASE_SERVICE_ROLE_KEY injected
// and would write test records into the production system_errors table.
//
// Sanitisation is tested via the exported pure helper `sanitizeErrorMessage`
// which has no I/O.  All DB-touching paths are mocked below.
// ---------------------------------------------------------------------------

function makeSupabaseMock() {
  const queryBuilder = {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => ({ data: { id: 'mock-id' }, error: null })),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  }
  return {
    from: vi.fn(() => queryBuilder),
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    rpc: vi.fn(async () => ({ data: null, error: { message: 'rpc not available in test' } })),
  }
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => makeSupabaseMock()),
  createAuthenticatedServerClient: vi.fn(() => makeSupabaseMock()),
  createPublicClient: vi.fn(() => makeSupabaseMock()),
}))

describe('System Monitoring & Error Instrumentation Unit Test Suite', () => {
  // ── 1. Pure sanitisation tests (no DB, no network) ────────────────────────

  it('sanitizeErrorMessage redacts Bearer tokens', () => {
    const input = 'Test error containing Bearer secret_token_123 and more text'
    const output = sanitizeErrorMessage(input)
    expect(output).not.toContain('secret_token_123')
    expect(output).toContain('Bearer [REDACTED]')
  })

  it('sanitizeErrorMessage redacts whsec_ webhook secrets', () => {
    const input = 'Hook secret: whsec_abc123xyz456'
    const output = sanitizeErrorMessage(input)
    expect(output).not.toContain('abc123xyz456')
    expect(output).toContain('whsec_[REDACTED]')
  })

  it('sanitizeErrorMessage redacts Resend API key prefixes', () => {
    const input = 'API key re_dz6o4sMR_28GupYbvaBVCddGx leaked in message'
    const output = sanitizeErrorMessage(input)
    expect(output).not.toContain('dz6o4sMR_28GupYbvaBVCddGx')
    expect(output).toContain('re_[REDACTED]')
  })

  it('sanitizeErrorMessage redacts Svix v1 signatures', () => {
    const input = 'Signature check failed for v1,someBase64Sig=='
    const output = sanitizeErrorMessage(input)
    expect(output).not.toContain('someBase64Sig==')
    expect(output).toContain('v1,[REDACTED]')
  })

  it('sanitizeErrorMessage returns empty string for empty input', () => {
    expect(sanitizeErrorMessage('')).toBe('')
  })

  it('sanitizeErrorMessage leaves non-sensitive messages unchanged', () => {
    const safe = 'Database query returned 0 rows for user lookup'
    expect(sanitizeErrorMessage(safe)).toBe(safe)
  })

  // ── 2. Webhook authentication ─────────────────────────────────────────────

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

  // ── 3. Cron authentication ────────────────────────────────────────────────

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

  // ── 4. Admin system routes ────────────────────────────────────────────────

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

  it('GET /api/health returns operational status and telemetry headers', async () => {
    const { GET: handleHealthCheck } = await import('../../app/api/health/route')
    const res = await handleHealthCheck()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
    expect(json.database).toBe('connected')
    expect(typeof json.latencyMs).toBe('number')
    expect(res.headers.get('cache-control')).toContain('no-cache')
  })
})
