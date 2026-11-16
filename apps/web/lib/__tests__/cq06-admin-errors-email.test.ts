/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuthAdmin = {
  authorized: true,
  userId: 'admin_test_1',
  email: 'admin@prodily.me',
}

const mockLogErrorReport = vi.fn().mockResolvedValue('incident_test_1')
const mockLogSystemError = vi.fn().mockResolvedValue(undefined)
const mockLogAdminAction = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(() => Promise.resolve(mockAuthAdmin)),
  logAdminAction: (...args: any[]) => mockLogAdminAction(...args),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: (...args: any[]) => mockLogErrorReport(...args),
  logSystemError: (...args: any[]) => mockLogSystemError(...args),
}))

import { GET as getBroadcasts, POST as createBroadcast } from '../../app/api/admin/emails/broadcasts/route'
import { POST as getRecipientCount } from '../../app/api/admin/emails/broadcasts/recipient-count/route'
import { GET as getBroadcastDetail } from '../../app/api/admin/emails/broadcasts/[id]/route'
import { BroadcastService } from '@/lib/admin/broadcast-service'

describe('CQ-06: Admin Email Handlers and Services Throw to withRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /api/admin/emails/broadcasts returns 500 and logs incident when BroadcastService throws', async () => {
    vi.spyOn(BroadcastService, 'listBroadcasts').mockRejectedValueOnce(
      new Error('database connection failed')
    )

    const request = new NextRequest('https://prodily.app/api/admin/emails/broadcasts')
    const response = await getBroadcasts(request)

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(mockLogErrorReport).toHaveBeenCalledTimes(1)
    expect(mockLogErrorReport.mock.calls[0][0]).toMatchObject({
      domain: 'admin',
      operation: 'admin.emails.broadcasts.get',
    })
  })

  it('POST /api/admin/emails/broadcasts/recipient-count returns 500 and logs incident on query failure', async () => {
    vi.spyOn(BroadcastService, 'previewRecipientCount').mockRejectedValueOnce(
      new Error('relation users does not exist')
    )

    const request = new NextRequest('https://prodily.app/api/admin/emails/broadcasts/recipient-count', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters: {} }),
    })
    const response = await getRecipientCount(request)

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(mockLogErrorReport).toHaveBeenCalledTimes(1)
    expect(mockLogErrorReport.mock.calls[0][0]).toMatchObject({
      domain: 'admin',
      operation: 'admin.emails.broadcasts.recipient_count.post',
    })
  })

  it('POST /api/admin/emails/broadcasts returns 400 without logging incident for malformed JSON body', async () => {
    const request = new NextRequest('https://prodily.app/api/admin/emails/broadcasts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'invalid-json{',
    })
    const response = await createBroadcast(request)

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(mockLogErrorReport).not.toHaveBeenCalled()
  })

  it('POST /api/admin/emails/broadcasts returns 400 for missing required name or template_key', async () => {
    const request = new NextRequest('https://prodily.app/api/admin/emails/broadcasts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    const response = await createBroadcast(request)

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(mockLogErrorReport).not.toHaveBeenCalled()
  })

  it('POST /api/admin/emails/broadcasts returns 500 and logs incident on database creation failure', async () => {
    vi.spyOn(BroadcastService, 'createBroadcast').mockRejectedValueOnce(
      new Error('Failed to insert into email_broadcasts')
    )

    const request = new NextRequest('https://prodily.app/api/admin/emails/broadcasts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Campaign 1', template_key: 'inactive.resume_learning' }),
    })
    const response = await createBroadcast(request)

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(mockLogErrorReport).toHaveBeenCalledTimes(1)
  })

  it('GET /api/admin/emails/broadcasts/[id] returns 404 without incident log when broadcast not found', async () => {
    vi.spyOn(BroadcastService, 'getBroadcast').mockResolvedValueOnce(null)

    const request = new NextRequest('https://prodily.app/api/admin/emails/broadcasts/missing-id')
    const response = await getBroadcastDetail(request, { params: Promise.resolve({ id: 'missing-id' }) } as any)

    expect(response.status).toBe(404)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(mockLogErrorReport).not.toHaveBeenCalled()
  })
})
