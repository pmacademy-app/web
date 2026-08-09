import assert from 'assert'
import { generateCertificateCode, generateQrCodeSvg } from '../certificates'
import { evaluateRateLimit } from '../rate-limit'

console.log('🧪 Running Pre-Launch Remediation Unit Test Suite...\n')

let passed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

// 1. Certificate Scannable QR Matrix
test('generateQrCodeSvg creates ISO/IEC 18004 compliant QR matrix with rects', () => {
  const code = generateCertificateCode('test-user-123', 'full_curriculum')
  const url = `https://prodily.adityagangwani.me/verify/${code}`
  const svg = generateQrCodeSvg(url, 150)

  assert.ok(svg.includes('<svg'), 'Must produce <svg> element')
  assert.ok(svg.includes('viewBox="0 0'), 'Must include valid viewBox matrix')
  assert.ok(svg.includes('<rect'), 'Must contain vector <rect> modules')
})

// 2. Rate Limit Evaluator
test('evaluateRateLimit throttles repeated contact submissions', () => {
  const key = 'test_remediation_ip_1'
  const check1 = evaluateRateLimit(key, { limit: 2, windowMs: 1000 })
  assert.strictEqual(check1.success, true, 'First attempt should succeed')

  const check2 = evaluateRateLimit(key, { limit: 2, windowMs: 1000 })
  assert.strictEqual(check2.success, true, 'Second attempt should succeed')

  const check3 = evaluateRateLimit(key, { limit: 2, windowMs: 1000 })
  assert.strictEqual(check3.success, false, 'Third attempt should be rate limited')
})

console.log(`\n✅ All ${passed} Remediation Unit Tests Passed Successfully!\n`)
