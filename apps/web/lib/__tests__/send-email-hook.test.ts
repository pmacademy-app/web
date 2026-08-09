import assert from 'assert'
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { buildAuthCallbackUrl, POST } from '../../app/api/auth/send-email-hook/route'
import { BRAND } from '@/lib/brand'

console.log('🧪 Running Supabase Send Email Auth Hook Unit Test Suite...\n')

let passedTests = 0

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          passedTests++
          console.log(`  ✓ ${name}`)
        })
        .catch((err) => {
          console.error(`  ✕ ${name}`)
          console.error(err)
          process.exit(1)
        })
    }
    passedTests++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

async function runSendEmailHookTests() {
  const siteUrl = 'https://prodily.adityagangwani.me'

  // 1. buildAuthCallbackUrl - canonical link generation
  runTest('buildAuthCallbackUrl generates canonical callback URLs with token_hash and type', () => {
    const signupUrl = buildAuthCallbackUrl(siteUrl, 'hash_abc123', 'signup')
    assert.strictEqual(signupUrl, 'https://prodily.adityagangwani.me/api/auth/callback?token_hash=hash_abc123&type=signup&next=%2Fverified')

    const recoveryUrl = buildAuthCallbackUrl(siteUrl, 'hash_pwd456', 'recovery')
    assert.strictEqual(recoveryUrl, 'https://prodily.adityagangwani.me/api/auth/callback?token_hash=hash_pwd456&type=recovery&next=%2Freset-password%3Fmode%3Dupdate')

    const customRedirect = buildAuthCallbackUrl(siteUrl, 'hash_789', 'signup', 'https://prodily.adityagangwani.me/api/auth/callback?next=/custom-destination')
    assert.ok(customRedirect.includes('token_hash=hash_789'))
    assert.ok(customRedirect.includes('type=signup'))
    assert.ok(customRedirect.includes('next=%2Fcustom-destination'))
  })

  async function parseRes(res: Response) {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      return { rawText: text }
    }
  }

  // 2. Payload Validation
  await runTest('POST /api/auth/send-email-hook rejects invalid JSON or missing fields', async () => {
    const badReq = new NextRequest('http://localhost:3000/api/auth/send-email-hook', {
      method: 'POST',
      body: 'invalid-json',
    })
    const res = await POST(badReq)
    assert.strictEqual(res.status, 400)
    const data = await parseRes(res)
    assert.ok(data.error?.includes('Invalid JSON'))

    const missingUserReq = new NextRequest('http://localhost:3000/api/auth/send-email-hook', {
      method: 'POST',
      body: JSON.stringify({ user: {}, email_data: { email_action_type: 'signup' } }),
    })
    const res2 = await POST(missingUserReq)
    assert.strictEqual(res2.status, 400)
    const data2 = await parseRes(res2)
    assert.ok(data2.error?.includes('Missing user email'))
  })

  // 3. Secret Verification (Bearer Token & Custom Headers)
  await runTest('POST /api/auth/send-email-hook enforces SEND_EMAIL_HOOK_SECRET when configured', async () => {
    process.env.SEND_EMAIL_HOOK_SECRET = 'test_secret_key_123'

    const unauthReq = new NextRequest('http://localhost:3000/api/auth/send-email-hook', {
      method: 'POST',
      body: JSON.stringify({
        user: { id: 'usr-1', email: 'test@example.com' },
        email_data: { email_action_type: 'signup', token_hash: 'th_123' },
      }),
    })
    const res1 = await POST(unauthReq)
    assert.strictEqual(res1.status, 401)

    // Bearer token
    const authReq = new NextRequest('http://localhost:3000/api/auth/send-email-hook', {
      method: 'POST',
      headers: { Authorization: 'Bearer test_secret_key_123' },
      body: JSON.stringify({
        user: { id: 'usr-1', email: 'test@example.com' },
        email_data: { email_action_type: 'signup', token_hash: 'th_123' },
      }),
    })
    const res2 = await POST(authReq)
    assert.strictEqual(res2.status, 200)

    // Clean up env
    delete process.env.SEND_EMAIL_HOOK_SECRET
  })

  // 4. HMAC SHA-256 Signature Verification
  await runTest('POST /api/auth/send-email-hook verifies HMAC-SHA256 signatures', async () => {
    const secret = 'hmac_secret_key_456'
    process.env.SEND_EMAIL_HOOK_SECRET = secret

    const payloadObj = {
      user: { id: 'usr-hmac', email: 'hmac@example.com', user_metadata: { full_name: 'HMAC Tester' } },
      email_data: { email_action_type: 'recovery', token_hash: 'th_hmac_999' },
    }
    const rawBody = JSON.stringify(payloadObj)
    const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

    const hmacReq = new NextRequest('http://localhost:3000/api/auth/send-email-hook', {
      method: 'POST',
      headers: { 'x-supabase-signature': sig },
      body: rawBody,
    })
    const res = await POST(hmacReq)
    assert.strictEqual(res.status, 200)

    delete process.env.SEND_EMAIL_HOOK_SECRET
  })

  // 5. Auth Actions (Signup, Password Reset, Email Change, Invite) Execution
  await runTest('POST /api/auth/send-email-hook executes signup & recovery email templates successfully', async () => {
    const signupPayload = {
      user: { id: 'usr-signup', email: 'newuser@example.com', user_metadata: { full_name: 'Alice Builder' } },
      email_data: {
        email_action_type: 'signup',
        token_hash: 'hash_signup_111',
        redirect_to: `${BRAND.siteUrl}/api/auth/callback?next=/verified`,
      },
    }

    const signupReq = new NextRequest('http://localhost:3000/api/auth/send-email-hook', {
      method: 'POST',
      body: JSON.stringify(signupPayload),
    })
    const signupRes = await POST(signupReq)
    assert.strictEqual(signupRes.status, 200)
    const signupData = await parseRes(signupRes)
    assert.strictEqual(signupData.success, true)

    const recoveryPayload = {
      user: { id: 'usr-rec', email: 'reset@example.com', user_metadata: { full_name: 'Bob Reset' } },
      email_data: {
        email_action_type: 'recovery',
        token_hash: 'hash_rec_222',
      },
    }

    const recoveryReq = new NextRequest('http://localhost:3000/api/auth/send-email-hook', {
      method: 'POST',
      body: JSON.stringify(recoveryPayload),
    })
    const recoveryRes = await POST(recoveryReq)
    assert.strictEqual(recoveryRes.status, 200)
    const recoveryData = await parseRes(recoveryRes)
    assert.strictEqual(recoveryData.success, true)
  })

  console.log(`\n✅ All ${passedTests} Supabase Send Email Hook Unit Tests Passed Successfully!\n`)
}

runSendEmailHookTests()
