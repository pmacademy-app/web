import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { POST as sendEmailHook } from '../../app/api/auth/send-email-hook/route'

const HOOK_URL = 'http://localhost:3000/api/auth/send-email-hook'
const TEST_SECRET = ['whsec', Buffer.from('sec16-secret-bytes-test').toString('base64')].join('_')
const PROD_SECRET = `v1,${TEST_SECRET}`

const PAYLOAD = {
  user: { id: 'usr-sec16', email: 'sec16@example.com', user_metadata: { full_name: 'Sec16 Tester' } },
  email_data: { email_action_type: 'signup', token_hash: 'th_sec16_abc' },
}

function computeSignature(payloadToSign: string, secret: string): string {
  const base64Part = secret.replace(/^v1,/, '').replace(/^whsec_/, '')
  const keyBytes = Buffer.from(base64Part, 'base64')
  return crypto.createHmac('sha256', keyBytes).update(payloadToSign).digest('base64')
}

describe('SEC-16: Auth Email Hook Signature and Timestamp Validation', () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.SEND_EMAIL_HOOK_SECRET
    process.env.SEND_EMAIL_HOOK_SECRET = PROD_SECRET
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.SEND_EMAIL_HOOK_SECRET
    else process.env.SEND_EMAIL_HOOK_SECRET = previousSecret
  })

  it('1. Accepts a valid signature with fresh timestamp (within 5 minutes)', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const msgId = 'msg_valid_123'
    const now = Math.floor(Date.now() / 1000).toString()
    const payloadToSign = `${msgId}.${now}.${rawBody}`
    const sig = computeSignature(payloadToSign, PROD_SECRET)

    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: {
        'webhook-id': msgId,
        'webhook-timestamp': now,
        'webhook-signature': `v1,${sig}`,
      },
      body: rawBody,
    })

    const res = await sendEmailHook(req)
    expect(res.status).toBe(200)
  })

  it('2. Rejects replayed request with timestamp 6 minutes old (360 seconds)', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const msgId = 'msg_replay_old'
    const sixMinutesAgo = (Math.floor(Date.now() / 1000) - 360).toString()
    const payloadToSign = `${msgId}.${sixMinutesAgo}.${rawBody}`
    const sig = computeSignature(payloadToSign, PROD_SECRET)

    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: {
        'webhook-id': msgId,
        'webhook-timestamp': sixMinutesAgo,
        'webhook-signature': `v1,${sig}`,
      },
      body: rawBody,
    })

    const res = await sendEmailHook(req)
    expect(res.status).toBe(401)
  })

  it('3. Rejects request with timestamp 6 minutes in the future', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const msgId = 'msg_future_skew'
    const sixMinutesFuture = (Math.floor(Date.now() / 1000) + 360).toString()
    const payloadToSign = `${msgId}.${sixMinutesFuture}.${rawBody}`
    const sig = computeSignature(payloadToSign, PROD_SECRET)

    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: {
        'webhook-id': msgId,
        'webhook-timestamp': sixMinutesFuture,
        'webhook-signature': `v1,${sig}`,
      },
      body: rawBody,
    })

    const res = await sendEmailHook(req)
    expect(res.status).toBe(401)
  })

  it('4. Rejects Bearer token authorization (legacy path removed)', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${PROD_SECRET}`,
      },
      body: rawBody,
    })

    const res = await sendEmailHook(req)
    expect(res.status).toBe(401)
  })

  it('5. Rejects custom headers x-supabase-auth-secret (legacy path removed)', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: {
        'x-supabase-auth-secret': PROD_SECRET,
      },
      body: rawBody,
    })

    const res = await sendEmailHook(req)
    expect(res.status).toBe(401)
  })

  it('6. Rejects request missing webhook-id header', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const now = Math.floor(Date.now() / 1000).toString()
    const payloadToSign = `.${now}.${rawBody}`
    const sig = computeSignature(payloadToSign, PROD_SECRET)

    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: {
        'webhook-timestamp': now,
        'webhook-signature': `v1,${sig}`,
      },
      body: rawBody,
    })

    const res = await sendEmailHook(req)
    expect(res.status).toBe(401)
  })

  it('7. Rejects request missing webhook-timestamp header', async () => {
    const rawBody = JSON.stringify(PAYLOAD)
    const msgId = 'msg_no_time'
    const sig = computeSignature(`${msgId}..${rawBody}`, PROD_SECRET)

    const req = new NextRequest(HOOK_URL, {
      method: 'POST',
      headers: {
        'webhook-id': msgId,
        'webhook-signature': `v1,${sig}`,
      },
      body: rawBody,
    })

    const res = await sendEmailHook(req)
    expect(res.status).toBe(401)
  })
})
