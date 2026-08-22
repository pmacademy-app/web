import { describe, it, expect } from 'vitest'
import {
  buildBadgeOverviews,
  computeAchievementsOverviewKpis,
  computeBadgeKpis,
  computeCertificateKpis,
  filterBadges,
  filterCertificates,
  paginate,
  sortBadges,
  sortCertificates,
  type AdminBadgeOverview,
  type AdminCertificateRow,
} from '../admin/achievements-aggregation'
import type { BadgeDefinition } from '@/config/badges'

const badgeDef = (key: string, name: string, category: BadgeDefinition['category']): BadgeDefinition => ({
  key,
  name,
  description: `${name} description`,
  category,
  icon: 'Award',
  targetGoal: 1,
  criteriaText: 'Complete 1 lesson',
})

const badge = (key: string, name: string, category: string, awardCount: number): AdminBadgeOverview => ({
  key,
  name,
  description: `${name} description`,
  category,
  icon: 'Award',
  criteriaText: 'Complete 1 lesson',
  targetGoal: 1,
  awardCount,
})

const cert = (
  id: string,
  code: string,
  type: string,
  learnerName: string,
  issuedAt: string
): AdminCertificateRow => ({
  id,
  code,
  type,
  learnerName,
  userId: `user-${id}`,
  issuedAt,
  lessonsCompleted: 10,
  modulesCompleted: 1,
  careerTitle: 'Associate PM',
})

describe('Achievements & Moderation Aggregation Unit Test Suite', () => {
  it('buildBadgeOverviews merges definitions with award counts', () => {
    const defs = [badgeDef('a', 'Alpha', 'learning'), badgeDef('b', 'Beta', 'xp')]
    const counts = new Map<string, number>([
      ['a', 3],
      ['b', 0],
    ])
    const result = buildBadgeOverviews(defs, counts)
    expect(result.length).toBe(2)
    expect(result[0].awardCount).toBe(3)
    expect(result[1].awardCount).toBe(0)
  })

  it('buildBadgeOverviews defaults missing counts to zero', () => {
    const defs = [badgeDef('a', 'Alpha', 'learning')]
    const result = buildBadgeOverviews(defs, new Map())
    expect(result[0].awardCount).toBe(0)
  })

  it('filterBadges matches name, description and key', () => {
    const badges = [
      badge('first_lesson', 'First Step', 'learning', 5),
      badge('xp_1000', 'XP 1000', 'xp', 2),
    ]
    expect(filterBadges(badges, 'first', null).length).toBe(1)
    expect(filterBadges(badges, 'description', null).length).toBe(2)
    expect(filterBadges(badges, 'xp_1000', null).length).toBe(1)
    expect(filterBadges(badges, '', null).length).toBe(2)
  })

  it('filterBadges filters by category', () => {
    const badges = [
      badge('first_lesson', 'First Step', 'learning', 5),
      badge('xp_1000', 'XP 1000', 'xp', 2),
    ]
    expect(filterBadges(badges, '', 'xp').length).toBe(1)
    expect(filterBadges(badges, '', 'streak').length).toBe(0)
  })

  it('sortBadges sorts by awardCount desc by default', () => {
    const badges = [
      badge('a', 'Alpha', 'learning', 1),
      badge('b', 'Beta', 'xp', 9),
    ]
    const sorted = sortBadges(badges, 'awardCount', 'desc')
    expect(sorted[0].key).toBe('b')
    const asc = sortBadges(badges, 'awardCount', 'asc')
    expect(asc[0].key).toBe('a')
  })

  it('sortBadges sorts by name', () => {
    const badges = [
      badge('b', 'Beta', 'xp', 1),
      badge('a', 'Alpha', 'learning', 1),
    ]
    const sorted = sortBadges(badges, 'name', 'asc')
    expect(sorted[0].key).toBe('a')
  })

  it('computeBadgeKpis totals awards and finds most awarded', () => {
    const badges = [
      badge('a', 'Alpha', 'learning', 3),
      badge('b', 'Beta', 'xp', 7),
    ]
    const kpis = computeBadgeKpis(badges)
    expect(kpis.totalBadges).toBe(2)
    expect(kpis.totalAwards).toBe(10)
    expect(kpis.mostAwarded).toEqual({ name: 'Beta', count: 7 })
  })

  it('computeBadgeKpis handles empty set', () => {
    const kpis = computeBadgeKpis([])
    expect(kpis.totalBadges).toBe(0)
    expect(kpis.totalAwards).toBe(0)
    expect(kpis.mostAwarded).toBeNull()
  })

  it('filterCertificates matches learner name and code', () => {
    const certs = [
      cert('1', 'CERT-ABC', 'full_curriculum', 'Alice Rivera', '2026-01-01T00:00:00Z'),
      cert('2', 'CERT-XYZ', 'module', 'Bob Chen', '2026-02-01T00:00:00Z'),
    ]
    expect(filterCertificates(certs, 'alice', null).length).toBe(1)
    expect(filterCertificates(certs, 'CERT-XYZ', null).length).toBe(1)
    expect(filterCertificates(certs, '', null).length).toBe(2)
  })

  it('filterCertificates filters by type', () => {
    const certs = [
      cert('1', 'CERT-ABC', 'full_curriculum', 'Alice Rivera', '2026-01-01T00:00:00Z'),
      cert('2', 'CERT-XYZ', 'module', 'Bob Chen', '2026-02-01T00:00:00Z'),
    ]
    expect(filterCertificates(certs, '', 'module').length).toBe(1)
    expect(filterCertificates(certs, '', 'specialization').length).toBe(0)
  })

  it('sortCertificates sorts by issuedAt', () => {
    const certs = [
      cert('1', 'CERT-ABC', 'full_curriculum', 'Alice Rivera', '2026-01-01T00:00:00Z'),
      cert('2', 'CERT-XYZ', 'module', 'Bob Chen', '2026-02-01T00:00:00Z'),
    ]
    const desc = sortCertificates(certs, 'issuedAt', 'desc')
    expect(desc[0].id).toBe('2')
    const asc = sortCertificates(certs, 'issuedAt', 'asc')
    expect(asc[0].id).toBe('1')
  })

  it('computeCertificateKpis counts this month, recent and distinct types', () => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const day = 24 * 60 * 60 * 1000
    const certs = [
      cert('1', 'CERT-ABC', 'full_curriculum', 'Alice Rivera', now.toISOString()),
      cert('2', 'CERT-XYZ', 'module', 'Bob Chen', new Date(now.getTime() - 10 * day).toISOString()),
      cert('3', 'CERT-123', 'full_curriculum', 'Carol Diaz', new Date(now.getTime() - 45 * day).toISOString()),
      cert('4', 'CERT-456', 'specialization', 'Dan Lee', new Date(now.getTime() - 90 * day).toISOString()),
    ]
    const kpis = computeCertificateKpis(certs)
    expect(kpis.totalIssued).toBe(4)
    expect(kpis.recentlyIssued).toBe(2)
    expect(kpis.issuedThisMonth).toBe(certs.filter((c) => new Date(c.issuedAt) >= monthStart).length)
    expect(kpis.distinctTypes).toBe(3)
  })

  it('paginate slices and reports total', () => {
    const items = [1, 2, 3, 4, 5]
    const page1 = paginate(items, 1, 2)
    expect(page1.items).toEqual([1, 2])
    expect(page1.total).toBe(5)
    const page3 = paginate(items, 3, 2)
    expect(page3.items).toEqual([5])
    const outOfRange = paginate(items, 9, 2)
    expect(outOfRange.items).toEqual([])
  })

  it('computeAchievementsOverviewKpis passes through values', () => {
    const kpis = computeAchievementsOverviewKpis({
      badgesDefined: 16,
      badgesAwarded: 42,
      certificatesIssued: 7,
      certificatesThisMonth: 2,
      pendingCapstones: 3,
    })
    expect(kpis).toEqual({
      badgesDefined: 16,
      badgesAwarded: 42,
      certificatesIssued: 7,
      certificatesThisMonth: 2,
      pendingCapstones: 3,
    })
  })
})