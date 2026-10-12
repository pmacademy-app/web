'use client'

import React, { useCallback, useEffect, useOptimistic, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldAlert, MessageSquare, Lightbulb, FileCheck2, Globe, Info, Award } from 'lucide-react'
import { AdminPageShell } from './AdminPageShell'
import { AdminLoadWarning } from './AdminLoadWarning'
import { FeedbackModerationView } from './FeedbackModerationView'
import { FeedbackListView } from './FeedbackListView'
import { CapstonesView } from './CapstonesView'
import { PortfoliosView } from './PortfoliosView'
import { FellowRequestsView } from './FellowRequestsView'
import { AdminPagination } from './AdminPagination'
import type { TestimonialItem } from '@/lib/admin/feedback-service'
import type { AdminFeedbackItem } from './FeedbackListView'
import type { AdminCapstoneListRow, AdminCapstoneRow, AdminPortfolioRow } from '@/lib/admin/achievements-aggregation'
import type { AdminFellowRequestItem } from '@/lib/admin/fellow-request-service'
import type { AdminPortfolioCounts, ModerationPage } from '@/lib/admin/moderation-service'

export type ModerationTab = 'testimonials' | 'feedback' | 'capstones' | 'portfolios' | 'fellow-requests'

/** The active tab's server-paged list (admin R6 B7: only the active tab is loaded). */
export type ModerationListData =
  | { tab: 'testimonials'; list: ModerationPage<TestimonialItem> }
  | { tab: 'feedback'; list: ModerationPage<AdminFeedbackItem> }
  | {
      tab: 'capstones'
      /** List rows carry no essay; `capstone` is the full row for the review drawer. */
      list: ModerationPage<AdminCapstoneListRow>
      capstone: AdminCapstoneRow | null
      capstoneFailed: boolean
    }
  | { tab: 'portfolios'; list: ModerationPage<AdminPortfolioRow> & { counts: AdminPortfolioCounts } }
  | { tab: 'fellow-requests'; list: ModerationPage<AdminFellowRequestItem> }

/** A URL change: `undefined` or '' removes the param. */
export type ModerationParamsPatch = Partial<Record<'status' | 'q' | 'page' | 'capstone', string | undefined>>

/** `replace` swaps the current history entry instead of adding one (used by the search box). */
export interface ModerationNavOptions {
  replace?: boolean
}

interface ModerationWorkspaceProps {
  data: ModerationListData
  /** Raw `status` URL param; each view applies its own default. */
  status: string | null
  /** Raw `q` URL param (only the Portfolios tab searches). */
  q: string
  selectedCapstoneId: string | null
}

const TABS: { id: ModerationTab; label: string; icon: React.ElementType }[] = [
  { id: 'testimonials', label: 'Testimonials', icon: MessageSquare },
  { id: 'feedback', label: 'Product Feedback', icon: Lightbulb },
  { id: 'capstones', label: 'Capstones', icon: FileCheck2 },
  { id: 'portfolios', label: 'Portfolio Verification', icon: Globe },
  { id: 'fellow-requests', label: 'Fellow Requests', icon: Award },
]

export function ModerationWorkspace({ data, status, q, selectedCapstoneId }: ModerationWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  // Tab, filter, search and page changes are server navigations: run them in a transition so
  // the current page stays interactive and the panel can show that a new list is loading.
  const [isPending, startTransition] = useTransition()

  const activeTab: ModerationTab = data.tab
  // The tab shown as selected: the target tab while its page loads, then the server's tab.
  const [selectedTab, setSelectedTab] = useOptimistic<ModerationTab>(activeTab)
  const { list } = data

  // The query of a navigation that has been started but not committed. `useSearchParams()` only
  // changes on commit, so a second change made meanwhile (the debounced search firing after a
  // filter click, or the other way round) must build on this, not on the stale snapshot, or it
  // would drop the first change. `push` records whether that navigation adds a history entry.
  const pendingNavRef = useRef<{ query: string; push: boolean } | null>(null)
  const committedQuery = searchParams.toString()
  useEffect(() => {
    // Committed (or abandoned): the URL snapshot is the truth again.
    if (!isPending) pendingNavRef.current = null
  }, [isPending, committedQuery])
  useEffect(() => {
    // Back/Forward makes the URL the truth at once, whatever was still loading.
    const clear = () => {
      pendingNavRef.current = null
    }
    window.addEventListener('popstate', clear)
    return () => window.removeEventListener('popstate', clear)
  }, [])

  /**
   * Applies a URL change. Changing the status or the search resets to page 1 (decision 5);
   * opening a capstone or changing the page keeps the rest of the query.
   */
  const updateParams = useCallback(
    (patch: ModerationParamsPatch, options?: ModerationNavOptions) => {
      let next = new URLSearchParams(committedQuery)
      let replace = options?.replace === true
      const pending = pendingNavRef.current
      if (pending) {
        const pendingParams = new URLSearchParams(pending.query)
        if ((pendingParams.get('tab') ?? activeTab) === activeTab) {
          next = pendingParams
          // Replacing while a push is still loading would swallow that push's history entry.
          if (pending.push) replace = false
        } else if (replace) {
          // A typed search for a tab that is being left: drop it rather than cancel the tab change.
          return
        }
      }
      if ('status' in patch || 'q' in patch) next.delete('page')
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key)
        else next.set(key, value)
      }
      const query = next.toString()
      pendingNavRef.current = { query, push: !replace }
      startTransition(() => {
        if (replace) router.replace(`/admin/moderation?${query}`, { scroll: false })
        else router.push(`/admin/moderation?${query}`, { scroll: false })
      })
    },
    [router, committedQuery, activeTab]
  )

  const handleTabChange = useCallback(
    (tab: ModerationTab) => {
      // Status values and search differ per tab, so a tab change starts from a clean list.
      const next = new URLSearchParams()
      next.set('tab', tab)
      pendingNavRef.current = { query: next.toString(), push: true }
      startTransition(() => {
        setSelectedTab(tab)
        router.push(`/admin/moderation?${next.toString()}`, { scroll: false })
      })
    },
    [router, setSelectedTab]
  )

  const handlePageChange = useCallback(
    (page: number) => updateParams({ page: page > 1 ? String(page) : undefined }),
    [updateParams]
  )

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize))
  // Remount the view when the page of data changes so its local (optimistic) copy of
  // the rows is re-seeded from the server instead of keeping the previous page.
  const listKey = `${activeTab}|${status ?? ''}|${q}|${list.page}`

  // Manual activation: arrow keys only move focus, and Enter or Space (the button's own click)
  // loads the tab. Each tab is a server navigation, so loading on every arrow press would run
  // one load and add one history entry per tab passed over.
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, tab: ModerationTab) => {
    const index = TABS.findIndex((t) => t.id === tab)
    let nextIndex = index
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = TABS.length - 1
    else return

    e.preventDefault()
    tabRefs.current[TABS[nextIndex].id]?.focus()
  }

  return (
    <AdminPageShell
      title="Moderation"
      description="Review learner-generated content: testimonials, product feedback, capstones and portfolios."
      icon={ShieldAlert}
    >
      {/* Tab bar */}
      <nav
        role="tablist"
        aria-label="Moderation sections"
        className="border-b border-admin-border flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-admin-border"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = selectedTab === tab.id
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el
              }}
              role="tab"
              id={`moderation-tab-${tab.id}`}
              aria-selected={isActive}
              // Only the loaded tab has a panel in the DOM.
              aria-controls={tab.id === activeTab ? `moderation-panel-${tab.id}` : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'border-admin-accent text-admin-accent bg-admin-accent-soft/50 font-semibold'
                  : 'border-transparent text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div
        role="tabpanel"
        id={`moderation-panel-${activeTab}`}
        aria-labelledby={`moderation-tab-${activeTab}`}
        aria-busy={isPending}
        data-pending={isPending ? 'true' : undefined}
        className={`space-y-4 transition-opacity duration-150 motion-reduce:transition-none ${isPending ? 'opacity-60' : 'opacity-100'}`}
      >
        {list.failed && (
          <AdminLoadWarning
            message={`Live ${TABS.find((t) => t.id === activeTab)?.label.toLowerCase() ?? 'moderation data'} could not be loaded. Showing an empty page.`}
          />
        )}

        {data.tab === 'testimonials' && (
          <FeedbackModerationView
            key={listKey}
            initialQueue={data.list.items}
            status={status}
            onParamsChange={updateParams}
            embedded
          />
        )}

        {data.tab === 'feedback' && (
          <>
            {/* Product feedback is triaged, not moderated: nothing here is published, so there
                is no approve/reject. The drawer sets a triage status instead. */}
            <div className="flex items-center gap-2 rounded-xl border border-admin-border bg-admin-surface/50 px-4 py-3 text-xs text-admin-fg-muted">
              <Info className="w-4 h-4 text-admin-info shrink-0" aria-hidden="true" />
              Product feedback is never published, so there is nothing to approve or reject. Open an item to mark it reviewed, planned, resolved or dismissed.
            </div>
            <FeedbackListView key={listKey} initialFeedback={data.list.items} />
          </>
        )}

        {data.tab === 'capstones' && (
          <>
            {data.capstoneFailed && (
              <AdminLoadWarning message="This capstone submission could not be loaded." />
            )}
            <CapstonesView
              capstones={data.list.items}
              status={status}
              onParamsChange={updateParams}
              selectedCapstoneId={selectedCapstoneId}
              selectedCapstoneDetail={data.capstone}
            />
          </>
        )}

        {data.tab === 'portfolios' && (
          <PortfoliosView
            initialPortfolios={data.list.items}
            counts={data.list.counts}
            status={status}
            q={q}
            onParamsChange={updateParams}
          />
        )}

        {data.tab === 'fellow-requests' && (
          <FellowRequestsView
            key={listKey}
            initialQueue={data.list.items}
            status={status}
            onParamsChange={updateParams}
          />
        )}

        {totalPages > 1 && (
          <AdminPagination
            currentPage={list.page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            pageSize={list.pageSize}
            totalItems={list.total}
          />
        )}
      </div>
    </AdminPageShell>
  )
}