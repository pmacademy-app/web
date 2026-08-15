/**
 * Moderation data service (Phase 5).
 *
 * Raw row fetching + mutations for the Moderation workspace: capstone
 * submissions (with learner attribution + module titles), the capstone
 * review mutation (approve/reject), and the public portfolio directory.
 *
 * Testimonials + product feedback reuse `FeedbackAdminService` from
 * `feedback-service.ts`. DB failures degrade to empty results with a
 * `failed` flag so workspaces can render an error state (spec §63).
 */

import { createServiceRoleClient } from '../supabase'
import { fetchAllRows } from './fetch-all'
import { logAdminAction } from './guard'
import { getCapstoneDefinition } from '@/config/capstones'
import type { AdminCapstoneRow, AdminPortfolioRow } from './achievements-aggregation'

interface CapstoneSubmissionRow {
  id: string
  user_id: string
  module_slug: string
  content: string
  status: string
  is_public: boolean
  submitted_at: string
}

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

interface UserRow {
  id: string
  name?: string | null
  username?: string | null
  email?: string | null
  created_at?: string
}

export class ModerationService {
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
  private static resolveLearnerName(user: UserRow | undefined, fallback: string): string {
    return user?.name || user?.username || user?.email?.split('@')[0] || fallback
  }

  /**
   * Capstone submissions for the Moderation queue (spec §5.6).
   * `statusFilter` is one of 'all' | 'submitted' | 'reviewed' | 'draft'.
   * Learner names come from the `users` table; module titles from config.
   */
  public static async getCapstones(
    statusFilter: string = 'all'
  ): Promise<{ capstones: AdminCapstoneRow[]; failed: boolean }> {
    const supabase = createServiceRoleClient()
    try {
      const submissions = await fetchAllRows<CapstoneSubmissionRow>((from, to) =>
        supabase.from('capstone_submissions').select('*').order('submitted_at', { ascending: false }).range(from, to)
      )

      const userMap = await this.fetchUsersByIds(
        supabase,
        submissions.map((s) => s.user_id)
      )

      const all: AdminCapstoneRow[] = submissions.map((s) => {
        const user = userMap.get(s.user_id)
        const definition = getCapstoneDefinition(s.module_slug)
        return {
          id: s.id,
          userId: s.user_id,
          learnerName: this.resolveLearnerName(user, 'Learner'),
          moduleSlug: s.module_slug,
          moduleTitle: definition?.moduleTitle || s.module_slug,
          capstoneTitle: definition?.title || s.module_slug,
          content: s.content,
          status: s.status,
          isPublic: s.is_public,
          submittedAt: s.submitted_at,
          wordCount: s.content.trim().split(/\s+/).filter(Boolean).length,
        }
      })

      const filtered =
        statusFilter && statusFilter !== 'all' ? all.filter((c) => c.status === statusFilter) : all

      return { capstones: filtered, failed: false }
    } catch (err) {
      console.warn('[ModerationService] getCapstones failed:', err)
      return { capstones: [], failed: true }
    }
  }

  /**
   * Reviews a capstone submission (spec §5.7, gap G3).
   *
   * The schema has no `rejected` status, so approve/reject maps onto the
   * existing columns: approve → `status: 'reviewed'` + `is_public: true`;
   * reject → `status: 'reviewed'` + `is_public: false` (kept private, not
   * surfaced on the public portfolio). Every action is audit-logged.
   */
  public static async reviewCapstone(
    adminUserId: string,
    adminEmail: string,
    submissionId: string,
    action: 'approve' | 'reject'
  ): Promise<boolean> {
    const supabase = createServiceRoleClient()
    try {
      const { data, error } = await (supabase.from('capstone_submissions') as unknown as DBChain)
        .update({
          status: 'reviewed',
          is_public: action === 'approve',
        })
        .eq('id', submissionId)
        .select('id')

      if (error) {
        console.error('[ModerationService] Error reviewing capstone:', error)
        return false
      }

      // No matching row → the submission does not exist (or was already removed).
      const updatedRows = (data || []) as unknown as Array<{ id: string }>
      if (updatedRows.length === 0) {
        console.warn(`[ModerationService] reviewCapstone: no submission matched id "${submissionId}"`)
        return false
      }

      await logAdminAction(adminUserId, adminEmail, `capstone_${action}`, 'capstone_submission', submissionId, {
        action,
      })

      return true
    } catch (err) {
      console.error('[ModerationService] reviewCapstone failed:', err)
      return false
    }
  }

  /**
   * Public portfolio directory (spec §5.6 Portfolios tab): learners with a
   * public portfolio, newest first. Read-only this phase.
   */
  public static async getPortfolios(): Promise<{ portfolios: AdminPortfolioRow[]; failed: boolean }> {
    const supabase = createServiceRoleClient()
    try {
      const users = await fetchAllRows<UserRow>((from, to) =>
        supabase
          .from('users')
          .select('id, name, username, email, created_at')
          .eq('is_portfolio_public', true)
          .order('created_at', { ascending: false })
          .range(from, to)
      )

      const portfolios: AdminPortfolioRow[] = users.map((u) => ({
        userId: u.id,
        learnerName: this.resolveLearnerName(u, 'Learner'),
        username: u.username || null,
        isPublic: true,
        joinedAt: u.created_at || '',
      }))

      return { portfolios, failed: false }
    } catch (err) {
      console.warn('[ModerationService] getPortfolios failed:', err)
      return { portfolios: [], failed: true }
    }
  }
}