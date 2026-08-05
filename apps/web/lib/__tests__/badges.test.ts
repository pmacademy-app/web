import assert from 'assert'
import { BADGE_DEFINITIONS, getBadgeDefinition } from '../../config/badges'
import { calculateBadgeProgress, evaluateEligibleBadges } from '../badges'

console.log('🧪 Running Badge & Achievement System Unit Test Suite...\n')

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

// 1. Badge Definitions Structure
runTest('BADGE_DEFINITIONS contains unique keys and required metadata', () => {
  assert.ok(BADGE_DEFINITIONS.length >= 14, `Expected at least 14 badges, found ${BADGE_DEFINITIONS.length}`)
  const keys = new Set<string>()

  for (const b of BADGE_DEFINITIONS) {
    assert.ok(!keys.has(b.key), `Duplicate badge key detected: ${b.key}`)
    keys.add(b.key)
    assert.ok(b.name.length > 0, `Badge ${b.key} missing name`)
    assert.ok(b.description.length > 0, `Badge ${b.key} missing description`)
    assert.ok(b.targetGoal > 0, `Badge ${b.key} targetGoal must be > 0`)
  }
})

// 2. Progress Calculation
runTest('calculateBadgeProgress computes percentage and earned status correctly', () => {
  const firstLessonBadge = getBadgeDefinition('first_lesson')!
  const streak7Badge = getBadgeDefinition('streak_7')!

  const unearnedStats = {
    lessonsCompletedCount: 0,
    modulesCompletedCount: 0,
    perfectFirstAttemptQuizCount: 0,
    perfectQuizCount: 0,
    totalXp: 0,
    level: 1,
    currentStreak: 3,
    longestStreak: 3,
    capstonesSubmittedCount: 0,
    isPortfolioPublic: false,
  }

  const progressUnearned = calculateBadgeProgress(firstLessonBadge, unearnedStats)
  assert.strictEqual(progressUnearned.isEarned, false)
  assert.strictEqual(progressUnearned.progressPercentage, 0)

  const progressStreak = calculateBadgeProgress(streak7Badge, { ...unearnedStats, currentStreak: 5 })
  assert.strictEqual(progressStreak.isEarned, false)
  assert.strictEqual(progressStreak.currentValue, 5)
  assert.strictEqual(progressStreak.progressPercentage, 71)

  const progressEarned = calculateBadgeProgress(firstLessonBadge, { ...unearnedStats, lessonsCompletedCount: 1 })
  assert.strictEqual(progressEarned.isEarned, true)
  assert.strictEqual(progressEarned.progressPercentage, 100)
})

// 3. Eligible Badges Evaluation
runTest('evaluateEligibleBadges unlocks new badges and ignores already earned keys', () => {
  const stats = {
    lessonsCompletedCount: 10,
    modulesCompletedCount: 1,
    perfectFirstAttemptQuizCount: 1,
    perfectQuizCount: 1,
    totalXp: 1200,
    level: 3,
    currentStreak: 7,
    longestStreak: 7,
    capstonesSubmittedCount: 1,
    isPortfolioPublic: true,
  }

  const alreadyEarned = new Set<string>(['first_lesson', 'first_perfect_quiz'])
  const newlyEligible = evaluateEligibleBadges(stats, alreadyEarned)

  const newKeys = newlyEligible.map((b) => b.key)
  assert.ok(!newKeys.includes('first_lesson'), 'Should not re-award first_lesson')
  assert.ok(!newKeys.includes('first_perfect_quiz'), 'Should not re-award first_perfect_quiz')
  assert.ok(newKeys.includes('module_complete'), 'Should award module_complete')
  assert.ok(newKeys.includes('xp_1000'), 'Should award xp_1000')
  assert.ok(newKeys.includes('streak_7'), 'Should award streak_7')
  assert.ok(newKeys.includes('first_capstone'), 'Should award first_capstone')
  assert.ok(newKeys.includes('portfolio_published'), 'Should award portfolio_published')
})

console.log(`\n✅ All ${passedTests} Badge System Unit Tests Passed Successfully!\n`)
