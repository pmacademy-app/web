/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as contactPOST } from '../../app/api/contact/route'
import { GET as adminContactGET, PATCH as adminContactPATCH } from '../../app/api/admin/contact/route'
import { POST as webhookPOST } from '../../app/api/email/webhooks/route'

// Mock state storage
let mockContactMessages: any[] = []
let mockAuthAdmin: {
  authorized: boolean
  userId?: string
  email?: string
  error?: string
  statusCode?: number
} = {
  authorized: false,
  error: 'Unauthorized',
  statusCode: 401,
}

let mockRateLimitResult: { success: boolean; limit: number; remaining: number; reset: number } = {
  success: true,
  limit: 3,
  remaining: 2,
  reset: Date.now() + 600000,
}

const mockSendEmail = vi.fn().mockResolvedValue({
  success: true,
  id: 'mock_msg_email_123',
  provider: 'simulated',
  statusCode: 200,
})

const mockLogAdminAction = vi.fn().mockResolvedValue(undefined)

const createTableChain = (table: string) => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((field: string, val: any) => {
      chain._eqField = field
      chain._eqVal = val
      return chain
    }),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn((payload: any) => {
      const inserted = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        ...payload,
        created_at: new Date().toISOString(),
      }
      mockContactMessages.push(inserted)
      chain._inserted = inserted
      return chain
    }),
    update: vi.fn((payload: any) => {
      chain._updatePayload = payload
      if (chain._eqField === 'id' && chain._eqVal) {
        const found = mockContactMessages.find((m) => m.id === chain._eqVal)
        if (found) {
          Object.assign(found, payload)
        }
      }
      return chain
    }),
    single: vi.fn(() => Promise.resolve({ data: chain._inserted || { id: 'msg_default_id' }, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) => {
      if (table === 'contact_messages') {
        let res = [...mockContactMessages]
        if (chain._eqField && chain._eqVal) {
          res = res.filter((m) => m[chain._eqField] === chain._eqVal)
        }
        resolve({ data: res, error: null })
      } else {
        resolve({ data: [], error: null })
      }
    },
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => createTableChain(table)),
  })),
}))

vi.mock('@/lib/email', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluateRateLimit: vi.fn(() => Promise.resolve(mockRateLimitResult)),
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(() => Promise.resolve(mockAuthAdmin)),
  logAdminAction: (...args: any[]) => mockLogAdminAction(...args),
}))

describe('Contact Flow & Inbound Webhook Unit Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockContactMessages = []
    mockAuthAdmin = {
      authorized: false,
      error: 'Unauthorized',
      statusCode: 401,
    }
    mockRateLimitResult = {
      success: true,
      limit: 3,
      remaining: 2,
      reset: Date.now() + 600000,
    }
    mockSendEmail.mockResolvedValue({
      success: true,
      id: 'mock_msg_email_123',
      provider: 'simulated',
      statusCode: 200,
    })
  })

  it('/api/contact rejects missing required fields with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/contact', {
      method: 'POST',
      body: JSON.stringify({ name: '', email: 'invalid', subject: '', message: '' }),
    })
    const res = await contactPOST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
    expect(mockContactMessages.length).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('/api/contact successfully records inquiry and dispatches support email', async () => {
    const payload = {
      name: 'Alice Smith',
      email: 'alice@example.com',
      subject: 'Curriculum Question',
      category: 'curriculum',
      message: 'Can I access the capstone early?',
    }

    const req = new NextRequest('http://localhost:3000/api/contact', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const res = await contactPOST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.messageId).toBeDefined()
    expect(data.emailSent).toBe(true)

    // Verify DB insertion was simulated
    expect(mockContactMessages.length).toBe(1)
    expect(mockContactMessages[0].email).toBe('alice@example.com')
    expect(mockContactMessages[0].subject).toBe('Curriculum Question')

    // Verify email dispatch was simulated with correct recipient & subject
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'pmacademyapp@gmail.com',
        subject: '[PM Academy Support Inquiry] Curriculum Question',
      })
    )
  })

  it('/api/contact rate limits excessive requests from single IP/key', async () => {
    mockRateLimitResult = {
      success: false,
      limit: 3,
      remaining: 0,
      reset: Date.now() + 60000,
    }

    const req = new NextRequest('http://localhost:3000/api/contact', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.99' },
      body: JSON.stringify({
        name: 'Rate Tester',
        email: 'rate@example.com',
        subject: 'Rate Limit Test',
        category: 'general',
        message: 'Testing rate limit threshold',
      }),
    })

    const res = await contactPOST(req)
    expect(res.status).toBe(429)
    const data = await res.json()
    expect(data.error).toContain('Too many contact messages sent')
    expect(mockContactMessages.length).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('/api/admin/contact rejects unauthenticated requests with 401 or 403', async () => {
    mockAuthAdmin = { authorized: false, error: 'Unauthorized', statusCode: 401 }
    const req = new NextRequest('http://localhost:3000/api/admin/contact')
    const res = await adminContactGET(req)
    expect([401, 403].includes(res.status)).toBe(true)
  })

  it('/api/admin/contact returns contact messages for authorized admin', async () => {
    mockAuthAdmin = { authorized: true, userId: 'admin_1', email: 'admin@prodily.app' }
    mockContactMessages = [
      {
        id: 'msg_1',
        name: 'Bob',
        email: 'bob@example.com',
        subject: 'Hello',
        message: 'Test msg',
        status: 'new',
        created_at: new Date().toISOString(),
      },
    ]

    const req = new NextRequest('http://localhost:3000/api/admin/contact')
    const res = await adminContactGET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.messages).toHaveLength(1)
    expect(data.messages[0].name).toBe('Bob')
  })

  it('/api/admin/contact PATCH rejects unauthenticated requests with 401 or 403', async () => {
    mockAuthAdmin = { authorized: false, error: 'Unauthorized', statusCode: 401 }
    const req = new NextRequest('http://localhost:3000/api/admin/contact', {
      method: 'PATCH',
      body: JSON.stringify({ messageId: 'msg-123', status: 'replied' }),
    })
    const res = await adminContactPATCH(req)
    expect([401, 403].includes(res.status)).toBe(true)
  })

  it('/api/admin/contact PATCH updates message status for authorized admin and logs action', async () => {
    mockAuthAdmin = { authorized: true, userId: 'admin_1', email: 'admin@prodily.app' }
    mockContactMessages = [
      {
        id: 'msg-123',
        name: 'Charlie',
        email: 'charlie@example.com',
        subject: 'Inquiry',
        status: 'new',
      },
    ]

    const req = new NextRequest('http://localhost:3000/api/admin/contact', {
      method: 'PATCH',
      body: JSON.stringify({ messageId: 'msg-123', status: 'replied', adminNotes: 'Replied via support' }),
    })

    const res = await adminContactPATCH(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.messageId).toBe('msg-123')

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      'admin_1',
      'admin@prodily.app',
      'contact_message_replied',
      'contact_message',
      'msg-123',
      expect.objectContaining({ status: 'replied', adminNotes: true })
    )
  })

  it('/api/email/webhooks processes email.received event payload with mocked dependencies', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const payload = {
      type: 'email.received',
      data: {
        email_id: 'em_test_123',
        from: 'Alice <alice@example.com>',
        to: ['hello@prodily.adityagangwani.me'],
        subject: 'Inbound Webhook Test Inquiry',
        text: 'Hello PM Academy support team!',
      },
    }
    const req = new NextRequest('http://localhost:3000/api/email/webhooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const res = await webhookPOST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.processed).toBe(true)

    // Verify DB insert simulated
    expect(mockContactMessages.length).toBe(1)
    expect(mockContactMessages[0].source).toBe('inbound_email')

    // Verify email forward simulated
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('/api/email/webhooks rejects invalid Svix signature when secret is configured', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test_secret_123'
    const payload = {
      type: 'email.received',
      data: { email_id: 'em_test_unauth' },
    }
    const req = new NextRequest('http://localhost:3000/api/email/webhooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const res = await webhookPOST(req)
    expect(res.status).toBe(401)
    expect(mockContactMessages.length).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
