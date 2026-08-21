import assert from 'assert'
import { NextRequest } from 'next/server'
import { POST } from '../../app/api/auth/update-password/route'

console.log('🧪 Running Password Update Endpoint Security & Functional Unit Tests...\n')

let passedTests = 0

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn()
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          console.log(`  ✓ ${name}`)
          passedTests++
        })
        .catch((err) => {
          console.error(`  ✕ ${name}`)
          console.error(err)
          process.exit(1)
        })
    }
    console.log(`  ✓ ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

async function runUpdatePasswordTests() {
  // 1. Rejects non-JSON Content-Type
  await runTest('Rejects non-JSON Content-Type with 415', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'newPassword=123456',
    })
    const res = await POST(req)
    assert.strictEqual(res.status, 415)
    const json = await res.json()
    assert.strictEqual(json.success, false)
    assert.strictEqual(json.error, 'Unsupported Content-Type. Expected application/json')
  })

  // 2. Rejects untrusted Origin header
  await runTest('Rejects untrusted Origin header with 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil-attacker-site.com',
      },
      body: JSON.stringify({ newPassword: 'newpassword123' }),
    })
    const res = await POST(req)
    assert.strictEqual(res.status, 403)
    const json = await res.json()
    assert.strictEqual(json.success, false)
    assert.strictEqual(json.error, 'Forbidden: Untrusted Origin')
  })

  // 3. Rejects missing password or short password
  await runTest('Rejects short password (< 6 chars) with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: '123' }),
    })
    const res = await POST(req)
    assert.strictEqual(res.status, 400)
    const json = await res.json()
    assert.strictEqual(json.success, false)
    assert.strictEqual(json.error, 'Password must be at least 6 characters.')
  })

  // 4. Rejects request without sb-access-token cookie
  await runTest('Rejects request without sb-access-token cookie with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'validPassword123' }),
    })
    const res = await POST(req)
    assert.strictEqual(res.status, 401)
    const json = await res.json()
    assert.strictEqual(json.success, false)
    assert.strictEqual(json.error, 'No active recovery session found. Please request a new password reset link.')
  })

  console.log(`\n✅ All ${passedTests} Password Update Security & Functional Unit Tests Passed Successfully!\n`)
}

runUpdatePasswordTests().catch((err) => {
  console.error('Test suite runner error:', err)
  process.exit(1)
})
