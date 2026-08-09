import assert from 'assert'
import {
  validateUsername,
  validateOptionalUrl,
  generatePersonJsonLd,
  formatPortfolioShareUrl,
} from '../portfolio'

console.log('🧪 Running Public Portfolio Unit Test Suite...\n')

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

// 1. Username Validation
runTest('validateUsername accepts valid usernames', () => {
  assert.strictEqual(validateUsername('johndoe').isValid, true)
  assert.strictEqual(validateUsername('john_doe_99').isValid, true)
  assert.strictEqual(validateUsername('pm-leader').isValid, true)
})

runTest('validateUsername rejects invalid or short/long usernames', () => {
  assert.strictEqual(validateUsername('ab').isValid, false, 'Should reject < 3 chars')
  assert.strictEqual(validateUsername('a'.repeat(35)).isValid, false, 'Should reject > 30 chars')
  assert.strictEqual(validateUsername('john@doe!').isValid, false, 'Should reject special chars')
  assert.strictEqual(validateUsername('admin').isValid, false, 'Should reject reserved word admin')
  assert.strictEqual(validateUsername('settings').isValid, false, 'Should reject reserved word settings')
})

// 2. URL Validation
runTest('validateOptionalUrl validates HTTP and HTTPS URLs', () => {
  assert.strictEqual(validateOptionalUrl('https://linkedin.com/in/johndoe'), true)
  assert.strictEqual(validateOptionalUrl('http://mywebsite.com'), true)
  assert.strictEqual(validateOptionalUrl(''), true, 'Empty string should be valid (optional)')
  assert.strictEqual(validateOptionalUrl(null), true)
  assert.strictEqual(validateOptionalUrl('ftp://invalid-protocol.com'), false)
  assert.strictEqual(validateOptionalUrl('not-a-url'), false)
})

// 3. Person Schema JSON-LD Generation
runTest('generatePersonJsonLd generates valid schema.org Person structured data', () => {
  const jsonLd = generatePersonJsonLd({
    name: 'Alex Rivera',
    username: 'arivera',
    title: 'Senior PM',
    bio: 'Product Manager building SaaS platforms.',
    avatarUrl: 'https://example.com/avatar.jpg',
    linkedinUrl: 'https://linkedin.com/in/arivera',
    githubUrl: 'https://github.com/arivera',
    siteOrigin: 'https://prodily.adityagangwani.me',
  })

  assert.strictEqual(jsonLd['@context'], 'https://schema.org')
  assert.strictEqual(jsonLd['@type'], 'Person')
  assert.strictEqual(jsonLd.name, 'Alex Rivera')
  assert.strictEqual(jsonLd.jobTitle, 'Senior PM')
  assert.strictEqual(jsonLd.url, 'https://prodily.adityagangwani.me/p/arivera')
  assert.ok(Array.isArray(jsonLd.sameAs))
  assert.strictEqual((jsonLd.sameAs as string[]).length, 2)
})

// 4. Share URL Formatting
runTest('formatPortfolioShareUrl returns clean canonical URL', () => {
  const url = formatPortfolioShareUrl('https://prodily.adityagangwani.me/', 'arivera')
  assert.strictEqual(url, 'https://prodily.adityagangwani.me/p/arivera')
})

console.log(`\n✅ All ${passedTests} Portfolio Unit Tests Passed Successfully!\n`)
