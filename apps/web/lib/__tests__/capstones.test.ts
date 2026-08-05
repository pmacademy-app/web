import assert from 'assert'
import {
  getAllCapstoneDefinitions,
  getCapstoneDefinition,
} from '../../config/capstones'
import {
  calculateCapstoneWordCount,
  validateCapstoneSubmission,
  deriveCapstoneStatus,
} from '../capstones'
import { XP_VALUES } from '../xp'

console.log('🧪 Running Capstones Unit Test Suite...\n')

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

// 1. Capstone Definitions
runTest('All 9 module capstone definitions exist and are ordered', () => {
  const definitions = getAllCapstoneDefinitions()
  assert.strictEqual(definitions.length, 9, 'Should have exactly 9 capstone definitions')
  assert.strictEqual(definitions[0].moduleSlug, 'foundations')
  assert.strictEqual(definitions[8].moduleSlug, 'capstone')
  
  for (let i = 0; i < definitions.length; i++) {
    assert.strictEqual(definitions[i].moduleNumber, i + 1)
    assert.ok(definitions[i].minWordCount >= 250, 'Minimum word count should be >= 250')
  }
})

runTest('getCapstoneDefinition retrieves correct definition by slug', () => {
  const foundations = getCapstoneDefinition('foundations')
  assert.ok(foundations)
  assert.strictEqual(foundations?.title, 'Product Opportunity Brief & Problem Definition')

  const invalid = getCapstoneDefinition('invalid-module-slug')
  assert.strictEqual(invalid, null)
})

// 2. Word Count Utility
runTest('calculateCapstoneWordCount calculates words and strips markdown formatting', () => {
  const markdownText = `# Header Title\n\nThis is a **bold** paragraph with *italic* text and a [link](https://example.com).\n\n> Blockquote here.`
  const { wordCount, characterCount } = calculateCapstoneWordCount(markdownText)

  assert.ok(wordCount > 10, `Expected word count > 10, got ${wordCount}`)
  assert.strictEqual(characterCount, markdownText.length)

  const emptyResult = calculateCapstoneWordCount('')
  assert.strictEqual(emptyResult.wordCount, 0)
  assert.strictEqual(emptyResult.characterCount, 0)
})

// 3. Submission Validation
runTest('validateCapstoneSubmission flags submissions below minimum word count', () => {
  const shortText = 'Short submission text with only a few words.'
  const validation = validateCapstoneSubmission('foundations', shortText)

  assert.strictEqual(validation.isValid, false)
  assert.ok(validation.missingRequirements.length > 0)
  assert.ok(validation.reason?.includes('Minimum 250 words required'))
})

runTest('validateCapstoneSubmission passes valid submission meeting word count and sections', () => {
  const validText = `
# Product Opportunity Brief: Customer Onboarding Improvement

## 1. Problem Statement
The user onboarding dropoff rate is currently 42% within the first 14 days. Customers report feeling overwhelmed by excessive initial configuration steps and unclear value propositions.

## 2. Target Persona & User Segment
Our primary target user persona is the Early Career Product Manager trying to quickly set up their workspace. Their main constraint is limited time during work hours.

## 3. Jobs-To-Be-Done (JTBD)
- **Core Job:** When I first sign up for the platform, I want a guided setup wizard so that I can reach my first value milestone in under 5 minutes.
- **Emotional Job:** Feel confident and competent using the tool.

## 4. Business Impact & Success Metrics
- **Primary Metric:** 14-day onboarding activation rate increase from 58% to 75%.
- **Secondary Metrics:** Time to first active project creation reduced from 20 minutes to 5 minutes.
- **Guardrail Metric:** User support ticket volume should not increase by more than 5%.

## 5. Key Risks & Hypotheses
We hypothesize that replacing raw forms with an interactive step-by-step checklist will increase activation by reducing cognitive overload.
`.repeat(2) // duplicate to guarantee word count > 250

  const validation = validateCapstoneSubmission('foundations', validText)

  assert.strictEqual(validation.isValid, true)
  assert.strictEqual(validation.missingRequirements.length, 0)
  assert.ok(validation.wordCount >= 250)
})

// 4. Status Derivation Logic
runTest('deriveCapstoneStatus returns appropriate status based on submission and progress', () => {
  assert.strictEqual(deriveCapstoneStatus('submitted'), 'submitted')
  assert.strictEqual(deriveCapstoneStatus('reviewed'), 'reviewed')
  assert.strictEqual(deriveCapstoneStatus('draft'), 'draft')
  assert.strictEqual(deriveCapstoneStatus(null, 8, 10), 'unlocked')
  assert.strictEqual(deriveCapstoneStatus(null, 2, 10), 'locked')
})

// 5. XP Constant Verification
runTest('Capstone XP constant is set to 150', () => {
  assert.strictEqual(XP_VALUES.CAPSTONE_SUBMITTED, 150, 'Capstone submission should award 150 XP')
})

console.log(`\n✅ All ${passedTests} Capstones Unit Tests Passed Successfully!\n`)
