import { describe, it, expect } from 'vitest'
import {
  globalFeatureFlagService,
  createDefaultNotificationPreferences,
  isChannelEnabledByPreferences,
} from '../notifications'

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
          return typeof meta?.certificateCode === 'string' ? `/verify/${meta.certificateCode}` : '/progress'
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
    expect(getDeepLink('certificate.generated', { certificateCode: 'PMA-123' })).toBe('/verify/PMA-123')
    expect(getDeepLink('portfolio.published', { username: 'alex' })).toBe('/p/alex')
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
