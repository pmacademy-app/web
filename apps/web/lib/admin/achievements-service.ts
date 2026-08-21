/**
 * Achievements data service (Phase 5).
 *
 * Raw row fetching for the Achievements workspace: overview KPIs, badge
 * overviews (config + live award counts), badge detail with recent earners,
 * and the paginated certificate list with learner attribution.
 *
 * Follows the Phase 4 split: row fetching here, pure math in
 * `achievements-aggregation.ts`. DB failures degrade to empty/zeroed results
 * with a `failed` flag so workspaces can render an error state (spec §63).
 */

import { createServiceRoleClient } from '../supabase'
import { fetchAllRows } from './fetch-all'
import { BADGE_DEFINITIONS } from '@/config/badges'
import { BRAND } from '@/lib/brand'
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
  type AdminAchievementsOverviewKpis,
  type AdminBadgeKpis,
  type AdminBadgeOverview,
  type AdminBadgeSortKey,
  type AdminCertificateKpis,
  type AdminCertificateRow,
  type AdminCertificateSortKey,
} from './achievements-aggregation'

export interface AdminBadgeDetail extends AdminBadgeOverview {
  earners: Array<{ userId: string; learnerName: string; earnedAt: string }>
}

export interface AdminCertificateDetail extends AdminCertificateRow {
  level: number
  totalXp: number
  verificationUrl: string
}

interface UserBadgeRow {
  user_id: string
  badge_id: string
  earned_at: string
}

interface CertificateRow {
  id: string
  user_id: string
  certificate_code: string
  type: string
  learner_name: string
  level: number
  career_title: string
  total_xp: number
  lessons_completed: number
  modules_completed: number
  issued_at: string
}

interface UserRow {
  id: string
  name?: string | null
  username?: string | null
  email?: string | null
}

export class AchievementsService {
  /** Maps badge_id → badge key from the `badges` table (source of truth for ids). */
  private static async fetchBadgeKeyMap(
    supabase: ReturnType<typeof createServiceRoleClient>
  ): Promise<Map<string, string>> {
    const { data } = await supabase.from('badges').select('id, key')
    const rows = (data || []) as unknown as Array<{ id: string; key: string }>
    return new Map(rows.map((r) => [r.id, r.key]))
  }

  /** Resolves learner display names for a set of user ids (targeted, bounded query). */
  private static async fetchUsersByIds(
    supabase: ReturnType<typeof createServiceRoleClient>,
    userIds: string[]
  ): Promise<Map<string, UserRow>> {
    const uniqueIds = [...new Set(userIds)]
    if (uniqueIds.length === 0) return new Map()
    const userMap = new Map<string, UserRow>()
    // Chunked `.in()` to stay well under PostgREST's URL-length limit.
    const CHUNK = 500
    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const chunk = uniqueIds.slice(i, i + CHUNK)
      const { data } = await supabase.from('users').select('id, name, username, email').in('id', chunk)
      for (const row of (data || []) as unknown as UserRow[]) {
        userMap.set(row.id, row)
      }
    }
    return userMap
  }

  /** Resolves a learner display name from a user row (or a fallback). */
  private static resolveLearnerName(user: UserRow | null | undefined, fallback: string): string {
    return user?.name || user?.username || user?.email?.split('@')[0] || fallback
  }

  /**
   * Overview KPIs for the Achievements landing page (spec §5.1).
   * All counts are live; a DB failure degrades to zeroed KPIs with `failed`.
   */
  public static async getOverview(): Promise<{ kpis: AdminAchievementsOverviewKpis; failed: boolean }> {
    const supabase = createServiceRoleClient()
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    try {
      const [awardsRes, certsRes, certsMonthRes, pendingCapstonesRes] = await Promise.all([
        supabase.from('user_badges').select('*', { count: 'exact', head: true }),
        supabase.from('certificates').select('id', { count: 'exact', head: true }),
        supabase.from('certificates').select('id', { count: 'exact', head: true }).gte('issued_at', monthStart),
        supabase.from('capstone_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
      ])

      const kpis = computeAchievementsOverviewKpis({
        // Badge definitions come from config — the same source the badges page
        // uses for its "Total Badges" KPI, so the two pages never diverge.
        badgesDefined: BADGE_DEFINITIONS.length,
        badgesAwarded: awardsRes.count || 0,
        certificatesIssued: certsRes.count || 0,
        certificatesThisMonth: certsMonthRes.count || 0,
        pendingCapstones: pendingCapstonesRes.count || 0,
      })
      return { kpis, failed: false }
    } catch (err) {
      console.warn('[AchievementsService] getOverview failed:', err)
      return {
        kpis: computeAchievementsOverviewKpis({
          badgesDefined: BADGE_DEFINITIONS.length,
          badgesAwarded: 0,
          certificatesIssued: 0,
          certificatesThisMonth: 0,
          pendingCapstones: 0,
        }),
        failed: true,
      }
    }
  }

  /**
   * Badge overview grid (spec §5.4): config definitions merged with live
   * award counts. Search + category filter + sort applied in memory.
   */
  public static async getBadges(
    search = '',
    category: string | null = null,
    sortKey: AdminBadgeSortKey = 'awardCount',
    sortDir: 'asc' | 'desc' = 'desc'
  ): Promise<{ badges: AdminBadgeOverview[]; kpis: AdminBadgeKpis; failed: boolean }> {
    const supabase = createServiceRoleClient()
    try {
      const [keyMap, userBadges] = await Promise.all([
        this.fetchBadgeKeyMap(supabase),
        fetchAllRows<{ user_id: string; badge_id: string }>((from, to) =>
          supabase.from('user_badges').select('user_id, badge_id').range(from, to)
        ),
      ])

      // Count distinct learners per badge (a learner re-earning a badge is
      // still one learner who has earned it).
      const awardCounts = new Map<string, number>()
      const seen = new Set<string>()
      for (const row of userBadges) {
        const key = keyMap.get(row.badge_id)
        if (!key) continue
        const dedupeKey = `${key}:${row.user_id}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        awardCounts.set(key, (awardCounts.get(key) || 0) + 1)
      }

      const all = buildBadgeOverviews(BADGE_DEFINITIONS, awardCounts)
      const filtered = filterBadges(all, search, category)
      const sorted = sortBadges(filtered, sortKey, sortDir)
      return { badges: sorted, kpis: computeBadgeKpis(all), failed: false }
    } catch (err) {
      console.warn('[AchievementsService] getBadges failed:', err)
      return { badges: [], kpis: { totalBadges: 0, totalAwards: 0, mostAwarded: null }, failed: true }
    }
  }

  /**
   * Badge detail (spec "Achievement detail"): definition + recent earners.
   * Returns null when the badge key is not a configured badge.
   */
  public static async getBadgeDetail(key: string): Promise<AdminBadgeDetail | null> {
    const definition = BADGE_DEFINITIONS.find((b) => b.key === key)
    if (!definition) return null

    const supabase = createServiceRoleClient()
    try {
      const keyMap = await this.fetchBadgeKeyMap(supabase)
      const keyToBadgeId = new Map([...keyMap.entries()].map(([id, k]) => [k, id]))
      const badgeId = keyToBadgeId.get(key)
      if (!badgeId) {
        return { ...definition, awardCount: 0, earners: [] }
      }

      const [userBadges, countRes] = await Promise.all([
        fetchAllRows<UserBadgeRow>((from, to) =>
          supabase.from('user_badges').select('user_id, badge_id, earned_at').eq('badge_id', badgeId).range(from, to)
        ),
        supabase.from('user_badges').select('*', { count: 'exact', head: true }).eq('badge_id', badgeId),
      ])

      // Distinct learners who have earned this badge (re-earns count once).
      const uniqueEarners = new Map<string, UserBadgeRow>()
      for (const row of userBadges) {
        const existing = uniqueEarners.get(row.user_id)
        if (!existing || new Date(row.earned_at) > new Date(existing.earned_at)) {
          uniqueEarners.set(row.user_id, row)
        }
      }

      const earners = [...uniqueEarners.values()]
        .sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime())
        .slice(0, 50)

      const userMap = await this.fetchUsersByIds(
        supabase,
        earners.map((e) => e.user_id)
      )

      const earnersWithNames = earners.map((row) => ({
        userId: row.user_id,
        learnerName: this.resolveLearnerName(userMap.get(row.user_id), 'Learner'),
        earnedAt: row.earned_at,
      }))

      return {
        ...definition,
        awardCount: countRes.count || uniqueEarners.size,
        earners: earnersWithNames,
      }
    } catch (err) {
      console.warn('[AchievementsService] getBadgeDetail failed:', err)
      return { ...definition, awardCount: 0, earners: [] }
    }
  }

  /**
   * Paginated certificate list (spec §5.2): learner attribution joined from
   * the `users` table. Search + type filter + sort applied in memory.
   */
  public static async getCertificates(
    search = '',
    type: string | null = null,
    page = 1,
    pageSize = 25,
    sortKey: AdminCertificateSortKey = 'issuedAt',
    sortDir: 'asc' | 'desc' = 'desc'
  ): Promise<{ certificates: AdminCertificateRow[]; total: number; kpis: AdminCertificateKpis; failed: boolean }> {
    const supabase = createServiceRoleClient()
    try {
      const certRows = await fetchAllRows<CertificateRow>((from, to) =>
        supabase.from('certificates').select('*').order('issued_at', { ascending: false }).range(from, to)
      )

      const userMap = await this.fetchUsersByIds(
        supabase,
        certRows.map((c) => c.user_id)
      )

      const all: AdminCertificateRow[] = certRows.map((c) => {
        const user = userMap.get(c.user_id)
        return {
          id: c.id,
          code: c.certificate_code,
          type: c.type,
          learnerName: c.learner_name || this.resolveLearnerName(user, 'Learner'),
          userId: c.user_id,
          issuedAt: c.issued_at,
          lessonsCompleted: c.lessons_completed,
          modulesCompleted: c.modules_completed,
          careerTitle: c.career_title,
        }
      })

      const filtered = filterCertificates(all, search, type)
      const sorted = sortCertificates(filtered, sortKey, sortDir)
      const { items, total } = paginate(sorted, page, pageSize)
      return { certificates: items, total, kpis: computeCertificateKpis(all), failed: false }
    } catch (err) {
      console.warn('[AchievementsService] getCertificates failed:', err)
      return {
        certificates: [],
        total: 0,
        kpis: { totalIssued: 0, issuedThisMonth: 0, recentlyIssued: 0, distinctTypes: 0 },
        failed: true,
      }
    }
  }

  /**
   * Certificate detail (spec §5.3): full credential row + learner attribution
   * + public verification URL. Returns null when the certificate does not exist.
   */
  public static async getCertificateDetail(id: string): Promise<AdminCertificateDetail | null> {
    const supabase = createServiceRoleClient()
    try {
      const { data } = await supabase.from('certificates').select('*').eq('id', id).maybeSingle()
      const cert = data as unknown as CertificateRow | null
      if (!cert) return null

      const { data: userData } = await supabase
        .from('users')
        .select('id, name, username, email')
        .eq('id', cert.user_id)
        .maybeSingle()
      const user = userData as unknown as UserRow | null

      const origin = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')
      return {
        id: cert.id,
        code: cert.certificate_code,
        type: cert.type,
        learnerName: cert.learner_name || this.resolveLearnerName(user, 'Learner'),
        userId: cert.user_id,
        issuedAt: cert.issued_at,
        lessonsCompleted: cert.lessons_completed,
        modulesCompleted: cert.modules_completed,
        careerTitle: cert.career_title,
        level: cert.level,
        totalXp: cert.total_xp,
        verificationUrl: `${origin}/verify/${encodeURIComponent(cert.certificate_code)}`,
      }
    } catch (err) {
      console.warn('[AchievementsService] getCertificateDetail failed:', err)
      return null
    }
  }
}