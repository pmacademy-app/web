import assert from 'assert'
import {
  generateCertificateCode,
  generateCredentialJsonLd,
  generateQrCodeSvg,
} from '../certificates'

console.log('🧪 Running Certificates & Credentials Unit Test Suite...\n')

let passedTests = 0

function runTest(name: string, fn: () => void) {
  try {
    fn()
    passedTests++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

// 1. Certificate Code Generation
runTest('generateCertificateCode formats clean code with PMA prefix and year', () => {
  const code = generateCertificateCode('user-123-abc', 'full_curriculum')
  const year = new Date().getFullYear()

  assert.ok(code.startsWith(`PMA-${year}-`), `Expected code to start with PMA-${year}-, got ${code}`)
  assert.strictEqual(code.length, 17, `Expected 17 character code (PMA-YYYY-8HEX), got length ${code.length}`)
})

runTest('generateCertificateCode is deterministic for identical inputs', () => {
  const code1 = generateCertificateCode('user-999', 'full_curriculum')
  const code2 = generateCertificateCode('user-999', 'full_curriculum')

  assert.strictEqual(code1, code2, 'Certificate codes should be deterministic for identical user and type')
})

// 2. Credential JSON-LD Schema
runTest('generateCredentialJsonLd generates valid schema.org EducationalOccupationalCredential', () => {
  const jsonLd = generateCredentialJsonLd({
    certificateCode: 'PMA-2026-A1B2C3D4',
    learnerName: 'Sarah Connor',
    careerTitle: 'Senior Product Manager',
    issuedAt: '2026-08-05T00:00:00Z',
    verificationUrl: 'https://pmacademy.com/verify/PMA-2026-A1B2C3D4',
    portfolioUrl: 'https://pmacademy.com/p/sconnor',
    siteOrigin: 'https://pmacademy.com',
  })

  assert.strictEqual(jsonLd['@context'], 'https://schema.org')
  assert.strictEqual(jsonLd['@type'], 'EducationalOccupationalCredential')
  assert.strictEqual(jsonLd.identifier, 'PMA-2026-A1B2C3D4')
  assert.strictEqual((jsonLd.grantee as { name: string }).name, 'Sarah Connor')
  assert.strictEqual(jsonLd.url, 'https://pmacademy.com/verify/PMA-2026-A1B2C3D4')
})

// 3. QR Code SVG Generator
runTest('generateQrCodeSvg outputs clean SVG vector markup containing rectangles', () => {
  const svg = generateQrCodeSvg('https://pmacademy.com/p/sconnor', 100)

  assert.ok(svg.includes('<svg'), 'Output should contain <svg element')
  assert.ok(svg.includes('rect'), 'Output should contain <rect elements for QR pixels')
  assert.ok(svg.includes('viewBox="0 0 21 21"'), 'Output should have 21x21 viewBox')
})

console.log(`\n✅ All ${passedTests} Certificates Unit Tests Passed Successfully!\n`)
