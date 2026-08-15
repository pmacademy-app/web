/**
 * Achievements & Moderation aggregation helpers (Phase 5).
 *
 * Pure functions only — no database access. Raw row fetching lives in
 * `achievements-service.ts` / `moderation-service.ts`; the filtering, sorting,
 * KPI math and pagination live here so they can be unit-tested in isolation
 * (same split as dashboard-aggregation / curriculum-aggregation).
 */

import type { BadgeDefinition } from '@/config/badges'

export interface AdminBadgeOverview {
  key: string
  name: string
  description: string
  category: string
  icon: string
  criteriaText: string
  targetGoal: number
  /** Number of learners who have earned this badge. */
  awardCount: number
}

export interface AdminCertificateRow {
  id: string
  code: string
  type: string
  learnerName: string
  userId: string
  issuedAt: string
  lessonsCompleted: number
  modulesCompleted: number
  careerTitle: string
}

export interface AdminCapstoneRow {
  id: string
  userId: string
  learnerName: string
  moduleSlug: string
  moduleTitle: string
  capstoneTitle: string
  content: string
  status: string
  isPublic: boolean
  submittedAt: string
  wordCount: number
}

export interface AdminPortfolioRow {
  userId: string
  learnerName: string
  username: string | null
  isPublic: boolean
  joinedAt: string
}

export interface AdminBadgeKpis {
  totalBadges: number
  totalAwards: number
  mostAwarded: { name: string; count: number } | null
}

export interface AdminCertificateKpis {
  totalIssued: number
  issuedThisMonth: number
  recentlyIssued: number
  distinctTypes: number
}

export interface AdminAchievementsOverviewKpis {
  badgesDefined: number
  badgesAwarded: number
  certificatesIssued: number
  certificatesThisMonth: number
  pendingCapstones: number
}

export type AdminBadgeSortKey = 'name' | 'awardCount' | 'category'
export type AdminCertificateSortKey = 'issuedAt' | 'learnerName' | 'type'

/** Merges badge definitions (config) with live award counts (user_badges). */
export function buildBadgeOverviews(
  definitions: BadgeDefinition[],
  awardCounts: Map<string, number>
): AdminBadgeOverview[] {
  return definitions.map((def) => ({
    key: def.key,
    name: def.name,
    description: def.description,
    category: def.category,
    icon: def.icon,
    criteriaText: def.criteriaText,
    targetGoal: def.targetGoal,
    awardCount: awardCounts.get(def.key) || 0,
  }))
}

export function filterBadges(
  badges: AdminBadgeOverview[],
  search: string,
  category: string | null
): AdminBadgeOverview[] {
  const q = search.trim().toLowerCase()
  return badges.filter((b) => {
    const matchesSearch = q
      ? b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.key.toLowerCase().includes(q)
      : true
    const matchesCategory = category ? b.category === category : true
    return matchesSearch && matchesCategory
  })
}

export function sortBadges(
  badges: AdminBadgeOverview[],
  sortKey: AdminBadgeSortKey,
  sortDir: 'asc' | 'desc'
): AdminBadgeOverview[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...badges].sort((a, b) => {
    if (sortKey === 'awardCount') return (a.awardCount - b.awardCount) * dir
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * dir
  })
}

export function computeBadgeKpis(badges: AdminBadgeOverview[]): AdminBadgeKpis {
  const totalAwards = badges.reduce((sum, b) => sum + b.awardCount, 0)
  let mostAwarded: AdminBadgeKpis['mostAwarded'] = null
  for (const b of badges) {
    if (!mostAwarded || b.awardCount > mostAwarded.count) {
      mostAwarded = { name: b.name, count: b.awardCount }
    }
  }
  return { totalBadges: badges.length, totalAwards, mostAwarded }
}

export function filterCertificates(
  certificates: AdminCertificateRow[],
  search: string,
  type: string | null
): AdminCertificateRow[] {
  const q = search.trim().toLowerCase()
  return certificates.filter((c) => {
    const matchesSearch = q
      ? c.learnerName.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
      : true
    const matchesType = type ? c.type === type : true
    return matchesSearch && matchesType
  })
}

export function sortCertificates(
  certificates: AdminCertificateRow[],
  sortKey: AdminCertificateSortKey,
  sortDir: 'asc' | 'desc'
): AdminCertificateRow[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...certificates].sort((a, b) => {
    if (sortKey === 'issuedAt') {
      return (new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()) * dir
    }
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * dir
  })
}

export function computeCertificateKpis(certificates: AdminCertificateRow[]): AdminCertificateKpis {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const issuedThisMonth = certificates.filter((c) => new Date(c.issuedAt) >= monthStart).length
  const recentlyIssued = certificates.filter((c) => new Date(c.issuedAt) >= thirtyDaysAgo).length
  const distinctTypes = new Set(certificates.map((c) => c.type)).size
  return { totalIssued: certificates.length, issuedThisMonth, recentlyIssued, distinctTypes }
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number } {
  const total = items.length
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total }
}

export function computeAchievementsOverviewKpis(params: {
  badgesDefined: number
  badgesAwarded: number
  certificatesIssued: number
  certificatesThisMonth: number
  pendingCapstones: number
}): AdminAchievementsOverviewKpis {
  return { ...params }
}