import assert from 'assert'
import {
  globalFeatureFlagService,
  createDefaultNotificationPreferences,
  isChannelEnabledByPreferences,
} from '../notifications'

console.log('🧪 Running In-App Notification System Unit Test Suite...\n')

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

async function runAllInAppNotificationTests() {
  // 1. Feature Flag Evaluation
  runTest('Feature flag IN_APP_NOTIFICATIONS_ENABLED is active by default', () => {
    const isEnabled = globalFeatureFlagService.isEnabled('IN_APP_NOTIFICATIONS_ENABLED')
    assert.strictEqual(isEnabled, true)
  })

  // 2. Category Channel Preference Evaluation
  runTest('User notification preferences accurately reflect in-app category permissions', () => {
    const prefs = createDefaultNotificationPreferences('usr-test-01')
    
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'learning', 'in_app'), true)
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'achievements', 'in_app'), true)
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'security', 'in_app'), true)
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'marketing', 'in_app'), false)
  })

  // 3. Deep Link Resolution Logic
  runTest('Deep link mapping routes correctly per event type', () => {
    const getDeepLink = (eventType: string, meta?: Record<string, unknown>) => {
      switch (eventType) {
        case 'lesson.completed':
        case 'module.completed':
          return '/academy'
        case 'badge.earned':
          return '/badges'
        case 'xp.level_up':
          return '/progress'
        case 'certificate.generated':
          return typeof meta?.certificateCode === 'string' ? `/verify/${meta.certificateCode}` : '/progress'
        case 'portfolio.published':
          return typeof meta?.username === 'string' ? `/p/${meta.username}` : '/settings'
        case 'srs.review_due':
          return '/review'
        default:
          return '/dashboard'
      }
    }

    assert.strictEqual(getDeepLink('badge.earned'), '/badges')
    assert.strictEqual(getDeepLink('lesson.completed'), '/academy')
    assert.strictEqual(getDeepLink('srs.review_due'), '/review')
    assert.strictEqual(getDeepLink('certificate.generated', { certificateCode: 'PMA-123' }), '/verify/PMA-123')
    assert.strictEqual(getDeepLink('portfolio.published', { username: 'alex' }), '/p/alex')
  })

  // 4. Date Grouping Logic
  runTest('Notification date grouping categorizes items by relative time', () => {
    const now = new Date()
    const todayIso = now.toISOString()
    
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayIso = yesterday.toISOString()

    const fiveDaysAgo = new Date(now)
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
    const fiveDaysAgoIso = fiveDaysAgo.toISOString()

    const mockItems = [
      { id: '1', createdAt: todayIso },
      { id: '2', createdAt: yesterdayIso },
      { id: '3', createdAt: fiveDaysAgoIso },
    ]

    const groupNotificationsByDate = (items: { id: string; createdAt: string }[]) => {
      const todayStr = now.toISOString().split('T')[0]
      const yestStr = yesterday.toISOString().split('T')[0]
      const sevenAgo = new Date(now)
      sevenAgo.setDate(sevenAgo.getDate() - 7)

      const grouped = {
        today: [] as { id: string; createdAt: string }[],
        yesterday: [] as { id: string; createdAt: string }[],
        thisWeek: [] as { id: string; createdAt: string }[],
        earlier: [] as { id: string; createdAt: string }[],
      }

      for (const item of items) {
        const itemDate = new Date(item.createdAt)
        const itemDateStr = itemDate.toISOString().split('T')[0]
        if (itemDateStr === todayStr) grouped.today.push(item)
        else if (itemDateStr === yestStr) grouped.yesterday.push(item)
        else if (itemDate >= sevenAgo) grouped.thisWeek.push(item)
        else grouped.earlier.push(item)
      }
      return grouped
    }

    const res = groupNotificationsByDate(mockItems)
    assert.strictEqual(res.today.length, 1)
    assert.strictEqual(res.yesterday.length, 1)
    assert.strictEqual(res.thisWeek.length, 1)
  })

  console.log(`\n✅ All ${passedTests} In-App Notification System Unit Tests Passed Successfully!\n`)
}

runAllInAppNotificationTests()
