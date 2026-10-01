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
  user_id: string | null
  module_slug: string
  content: string
  status: string
  is_public: boolean
  submitted_at: string
  reviewed_at: string | null
}

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

interface UserRow {
  id: string
  name?: string | null
  username?: string | null
  email?: string | null
  avatar_url?: string | null
  bio?: string | null
  is_fellow?: boolean
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
        submissions.map((s) => s.user_id).filter((id): id is string => Boolean(id))
      )

      const all: AdminCapstoneRow[] = submissions.map((s) => {
        const user = s.user_id ? userMap.get(s.user_id) : undefined
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
          reviewedAt: s.reviewed_at ?? null,
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
   * Reviews a capstone submission (spec §5.7, gap G3; review lifecycle closed in Phase 8.2).
   *
   * The schema has no `rejected` status, so approve/reject maps onto the
   * existing columns: approve → `status: 'reviewed'` + `is_public: true`;
   * reject → `status: 'reviewed'` + `is_public: false` (kept private, not
   * surfaced on the public portfolio). Every action is audit-logged.
   *
   * Phase 8.2 closes the loop: the first review stamps `reviewed_at`/`reviewed_by` (preserved on
   * any later approve/reject change so turnaround measures the *first* decision) and dispatches a
   * `capstone.reviewed` in-app notification to the submitting learner. Both effects are idempotent:
   *   - `reviewed_at`/`reviewed_by` are only written when currently null, so repeating the action
   *     never moves the timestamp.
   *   - the notification is dispatched only on the first transition into reviewed (the row was not
   *     previously reviewed), and the dispatch itself carries a stable idempotency key, so a
   *     repeated review never produces a duplicate notification.
   *
   * This method performs the server-side authorization boundary's *work*; authorization itself is
   * enforced upstream (the `/api/admin/capstones/[id]/review` route is admin-gated via `withRoute`),
   * so a learner can never reach this path for their own submission.
   */
  public static async reviewCapstone(
    adminUserId: string,
    adminEmail: string,
    submissionId: string,
    action: 'approve' | 'reject',
    supabaseClient?: unknown
  ): Promise<boolean> {
    const supabase = (supabaseClient as ReturnType<typeof createServiceRoleClient>) || createServiceRoleClient()
    try {
      // 1. Read the current row so we can (a) detect whether this is the FIRST review — which drives
      //    both the timestamp write and the single notification — and (b) resolve the recipient.
      const { data: current, error: readError } = (await (supabase
        .from('capstone_submissions') as unknown as DBChain)
        .select('id, user_id, module_slug, status, reviewed_at')
        .eq('id', submissionId)
        .maybeSingle()) as unknown as {
        data:
          | { id: string; user_id: string | null; module_slug: string; status: string; reviewed_at: string | null }
          | null
        error: unknown
      }

      if (readError) {
        console.error('[ModerationService] Error reading capstone before review:', readError)
        return false
      }
      if (!current) {
        console.warn(`[ModerationService] reviewCapstone: no submission matched id "${submissionId}"`)
        return false
      }

      const alreadyReviewed = Boolean(current.reviewed_at)
      const reviewedAtIso = new Date().toISOString()

      // 2. Always set status + visibility. Stamp reviewed_at/reviewed_by only on the first review so
      //    the turnaround clock is not reset by a later approve↔reject change.
      const updatePayload: Record<string, unknown> = {
        status: 'reviewed',
        is_public: action === 'approve',
      }
      if (!alreadyReviewed) {
        updatePayload.reviewed_at = reviewedAtIso
        updatePayload.reviewed_by = adminUserId
      }

      const { data, error } = await (supabase.from('capstone_submissions') as unknown as DBChain)
        .update(updatePayload)
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

      // 3. Notify the learner — only on the first review, and only when we know who to notify.
      if (!alreadyReviewed && current.user_id) {
        await this.dispatchCapstoneReviewedNotification({
          submissionId,
          userId: current.user_id,
          moduleSlug: current.module_slug,
          isPublished: action === 'approve',
          reviewedAt: reviewedAtIso,
        })
      }

      try {
        const { revalidatePath } = await import('next/cache')
        revalidatePath('/admin/moderation')
        revalidatePath('/capstones')
        revalidatePath('/progress')
      } catch {
        // Revalidation error is non-fatal
      }

      return true
    } catch (err) {
      console.error('[ModerationService] reviewCapstone failed:', err)
      return false
    }
  }

  /**
   * Dispatches the `capstone.reviewed` in-app notification to the submitting learner.
   *
   * In-app only (Phase 8.2 scope): the notification is added to the in-app connector set, not the
   * email connectors — the agreed review loop is an in-app close, and email is deliberately out of
   * scope. The event id is derived from the submission id, so the in-app write path deduplicates a
   * repeated review by its idempotency key even if the domain-level first-review guard is ever
   * bypassed. Failures are swallowed: a notification problem must never fail the review itself.
   */
  private static async dispatchCapstoneReviewedNotification(input: {
    submissionId: string
    userId: string
    moduleSlug: string
    isPublished: boolean
    reviewedAt: string
  }): Promise<void> {
    try {
      const { globalNotificationDispatcher } = await import('@/lib/notifications/dispatcher')
      const { initializeNotificationConnectors } = await import('@/lib/notifications/events/connectors')
      initializeNotificationConnectors()

      const definition = getCapstoneDefinition(input.moduleSlug)
      await globalNotificationDispatcher.dispatch({
        id: `capstone-reviewed-${input.submissionId}`,
        event: 'capstone.reviewed',
        userId: input.userId,
        userEmail: '',
        userName: 'Learner',
        userTimezone: 'UTC',
        priority: 'medium',
        category: 'portfolio',
        occurredAt: input.reviewedAt,
        payload: {
          submissionId: input.submissionId,
          moduleSlug: input.moduleSlug,
          moduleTitle: definition?.moduleTitle || input.moduleSlug,
          isPublished: input.isPublished,
          reviewedAt: input.reviewedAt,
        },
      })
    } catch (err) {
      console.error('[ModerationService] capstone.reviewed dispatch failed:', err)
    }
  }

  /**
   * Public portfolio directory & verification queue:
   * Retrieves all users with public portfolios, enriched with project count and verification status.
   */
  public static async getPortfolios(): Promise<{ portfolios: AdminPortfolioRow[]; failed: boolean }> {
    const supabase = createServiceRoleClient()
    try {
      const users = await fetchAllRows<UserRow>((from, to) =>
        supabase
          .from('users')
          .select('id, name, username, email, avatar_url, bio, is_fellow, is_portfolio_public, created_at')
          .eq('is_portfolio_public', true)
          .order('created_at', { ascending: false })
          .range(from, to)
      )

      // Query capstone counts for public portfolios
      const userIds = users.map((u) => u.id).filter(Boolean)
      const capstoneCountMap = new Map<string, number>()

      if (userIds.length > 0) {
        const CHUNK = 500
        for (let i = 0; i < userIds.length; i += CHUNK) {
          const chunk = userIds.slice(i, i + CHUNK)
          const { data: capstoneData } = await supabase
            .from('capstone_submissions')
            .select('user_id')
            .in('user_id', chunk)
            .in('status', ['submitted', 'reviewed'])
            .neq('is_public', false)

          for (const row of (capstoneData || []) as unknown as { user_id: string }[]) {
            if (row.user_id) {
              capstoneCountMap.set(row.user_id, (capstoneCountMap.get(row.user_id) || 0) + 1)
            }
          }
        }
      }

      const portfolios: AdminPortfolioRow[] = users.map((u) => ({
        userId: u.id,
        learnerName: this.resolveLearnerName(u, 'Learner'),
        email: u.email || '',
        username: u.username || null,
        avatarUrl: u.avatar_url || null,
        bio: u.bio || null,
        isPublic: true,
        isFellow: Boolean(u.is_fellow),
        joinedAt: u.created_at || '',
        capstoneCount: capstoneCountMap.get(u.id) || 0,
      }))

      return { portfolios, failed: false }
    } catch (err) {
      console.warn('[ModerationService] getPortfolios failed:', err)
      return { portfolios: [], failed: true }
    }
  }
}