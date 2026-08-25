/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as productionSendPOST } from '../../app/api/admin/emails/production-send/route'

let mockAuthAdmin: {
  authorized: boolean
  userId?: string
  email?: string
  error?: string
  statusCode?: number
} = {
  authorized: true,
  userId: 'admin_123',
  email: 'admin@prodily.me',
}

let mockUsers: Record<string, any> = {
  'user-1': {
    id: 'user-1',
    email: 'aditya@example.com',
    name: 'Aditya Gangwani',
  },
}

let mockSystemSettings: Record<string, any> = {}
let mockQueueItems: Record<string, any> = {}
let mockEnqueueResult: { success: boolean; queueId?: string; reason?: string } = {
  success: true,
  queueId: 'q-101',
}
let mockProcessResult: { processed: number; delivered: number; failed: number; suppressed: number; skipped: number } = {
  processed: 1,
  delivered: 1,
  failed: 0,
  suppressed: 0,
  skipped: 0,
}

const mockLogAdminAction = vi.fn().mockResolvedValue(undefined)
const mockLogSystemError = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(() => Promise.resolve(mockAuthAdmin)),
  logAdminAction: (...args: any[]) => mockLogAdminAction(...args),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: (...args: any[]) => mockLogSystemError(...args),
}))

vi.mock('@/lib/notifications/queue/processor', () => ({
  enqueueNotificationItem: vi.fn(() => Promise.resolve(mockEnqueueResult)),
  processEmailQueue: vi.fn(() => Promise.resolve(mockProcessResult)),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn((field: string, val: any) => {
          chain._field = field
          chain._val = val
          return chain
        }),
        maybeSingle: vi.fn(() => {
          if (table === 'users') {
            const found = mockUsers[chain._val] || null
            return Promise.resolve({ data: found, error: null })
          }
          if (table === 'system_settings') {
            const found = mockSystemSettings[chain._val] || null
            return Promise.resolve({ data: found, error: null })
          }
          if (table === 'email_queue') {
            const found = mockQueueItems[chain._val] || {
              id: chain._val,
              status: 'delivered',
              resend_id: 're_12345',
              attempt_count: 1,
            }
            return Promise.resolve({ data: found, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        single: vi.fn(() => {
          if (table === 'users') {
            const found = mockUsers[chain._val] || null
            return Promise.resolve({ data: found, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      }
      return chain
    }),
    auth: {
      admin: {
        getUserById: vi.fn((id: string) => {
          const user = mockUsers[id]
          if (user) {
            return Promise.resolve({ data: { user: { email: user.email, user_metadata: { full_name: user.name } } }, error: null })
          }
          return Promise.resolve({ data: { user: null }, error: { message: 'User not found' } })
        }),
        generateLink: vi.fn((params: any) => {
          return Promise.resolve({
            data: { properties: { action_link: `https://prodily.me/verify?token=tok_123&email=${params.email}` } },
            error: null,
          })
        }),
      },
    },
  })),
}))

describe('Phase 3 — Admin Individual User Production Email Dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthAdmin = {
      authorized: true,
      userId: 'admin_123',
      email: 'admin@prodily.me',
    }
    mockUsers = {
      'user-1': {
        id: 'user-1',
        email: 'aditya@example.com',
        name: 'Aditya Gangwani',
      },
    }
    mockSystemSettings = {}
    mockQueueItems = {}
    mockEnqueueResult = {
      success: true,
      queueId: 'q-101',
    }
    mockProcessResult = {
      processed: 1,
      delivered: 1,
      failed: 0,
      suppressed: 0,
      skipped: 0,
    }
  })

  it('rejects unauthorized/non-admin requests with 401/403', async () => {
    mockAuthAdmin = {
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    }

    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'user-1',
        templateKey: 'auth.welcome',
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toContain('Admin privileges required')
  })

  it('rejects requests missing targetUserId or templateKey with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({ targetUserId: '' }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('required')
  })

  it('rejects custom direct message missing subject or messageBody with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'user-1',
        templateKey: 'admin.direct_message',
        customVariables: { subject: '   ', messageBody: '' },
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Subject is required')
  })

  it('rejects non-existent target learner account with 404', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'non-existent-user-id',
        templateKey: 'auth.welcome',
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toContain('Target user account not found')
  })

  it('successfully dispatches standard automated template (auth.welcome) and logs audit action', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'user-1',
        templateKey: 'auth.welcome',
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.queueId).toBe('q-101')
    expect(json.message).toContain('auth.welcome')

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      'admin_123',
      'admin@prodily.me',
      'SEND_PRODUCTION_EMAIL',
      'email_queue',
      'q-101',
      expect.objectContaining({
        recipientEmail: 'aditya@example.com',
        templateKey: 'auth.welcome',
        queueId: 'q-101',
      })
    )
  })

  it('successfully dispatches custom direct message (admin.direct_message)', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'user-1',
        templateKey: 'admin.direct_message',
        customVariables: {
          subject: 'Special Cohort Announcement',
          messageBody: 'Hello Aditya,\n\nWe have scheduled our weekly PM review.',
          actionLabel: 'View Dashboard',
          actionUrl: 'https://prodily.me/dashboard',
        },
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.queueId).toBe('q-101')

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      'admin_123',
      'admin@prodily.me',
      'SEND_PRODUCTION_EMAIL',
      'email_queue',
      'q-101',
      expect.objectContaining({
        recipientEmail: 'aditya@example.com',
        templateKey: 'admin.direct_message',
      })
    )
  })

  it('blocks non-critical templates when global email pause is active', async () => {
    mockSystemSettings['email_global_pause'] = { key: 'email_global_pause', value: true }

    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'user-1',
        templateKey: 'auth.welcome',
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Global Email Delivery Pause is currently active')
  })

  it('allows critical auth template (auth.verify_email) to bypass global pause and generate verification link', async () => {
    mockSystemSettings['email_global_pause'] = { key: 'email_global_pause', value: true }

    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'user-1',
        templateKey: 'auth.verify_email',
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.queueId).toBe('q-101')
  })

  it('handles immediate background race condition gracefully without false 400 when processed count is 0', async () => {
    // Simulate background worker claiming and processing the item (processed: 0 in immediate flush)
    mockProcessResult = {
      processed: 0,
      delivered: 0,
      failed: 0,
      suppressed: 0,
      skipped: 0,
    }
    // Queue item in database is already delivered
    mockQueueItems['q-101'] = {
      id: 'q-101',
      status: 'delivered',
      resend_id: 're_already_sent_123',
    }

    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'user-1',
        templateKey: 'auth.welcome',
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.status).toBe('delivered')
  })

  it('returns 400 when queue status indicates failed delivery', async () => {
    mockQueueItems['q-101'] = {
      id: 'q-101',
      status: 'failed',
      error_message: 'Invalid recipient mailbox domain',
    }

    const req = new NextRequest('http://localhost:3000/api/admin/emails/production-send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId: 'user-1',
        templateKey: 'auth.welcome',
      }),
    })

    const res = await productionSendPOST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('Invalid recipient mailbox domain')
  })
})
