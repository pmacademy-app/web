import assert from 'assert'
import { renderEmailTemplate } from '../../emails'

console.log('🧪 Running Email Engine & Delivery Unit Test Suite...\n')

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

async function runAllEmailEngineTests() {
  // Queue cleanup is no longer applicable since it uses Supabase DB natively

  // 1. Template Rendering (React Email -> HTML & Text Output)
  await runTest('renderEmailTemplate compiles React Email components to HTML and plain text', async () => {
    const rendered = await renderEmailTemplate('auth.welcome', { userName: 'Sarah' })
    assert.ok(rendered.html.includes('Prodily PM Academy'))
    assert.ok(rendered.html.includes('Welcome to Prodily PM Academy, Sarah!'))
    assert.ok(rendered.text.includes('Welcome to Prodily PM Academy'))
    assert.ok(rendered.subject.includes('Welcome to PM Academy'))

    const badgeRendered = await renderEmailTemplate('achievement.badge_earned', {
      userName: 'Sarah',
      badgeName: 'First Step',
      badgeDescription: 'Completed 1st lesson',
    })
    assert.ok(badgeRendered.subject.includes('First Step'))
    assert.ok(badgeRendered.html.includes('First Step'))
  })

  // Removed stale tests that relied on in-memory queue which was replaced by Supabase DB

  console.log(`\n✅ All ${passedTests} Email Engine Unit Tests Passed Successfully!\n`)
}

runAllEmailEngineTests()
