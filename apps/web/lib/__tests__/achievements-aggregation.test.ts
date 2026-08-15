import assert from 'node:assert'
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

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

console.log('🧪 Running Achievements & Moderation Aggregation Unit Test Suite...\n')

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

runTest('buildBadgeOverviews merges definitions with award counts', () => {
  const defs = [badgeDef('a', 'Alpha', 'learning'), badgeDef('b', 'Beta', 'xp')]
  const counts = new Map<string, number>([
    ['a', 3],
    ['b', 0],
  ])
  const result = buildBadgeOverviews(defs, counts)
  assert.strictEqual(result.length, 2)
  assert.strictEqual(result[0].awardCount, 3)
  assert.strictEqual(result[1].awardCount, 0)
})

runTest('buildBadgeOverviews defaults missing counts to zero', () => {
  const defs = [badgeDef('a', 'Alpha', 'learning')]
  const result = buildBadgeOverviews(defs, new Map())
  assert.strictEqual(result[0].awardCount, 0)
})

runTest('filterBadges matches name, description and key', () => {
  const badges = [
    badge('first_lesson', 'First Step', 'learning', 5),
    badge('xp_1000', 'XP 1000', 'xp', 2),
  ]
  assert.strictEqual(filterBadges(badges, 'first', null).length, 1)
  assert.strictEqual(filterBadges(badges, 'description', null).length, 2)
  assert.strictEqual(filterBadges(badges, 'xp_1000', null).length, 1)
  assert.strictEqual(filterBadges(badges, '', null).length, 2)
})

runTest('filterBadges filters by category', () => {
  const badges = [
    badge('first_lesson', 'First Step', 'learning', 5),
    badge('xp_1000', 'XP 1000', 'xp', 2),
  ]
  assert.strictEqual(filterBadges(badges, '', 'xp').length, 1)
  assert.strictEqual(filterBadges(badges, '', 'streak').length, 0)
})

runTest('sortBadges sorts by awardCount desc by default', () => {
  const badges = [
    badge('a', 'Alpha', 'learning', 1),
    badge('b', 'Beta', 'xp', 9),
  ]
  const sorted = sortBadges(badges, 'awardCount', 'desc')
  assert.strictEqual(sorted[0].key, 'b')
  const asc = sortBadges(badges, 'awardCount', 'asc')
  assert.strictEqual(asc[0].key, 'a')
})

runTest('sortBadges sorts by name', () => {
  const badges = [
    badge('b', 'Beta', 'xp', 1),
    badge('a', 'Alpha', 'learning', 1),
  ]
  const sorted = sortBadges(badges, 'name', 'asc')
  assert.strictEqual(sorted[0].key, 'a')
})

runTest('computeBadgeKpis totals awards and finds most awarded', () => {
  const badges = [
    badge('a', 'Alpha', 'learning', 3),
    badge('b', 'Beta', 'xp', 7),
  ]
  const kpis = computeBadgeKpis(badges)
  assert.strictEqual(kpis.totalBadges, 2)
  assert.strictEqual(kpis.totalAwards, 10)
  assert.deepStrictEqual(kpis.mostAwarded, { name: 'Beta', count: 7 })
})

runTest('computeBadgeKpis handles empty set', () => {
  const kpis = computeBadgeKpis([])
  assert.strictEqual(kpis.totalBadges, 0)
  assert.strictEqual(kpis.totalAwards, 0)
  assert.strictEqual(kpis.mostAwarded, null)
})

runTest('filterCertificates matches learner name and code', () => {
  const certs = [
    cert('1', 'CERT-ABC', 'full_curriculum', 'Alice Rivera', '2026-01-01T00:00:00Z'),
    cert('2', 'CERT-XYZ', 'module', 'Bob Chen', '2026-02-01T00:00:00Z'),
  ]
  assert.strictEqual(filterCertificates(certs, 'alice', null).length, 1)
  assert.strictEqual(filterCertificates(certs, 'CERT-XYZ', null).length, 1)
  assert.strictEqual(filterCertificates(certs, '', null).length, 2)
})

runTest('filterCertificates filters by type', () => {
  const certs = [
    cert('1', 'CERT-ABC', 'full_curriculum', 'Alice Rivera', '2026-01-01T00:00:00Z'),
    cert('2', 'CERT-XYZ', 'module', 'Bob Chen', '2026-02-01T00:00:00Z'),
  ]
  assert.strictEqual(filterCertificates(certs, '', 'module').length, 1)
  assert.strictEqual(filterCertificates(certs, '', 'specialization').length, 0)
})

runTest('sortCertificates sorts by issuedAt', () => {
  const certs = [
    cert('1', 'CERT-ABC', 'full_curriculum', 'Alice Rivera', '2026-01-01T00:00:00Z'),
    cert('2', 'CERT-XYZ', 'module', 'Bob Chen', '2026-02-01T00:00:00Z'),
  ]
  const desc = sortCertificates(certs, 'issuedAt', 'desc')
  assert.strictEqual(desc[0].id, '2')
  const asc = sortCertificates(certs, 'issuedAt', 'asc')
  assert.strictEqual(asc[0].id, '1')
})

runTest('computeCertificateKpis counts this month, recent and distinct types', () => {
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
  assert.strictEqual(kpis.totalIssued, 4)
  // 10 days ago is always within the 30-day window; 45/90 days ago never is.
  assert.strictEqual(kpis.recentlyIssued, 2)
  // "This month" depends on the current day-of-month, so derive the expectation.
  assert.strictEqual(kpis.issuedThisMonth, certs.filter((c) => new Date(c.issuedAt) >= monthStart).length)
  assert.strictEqual(kpis.distinctTypes, 3)
})

runTest('paginate slices and reports total', () => {
  const items = [1, 2, 3, 4, 5]
  const page1 = paginate(items, 1, 2)
  assert.deepStrictEqual(page1.items, [1, 2])
  assert.strictEqual(page1.total, 5)
  const page3 = paginate(items, 3, 2)
  assert.deepStrictEqual(page3.items, [5])
  const outOfRange = paginate(items, 9, 2)
  assert.deepStrictEqual(outOfRange.items, [])
})

runTest('computeAchievementsOverviewKpis passes through values', () => {
  const kpis = computeAchievementsOverviewKpis({
    badgesDefined: 16,
    badgesAwarded: 42,
    certificatesIssued: 7,
    certificatesThisMonth: 2,
    pendingCapstones: 3,
  })
  assert.deepStrictEqual(kpis, {
    badgesDefined: 16,
    badgesAwarded: 42,
    certificatesIssued: 7,
    certificatesThisMonth: 2,
    pendingCapstones: 3,
  })
})

console.log('\n✅ All achievements aggregation tests passed.\n')