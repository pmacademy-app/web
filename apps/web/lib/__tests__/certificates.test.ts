import assert from 'assert'
import {
  generateCertificateCode,
  generateCredentialJsonLd,
  generateQrCodeSvg,
} from '../certificates'
import { buildLinkedInCertificationUrl } from '../certificates/linkedin-url'

console.log('🧪 Running Certificates & Credentials System 2.0 Unit Test Suite...\n')

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
    verificationUrl: 'https://pmacademy.adityagangwani.me/verify/PMA-2026-A1B2C3D4',
    portfolioUrl: 'https://pmacademy.adityagangwani.me/p/sconnor',
    siteOrigin: 'https://pmacademy.adityagangwani.me',
  })

  assert.strictEqual(jsonLd['@context'], 'https://schema.org')
  assert.strictEqual(jsonLd['@type'], 'EducationalOccupationalCredential')
  assert.strictEqual(jsonLd.identifier, 'PMA-2026-A1B2C3D4')
  assert.strictEqual((jsonLd.grantee as { name: string }).name, 'Sarah Connor')
  assert.strictEqual(jsonLd.url, 'https://pmacademy.adityagangwani.me/verify/PMA-2026-A1B2C3D4')
})

// 3. QR Code SVG Generator
runTest('generateQrCodeSvg outputs clean SVG vector markup containing rectangles for verification URL', () => {
  const verifyUrl = 'https://pmacademy.adityagangwani.me/verify/PMA-2026-A1B2C3D4'
  const svg = generateQrCodeSvg(verifyUrl, 100)

  assert.ok(svg.includes('<svg'), 'Output should contain <svg element')
  assert.ok(svg.includes('rect'), 'Output should contain <rect elements for QR pixels')
  assert.ok(svg.includes('viewBox="0 0 21 21"'), 'Output should have 21x21 viewBox')
})

// 4. LinkedIn Certification Add-to-Profile URL Builder (Sprint 7.3)
runTest('buildLinkedInCertificationUrl constructs valid LinkedIn add-to-profile URL with full parameters', () => {
  const certCode = 'PMA-2026-B87F129C'
  const verifyUrl = 'https://pmacademy.adityagangwani.me/verify/PMA-2026-B87F129C'
  const issuedAt = '2026-08-08T00:00:00.000Z'

  const linkedinUrl = buildLinkedInCertificationUrl({
    certificateCode: certCode,
    careerTitle: 'Principal Product Manager',
    type: 'full_curriculum',
    issuedAt,
    verificationUrl: verifyUrl,
  })

  assert.ok(linkedinUrl.startsWith('https://www.linkedin.com/profile/add'), 'Must start with LinkedIn profile add endpoint')
  assert.ok(linkedinUrl.includes('startTask=CERTIFICATION_NAME'), 'Must specify CERTIFICATION_NAME task')
  assert.ok(linkedinUrl.includes('organizationName=Prodily'), 'Must set issuing organization to Prodily')
  assert.ok(linkedinUrl.includes('certId=PMA-2026-B87F129C'), 'Must include exact credential ID')
  assert.ok(linkedinUrl.includes('issueYear=2026'), 'Must set issue year correctly')
  assert.ok(linkedinUrl.includes('issueMonth=8'), 'Must set issue month correctly')
  assert.ok(linkedinUrl.includes(encodeURIComponent(verifyUrl)), 'Must URL-encode verification link parameter')
})

console.log(`\n✅ All ${passedTests} Certificates 2.0 Unit Tests Passed Successfully!\n`)
