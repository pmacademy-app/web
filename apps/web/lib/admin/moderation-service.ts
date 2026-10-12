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
import { logAdminAction } from './guard'
import { getCapstoneDefinition } from '@/config/capstones'
import { MAX_OFFSET, MAX_PAGE_SIZE } from '@/lib/api/pagination'
import { capstoneSharePath } from '@/lib/portfolio'
import { buildIlikeOrFilter, escapeIlikeTerm } from './search-filter'
import type { AdminCapstoneListRow, AdminCapstoneRow, AdminPortfolioRow } from './achievements-aggregation'

// ---------------------------------------------------------------------------
// Server-side paging for the Moderation tabs (admin R6 B7).
//
// Every moderation list used to load the whole table and filter in the client. The
// paged variants below push the client's status/search filters into the query and
// return one page plus the exact total. The filter semantics deliberately mirror the
// client views (CapstonesView, PortfoliosView, FellowRequestsView,
// FeedbackModerationView, FeedbackListView) so moving a filter server-side never
// changes what it returns.
// ---------------------------------------------------------------------------

/** Rows per moderation page (decision 5). */
export const MODERATION_PAGE_SIZE = 25

export interface ModerationPageParams {
  /** Status filter; an unknown value falls back to the list's default (as the views do). */
  status?: string | null
  /** 1-based page number. */
  page?: number | string | null
  pageSize?: number | string | null
}

export interface ModerationPage<T> {
  items: T[]
  /** Exact number of rows matching the filters (not just this page). */
  total: number
  page: number
  pageSize: number
  /** True when the database read failed; `items` is then empty. */
  failed: boolean
}

/**
 * Clamps caller-supplied paging to the server's bounds and converts it to the inclusive
 * PostgREST range. A malformed value falls back to the default rather than erroring.
 */
export function normalizeModerationPaging(
  page?: number | string | null,
  pageSize?: number | string | null
): { page: number; pageSize: number; from: number; to: number } {
  const asInt = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null
    const parsed = Math.floor(Number(value))
    return Number.isFinite(parsed) ? parsed : null
  }
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, asInt(pageSize) ?? MODERATION_PAGE_SIZE))
  const maxPage = Math.floor(MAX_OFFSET / size) + 1
  const p = Math.min(maxPage, Math.max(1, asInt(page) ?? 1))
  const from = (p - 1) * size
  return { page: p, pageSize: size, from, to: from + size - 1 }
}

/** The URL params that drive the Moderation workspace (decision 5). */
export const MODERATION_URL_PARAMS = ['tab', 'status', 'q', 'page', 'capstone'] as const
export type ModerationUrlParams = Partial<Record<(typeof MODERATION_URL_PARAMS)[number], string>>

/**
 * Reduces raw page `searchParams` to the moderation params as plain strings. A repeated
 * param (`?q=a&q=b`) arrives as an array and is dropped, so the client views never
 * receive a non-string.
 */
export function normalizeModerationSearchParams(
  raw: Record<string, string | string[] | undefined>
): ModerationUrlParams {
  const params: ModerationUrlParams = {}
  for (const key of MODERATION_URL_PARAMS) {
    const value = raw[key]
    if (typeof value === 'string') params[key] = value
  }
  return params
}

/**
 * Where to send the admin when the requested page is past the end of a list that still
 * has rows (the last row of the last page was just reviewed, or a hand-typed `?page=99`):
 * the last page that has rows, with `tab`, `status`, `q` and `capstone` kept. Returns null
 * when the page should render as it is, including an empty page 1 and a failed load.
 */
export function moderationLastPagePath(
  tab: string,
  params: ModerationUrlParams,
  list: { items: readonly unknown[]; total: number; page: number; pageSize: number; failed?: boolean }
): string | null {
  if (list.failed || list.items.length > 0 || list.total <= 0 || list.page <= 1) return null
  const lastPage = Math.ceil(list.total / list.pageSize)
  // The total says this page has rows (the list changed between two reads): do not loop.
  if (lastPage >= list.page) return null
  const next = new URLSearchParams({ tab })
  if (params.status) next.set('status', params.status)
  if (params.q) next.set('q', params.q)
  if (lastPage > 1) next.set('page', String(lastPage))
  if (params.capstone) next.set('capstone', params.capstone)
  return `/admin/moderation?${next.toString()}`
}

/** Returns `status` when it is one of `allowed`, else `fallback`. */
export function normalizeModerationStatus<S extends string>(
  status: string | null | undefined,
  allowed: readonly S[],
  fallback: S
): S {
  return status && (allowed as readonly string[]).includes(status) ? (status as S) : fallback
}

// The search-term escaping lives in ./search-filter so the other admin services can use
// it without importing this module; re-exported here for existing importers.
export { buildIlikeOrFilter, escapeIlikeTerm }

type PageQueryResult = {
  data: unknown
  error: { code?: string; message?: string } | null
  count: number | null
}

/** A PostgREST select that was built with `{ count: 'exact' }` and can still take a range. */
export interface RangeableCountQuery {
  range(from: number, to: number): PromiseLike<PageQueryResult>
}

/**
 * Runs one page of a counted query. A page past the end makes PostgREST answer 416
 * (PGRST103) instead of an empty page, so that case re-reads the first row only to learn
 * the total and returns no items. Any other error is thrown for the caller to degrade.
 */
export async function runCountedPage<R>(
  build: () => RangeableCountQuery,
  from: number,
  to: number
): Promise<{ rows: R[]; total: number }> {
  const res = await build().range(from, to)
  if (res.error) {
    if (res.error.code !== 'PGRST103') throw res.error
    const head = await build().range(0, 0)
    if (head.error) throw head.error
    return { rows: [], total: head.count ?? 0 }
  }
  return { rows: (res.data || []) as R[], total: res.count ?? 0 }
}

/** Status values the Capstones tab offers (CapstonesView STATUS_FILTERS). */
export const CAPSTONE_STATUS_FILTERS = ['all', 'submitted', 'reviewed', 'draft'] as const
export type CapstoneStatusFilter = (typeof CAPSTONE_STATUS_FILTERS)[number]

/** Tabs the Portfolios view offers: pending = not yet Fellow, verified = Fellow. */
export const PORTFOLIO_STATUS_FILTERS = ['pending', 'verified', 'all'] as const
export type PortfolioStatusFilter = (typeof PORTFOLIO_STATUS_FILTERS)[number]

export interface AdminPortfolioCounts {
  /** All public portfolios, ignoring the tab and the search (the view's KPI row). */
  all: number
  pending: number
  verified: number
}

const CAPSTONE_COLUMNS = 'id, user_id, module_slug, content, status, is_public, submitted_at, reviewed_at'
const PORTFOLIO_USER_COLUMNS = 'id, name, username, email, avatar_url, bio, is_fellow, is_portfolio_public, created_at'
/** Columns the Portfolios search matches (PortfoliosView: learner name, handle, email, bio). */
const PORTFOLIO_SEARCH_COLUMNS = ['name', 'username', 'email', 'bio'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  is_portfolio_public?: boolean | null
  created_at?: string
}

/**
 * The public-page fields of an admin capstone row (admin R6 C4). The page at
 * `capstoneSharePath` is available for a submitted or reviewed capstone that is public on
 * a public portfolio (owner decision: it does not wait for review). The admin link here is
 * deliberately narrower (R6 decision): `publicPath` is only set for a reviewed, public
 * capstone whose owner has a username and a public portfolio.
 */
export function capstonePublicLink(
  s: { module_slug: string; status: string; is_public: boolean },
  user: { username?: string | null; is_portfolio_public?: boolean | null } | undefined
): Pick<AdminCapstoneRow, 'username' | 'portfolioPublic' | 'publicPath'> {
  const username = typeof user?.username === 'string' && user.username ? user.username : null
  const portfolioPublic = user?.is_portfolio_public === true
  const linkable = s.status === 'reviewed' && s.is_public === true && username !== null && portfolioPublic
  return {
    username,
    portfolioPublic,
    publicPath: linkable ? capstoneSharePath(username, s.module_slug) : null,
  }
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
      const { data } = await supabase
        .from('users')
        .select('id, name, username, email, is_portfolio_public')
        .in('id', chunk)
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
   * Maps a submission row onto the list shape (learner name + module titles). The essay is
   * read here only to count its words; it is not part of the result.
   */
  private static toCapstoneListRow(s: CapstoneSubmissionRow, userMap: Map<string, UserRow>): AdminCapstoneListRow {
    const user = s.user_id ? userMap.get(s.user_id) : undefined
    const definition = getCapstoneDefinition(s.module_slug)
    return {
      id: s.id,
      userId: s.user_id,
      learnerName: this.resolveLearnerName(user, 'Learner'),
      moduleSlug: s.module_slug,
      moduleTitle: definition?.moduleTitle || s.module_slug,
      capstoneTitle: definition?.title || s.module_slug,
      status: s.status,
      isPublic: s.is_public,
      submittedAt: s.submitted_at,
      reviewedAt: s.reviewed_at ?? null,
      wordCount: s.content.trim().split(/\s+/).filter(Boolean).length,
      ...capstonePublicLink(s, user),
    }
  }

  /** The full admin capstone shape, essay included, for the review drawer. */
  private static toCapstoneRow(s: CapstoneSubmissionRow, userMap: Map<string, UserRow>): AdminCapstoneRow {
    return { ...this.toCapstoneListRow(s, userMap), content: s.content }
  }

  /**
   * One page of the capstone queue (admin R6 B7).
   *
   * Filter: `status` is one of CAPSTONE_STATUS_FILTERS ('all' when absent or unknown, as
   * CapstonesView does) and is an exact `status` match.
   *
   * Order: the view sorts awaiting-review submissions (status 'submitted', no reviewed_at)
   * first, oldest first, then everything else newest first. PostgREST cannot order by
   * that expression, so the list is read as two segments — awaiting, then the rest — and
   * the page window is split across them. Both segments are counted up front, so no slice
   * is ever requested past its end. Learner names come from one batched `users` lookup.
   *
   * List rows carry `wordCount` but no `content`: the table never renders the essay,
   * and the review drawer reads it through `getCapstoneById`.
   */
  public static async getCapstonesPage(
    params: ModerationPageParams = {}
  ): Promise<ModerationPage<AdminCapstoneListRow>> {
    const { page, pageSize, from, to } = normalizeModerationPaging(params.page, params.pageSize)
    const status = normalizeModerationStatus(params.status, CAPSTONE_STATUS_FILTERS, 'all')
    const supabase = createServiceRoleClient()
    const table = () => supabase.from('capstone_submissions')

    // Awaiting review only exists in 'all' and 'submitted'.
    const hasAwaiting = status === 'all' || status === 'submitted'
    const awaiting = (columns: string, head: boolean) =>
      table()
        .select(columns, { count: 'exact', head })
        .eq('status', 'submitted')
        .is('reviewed_at', null)
    const rest = (columns: string, head: boolean) => {
      const q = table().select(columns, { count: 'exact', head })
      if (status === 'all') return q.or('status.neq.submitted,reviewed_at.not.is.null')
      if (status === 'submitted') return q.eq('status', 'submitted').not('reviewed_at', 'is', null)
      return q.eq('status', status)
    }

    try {
      const [awaitingCount, restCount] = await Promise.all([
        hasAwaiting ? awaiting('id', true) : Promise.resolve({ count: 0, error: null }),
        rest('id', true),
      ])
      if (awaitingCount.error) throw awaitingCount.error
      if (restCount.error) throw restCount.error
      const awaitingTotal = awaitingCount.count ?? 0
      const restTotal = restCount.count ?? 0

      // Split the [from, to] window across the two segments.
      const awaitingTo = Math.min(to, awaitingTotal - 1)
      const restFrom = Math.max(0, from - awaitingTotal)
      const restTo = Math.min(to - awaitingTotal, restTotal - 1)

      const [awaitingRows, restRows] = await Promise.all([
        from <= awaitingTo
          ? awaiting(CAPSTONE_COLUMNS, false)
              .order('submitted_at', { ascending: true })
              .order('id', { ascending: true })
              .range(from, awaitingTo)
          : Promise.resolve({ data: [], error: null }),
        restFrom <= restTo
          ? rest(CAPSTONE_COLUMNS, false)
              .order('submitted_at', { ascending: false })
              .order('id', { ascending: false })
              .range(restFrom, restTo)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (awaitingRows.error) throw awaitingRows.error
      if (restRows.error) throw restRows.error

      const rows = [
        ...((awaitingRows.data || []) as unknown as CapstoneSubmissionRow[]),
        ...((restRows.data || []) as unknown as CapstoneSubmissionRow[]),
      ]
      const userMap = await this.fetchUsersByIds(
        supabase,
        rows.map((s) => s.user_id).filter((id): id is string => Boolean(id))
      )

      return {
        items: rows.map((s) => this.toCapstoneListRow(s, userMap)),
        total: awaitingTotal + restTotal,
        page,
        pageSize,
        failed: false,
      }
    } catch (err) {
      console.warn('[ModerationService] getCapstonesPage failed:', err)
      return { items: [], total: 0, page, pageSize, failed: true }
    }
  }

  /**
   * One capstone submission by id, for the review drawer (admin R6 B7: the drawer no
   * longer depends on the row being on the current page). A malformed id or a missing
   * row returns `capstone: null` without failing.
   */
  public static async getCapstoneById(
    id: string
  ): Promise<{ capstone: AdminCapstoneRow | null; failed: boolean }> {
    if (typeof id !== 'string' || !UUID_RE.test(id)) return { capstone: null, failed: false }
    const supabase = createServiceRoleClient()
    try {
      const { data, error } = await supabase
        .from('capstone_submissions')
        .select(CAPSTONE_COLUMNS)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return { capstone: null, failed: false }
      const row = data as unknown as CapstoneSubmissionRow
      const userMap = await this.fetchUsersByIds(supabase, row.user_id ? [row.user_id] : [])
      return { capstone: this.toCapstoneRow(row, userMap), failed: false }
    } catch (err) {
      console.warn('[ModerationService] getCapstoneById failed:', err)
      return { capstone: null, failed: true }
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
   *   - the notification is dispatched on the first transition into reviewed (the row was not
   *     previously reviewed) and when a later review publishes a capstone that was not published
   *     before (reject, then approve). Each dispatch carries a stable event id, so a repeated
   *     review never produces a duplicate: the published email is keyed per submission, and the
   *     in-app write is keyed by the event id. The publishing re-review has its own id
   *     (`capstone-reviewed-<id>-published`), so it adds one in-app row saying "published".
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
        .select('id, user_id, module_slug, status, is_public, reviewed_at')
        .eq('id', submissionId)
        .maybeSingle()) as unknown as {
        data:
          | {
              id: string
              user_id: string | null
              module_slug: string
              status: string
              is_public: boolean | null
              reviewed_at: string | null
            }
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
      // This review publishes a capstone that is not published yet (first approve, or an approve
      // after an earlier reject). Approving an already published capstone again is not a change.
      const publishedNow = action === 'approve' && !(current.status === 'reviewed' && current.is_public === true)
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

      // 3. Notify the learner — on the first review, or when a re-review publishes the capstone —
      //    and only when we know who to notify.
      if ((!alreadyReviewed || publishedNow) && current.user_id) {
        await this.dispatchCapstoneReviewedNotification(supabase, {
          submissionId,
          userId: current.user_id,
          moduleSlug: current.module_slug,
          isPublished: action === 'approve',
          reviewedAt: reviewedAtIso,
          // The first review keeps the plain event id. A later review that publishes gets its own,
          // or its in-app notice would be dropped as a duplicate of the first review's.
          publishedOnReReview: alreadyReviewed,
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

      // A review can publish or unpublish the capstone: its public page renders per request, but
      // its OG card is cached, so drop it (Growth R5 B13b). The portfolio card shows the public
      // project count, so it goes too.
      if (current.user_id) {
        try {
          const { data: owner } = await (supabase.from('users') as unknown as DBChain)
            .select('username')
            .eq('id', current.user_id)
            .maybeSingle() as unknown as { data: { username: string | null } | null }
          if (owner?.username) {
            const { revalidateCapstoneOgCards, revalidatePortfolioOgCard } = await import(
              '@/lib/og/revalidate-capstone-cards'
            )
            revalidateCapstoneOgCards(owner.username, [current.module_slug])
            revalidatePortfolioOgCard(owner.username)
          }
        } catch {
          // Non-fatal, like the revalidation above.
        }
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
   *
   * The learner's email/name/portfolio handle come from one extra `users` lookup so the envelope
   * names the real recipient and a published review can deep-link to the public portfolio. That
   * lookup is best-effort: if it fails, the notification still goes out with placeholders.
   */
  private static async dispatchCapstoneReviewedNotification(
    supabase: ReturnType<typeof createServiceRoleClient>,
    input: {
      submissionId: string
      userId: string
      moduleSlug: string
      isPublished: boolean
      reviewedAt: string
      /** A re-review that publishes a capstone the first review left unpublished. */
      publishedOnReReview?: boolean
    }
  ): Promise<void> {
    try {
      const { globalNotificationDispatcher } = await import('@/lib/notifications/dispatcher')
      const { initializeNotificationConnectors } = await import('@/lib/notifications/events/connectors')
      initializeNotificationConnectors()

      type LearnerRow = { email?: string | null; name?: string | null; username?: string | null; is_portfolio_public?: boolean | null }
      let learner: LearnerRow | null = null
      try {
        const { data } = (await (supabase.from('users') as unknown as DBChain)
          .select('email, name, username, is_portfolio_public')
          .eq('id', input.userId)
          .maybeSingle()) as unknown as { data: LearnerRow | null }
        learner = data ?? null
      } catch (lookupErr) {
        console.error('[ModerationService] capstone.reviewed recipient lookup failed:', lookupErr)
      }

      const username = typeof learner?.username === 'string' && learner.username ? learner.username : null
      const definition = getCapstoneDefinition(input.moduleSlug)
      // The in-app row is keyed by this id. The first review's id is `capstone-reviewed-<id>`; the
      // publishing re-review adds `-published` so the learner's bell gets the "published" notice
      // beside the earlier "listing is off" one. Both keep the `capstone-reviewed-` prefix (the
      // celebrated_at backfill and the Growth tab match on it). The celebration claim reads the
      // two rows as one capstone (verifyCapstones in achievement-celebrations.ts): it celebrates
      // at most once, through the `-published` row when there is one, and not at all if either
      // row is already celebrated. The email is keyed by submission id, not by this.
      const firstReviewEventId = `capstone-reviewed-${input.submissionId}`
      await globalNotificationDispatcher.dispatch({
        id: input.publishedOnReReview ? `${firstReviewEventId}-published` : firstReviewEventId,
        event: 'capstone.reviewed',
        userId: input.userId,
        userEmail: typeof learner?.email === 'string' ? learner.email : '',
        userName: (typeof learner?.name === 'string' && learner.name) || username || 'Learner',
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
          username,
          isPortfolioPublic: learner?.is_portfolio_public === true,
        },
      })
    } catch (err) {
      console.error('[ModerationService] capstone.reviewed dispatch failed:', err)
    }
  }

  /** Counts each user's visible capstones (submitted/reviewed, not private), in chunked `.in()` reads. */
  private static async fetchPublicCapstoneCounts(
    supabase: ReturnType<typeof createServiceRoleClient>,
    userIds: string[]
  ): Promise<Map<string, number>> {
    const capstoneCountMap = new Map<string, number>()
    const uniqueIds = [...new Set(userIds)]
    const CHUNK = 500
    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const chunk = uniqueIds.slice(i, i + CHUNK)
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
    return capstoneCountMap
  }

  private static toPortfolioRow(u: UserRow, capstoneCountMap: Map<string, number>): AdminPortfolioRow {
    return {
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
    }
  }

  /**
   * One page of the public portfolio directory (admin R6 B7).
   *
   * Filters (PortfoliosView): `status` 'pending' = not a Fellow, 'verified' = Fellow,
   * 'all' = both; absent or unknown → 'pending', the view's default tab. `q` is a trimmed,
   * case-insensitive substring match on name, username, email or bio (the view matched
   * the resolved learner name, which is name → username → email local part, so these
   * four columns cover it). `%` and `_` in `q` match literally.
   *
   * `counts` carries the view's KPI row — all/pending/verified over every public
   * portfolio, ignoring tab and search — so it no longer has to be derived from the page.
   */
  public static async getPortfoliosPage(
    params: ModerationPageParams & { q?: string | null } = {}
  ): Promise<ModerationPage<AdminPortfolioRow> & { counts: AdminPortfolioCounts }> {
    const { page, pageSize, from, to } = normalizeModerationPaging(params.page, params.pageSize)
    const status = normalizeModerationStatus(params.status, PORTFOLIO_STATUS_FILTERS, 'pending')
    const q = typeof params.q === 'string' ? params.q.trim() : ''
    const supabase = createServiceRoleClient()
    const emptyCounts: AdminPortfolioCounts = { all: 0, pending: 0, verified: 0 }

    const build = () => {
      let query = supabase
        .from('users')
        .select(PORTFOLIO_USER_COLUMNS, { count: 'exact' })
        .eq('is_portfolio_public', true)
      if (status === 'pending') query = query.eq('is_fellow', false)
      if (status === 'verified') query = query.eq('is_fellow', true)
      if (q) query = query.or(buildIlikeOrFilter(PORTFOLIO_SEARCH_COLUMNS, q))
      return query.order('created_at', { ascending: false }).order('id', { ascending: false })
    }
    const headCount = (fellowOnly: boolean) => {
      const query = supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_portfolio_public', true)
      return fellowOnly ? query.eq('is_fellow', true) : query
    }

    try {
      const [pageResult, allRes, verifiedRes] = await Promise.all([
        runCountedPage<UserRow>(() => build() as unknown as RangeableCountQuery, from, to),
        headCount(false),
        headCount(true),
      ])
      if (allRes.error) throw allRes.error
      if (verifiedRes.error) throw verifiedRes.error

      const capstoneCountMap = await this.fetchPublicCapstoneCounts(
        supabase,
        pageResult.rows.map((u) => u.id).filter(Boolean)
      )
      const all = allRes.count ?? 0
      const verified = verifiedRes.count ?? 0

      return {
        items: pageResult.rows.map((u) => this.toPortfolioRow(u, capstoneCountMap)),
        total: pageResult.total,
        page,
        pageSize,
        failed: false,
        counts: { all, verified, pending: Math.max(0, all - verified) },
      }
    } catch (err) {
      console.warn('[ModerationService] getPortfoliosPage failed:', err)
      return { items: [], total: 0, page, pageSize, failed: true, counts: emptyCounts }
    }
  }
}