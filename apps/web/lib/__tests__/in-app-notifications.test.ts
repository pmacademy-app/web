import { describe, it, expect } from 'vitest'
import {
  globalFeatureFlagService,
  createDefaultNotificationPreferences,
  isChannelEnabledByPreferences,
} from '../notifications'
import { buildInAppContentFromEvent } from '../notifications/in-app/service'
import { isSafeNotificationLink } from '../notifications/in-app/secondary-action'
import {
  getBatchUserNotificationPreferences,
  NotificationPreferencesReadError,
} from '../notifications/preferences/defaults'

describe('In-App Notification System Unit Test Suite', () => {
  it('Feature flag IN_APP_NOTIFICATIONS_ENABLED is active by default', () => {
    const isEnabled = globalFeatureFlagService.isEnabled('IN_APP_NOTIFICATIONS_ENABLED')
    expect(isEnabled).toBe(true)
  })

  it('User notification preferences accurately reflect in-app category permissions', () => {
    const prefs = createDefaultNotificationPreferences('usr-test-01')
    expect(isChannelEnabledByPreferences(prefs, 'learning', 'in_app')).toBe(true)
    expect(isChannelEnabledByPreferences(prefs, 'achievements', 'in_app')).toBe(true)
    expect(isChannelEnabledByPreferences(prefs, 'security', 'in_app')).toBe(true)
    expect(isChannelEnabledByPreferences(prefs, 'marketing', 'in_app')).toBe(false)
  })

  it('Deep link mapping routes correctly per event type', () => {
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
          return '/progress/certificates'
        case 'portfolio.published':
          return typeof meta?.username === 'string' ? `/p/${meta.username}` : '/settings'
        case 'srs.review_due':
          return '/review'
        default:
          return '/dashboard'
      }
    }

    expect(getDeepLink('badge.earned')).toBe('/badges')
    expect(getDeepLink('lesson.completed')).toBe('/academy')
    expect(getDeepLink('srs.review_due')).toBe('/review')
    expect(getDeepLink('certificate.generated', { certificateCode: 'PMA-123' })).toBe('/progress/certificates')
    expect(getDeepLink('portfolio.published', { username: 'alex' })).toBe('/p/alex')
  })

  it('certificate.generated deep-links to the learner certificates page, not the public verify page', () => {
    const content = buildInAppContentFromEvent({
      id: 'certificate-generated-PMA-2026-ABCDEF12',
      event: 'certificate.generated',
      userId: 'usr-1',
      userEmail: 'usr@test.com',
      userName: 'Learner',
      userTimezone: 'UTC',
      priority: 'high',
      category: 'certificates',
      occurredAt: new Date().toISOString(),
      payload: { certificateCode: 'PMA-2026-ABCDEF12', certificateType: 'full_curriculum' },
    })

    expect(content.actionUrl).toBe('/progress/certificates')
    expect(content.body).toContain('PMA-2026-ABCDEF12')
  })

  it('Notification date grouping categorizes items by relative time', () => {
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
    expect(res.today.length).toBe(1)
    expect(res.yesterday.length).toBe(1)
    expect(res.thisWeek.length).toBe(1)
  })
})

// A failed batch read returns defaults (everyone opted in) unless the caller asks for `strict`,
// which a bulk sender uses to skip the batch instead of mailing opted-out learners.
describe('getBatchUserNotificationPreferences on a failed read', () => {
  const failing = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'down' } }) }) }) }
  const throwing = {
    from: () => {
      throw new Error('network')
    },
  }

  it('falls back to default preferences by default', async () => {
    const map = await getBatchUserNotificationPreferences(failing, ['u1'])
    expect(map.get('u1')?.learning.email).toBe(true)
  })

  it.each([
    ['an error result', failing],
    ['a thrown error', throwing],
  ])('strict: throws on %s', async (_label, supabase) => {
    await expect(getBatchUserNotificationPreferences(supabase, ['u1'], { strict: true })).rejects.toBeInstanceOf(
      NotificationPreferencesReadError,
    )
  })

  it('strict: still resolves stored rows, and defaults for learners without one', async () => {
    const ok = {
      from: () => ({ select: () => ({ in: async () => ({ data: [{ user_id: 'u1', learning_email: false }], error: null }) }) }),
    }
    const map = await getBatchUserNotificationPreferences(ok, ['u1', 'u2'], { strict: true })
    expect(map.get('u1')?.learning.email).toBe(false)
    expect(map.get('u2')?.learning.email).toBe(true)
  })
})

// GET /api/notifications returns a stored action_url only when it passes this check; otherwise
// the item opens its category page.
describe('isSafeNotificationLink', () => {
  it.each(['/academy', '/settings?tab=portfolio', '/p/ada/capstones/discovery', 'https://example.com/launch?x=1'])(
    'accepts %s',
    (value) => {
      expect(isSafeNotificationLink(value)).toBe(true)
    },
  )

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.com',
    '//evil.com',
    '/\\evil.com',
    'https://user:pass@evil.com',
    'https://user@evil.com',
    'https:evil.com',
    'https:\\\\evil.com',
    ' https://example.com',
    'https://',
    'academy',
    '',
    null,
    undefined,
    42,
  ])('rejects %s', (value) => {
    expect(isSafeNotificationLink(value)).toBe(false)
  })
})
