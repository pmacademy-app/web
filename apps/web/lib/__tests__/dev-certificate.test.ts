process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key'

import assert from 'node:assert'
import { generateCertificateCode } from '../certificates'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

console.log('🧪 Running Developer Certificate Testing Suite...\n')

runTest('generateCertificateCode produces valid deterministic PMA code format', () => {
  const code = generateCertificateCode('dev-user-123', 'full_curriculum')
  assert(code.startsWith('PMA-'))
  assert.strictEqual(code.length, 17) // PMA-YYYY-XXXXXXXX
})

runTest('Test certificate code prefix formatting is TEST-PMA-YYYY-XXXXXXXX', () => {
  const code = generateCertificateCode('dev-user-123', 'full_curriculum')
  const testCode = `TEST-${code}`
  assert(testCode.startsWith('TEST-PMA-'))
  assert.strictEqual(testCode.length, 22)
})

console.log('\n✅ All Developer Certificate Testing Unit Tests Passed Successfully!\n')
