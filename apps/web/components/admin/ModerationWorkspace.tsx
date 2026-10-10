'use client'

import React, { useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldAlert, MessageSquare, Lightbulb, FileCheck2, Globe, AlertTriangle, Award } from 'lucide-react'
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
import type { AdminCapstoneRow, AdminPortfolioRow } from '@/lib/admin/achievements-aggregation'
import type { AdminFellowRequestItem } from '@/lib/admin/fellow-request-service'
import type { AdminPortfolioCounts, ModerationPage } from '@/lib/admin/moderation-service'

export type ModerationTab = 'testimonials' | 'feedback' | 'capstones' | 'portfolios' | 'fellow-requests'

/** The active tab's server-paged list (admin R6 B7: only the active tab is loaded). */
export type ModerationListData =
  | { tab: 'testimonials'; list: ModerationPage<TestimonialItem> }
  | { tab: 'feedback'; list: ModerationPage<AdminFeedbackItem> }
  | {
      tab: 'capstones'
      list: ModerationPage<AdminCapstoneRow>
      capstone: AdminCapstoneRow | null
      capstoneFailed: boolean
    }
  | { tab: 'portfolios'; list: ModerationPage<AdminPortfolioRow> & { counts: AdminPortfolioCounts } }
  | { tab: 'fellow-requests'; list: ModerationPage<AdminFellowRequestItem> }

/** A URL change: `undefined` or '' removes the param. */
export type ModerationParamsPatch = Partial<Record<'status' | 'q' | 'page' | 'capstone', string | undefined>>

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

  const activeTab: ModerationTab = data.tab
  const { list } = data

  /**
   * Applies a URL change. Changing the status or the search resets to page 1 (decision 5);
   * opening a capstone or changing the page keeps the rest of the query.
   */
  const updateParams = useCallback(
    (patch: ModerationParamsPatch) => {
      const next = new URLSearchParams(searchParams.toString())
      if ('status' in patch || 'q' in patch) next.delete('page')
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key)
        else next.set(key, value)
      }
      router.push(`/admin/moderation?${next.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const handleTabChange = useCallback(
    (tab: ModerationTab) => {
      // Status values and search differ per tab, so a tab change starts from a clean list.
      const next = new URLSearchParams()
      next.set('tab', tab)
      router.push(`/admin/moderation?${next.toString()}`, { scroll: false })
    },
    [router]
  )

  const handlePageChange = useCallback(
    (page: number) => updateParams({ page: page > 1 ? String(page) : undefined }),
    [updateParams]
  )

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize))
  // Remount the view when the page of data changes so its local (optimistic) copy of
  // the rows is re-seeded from the server instead of keeping the previous page.
  const listKey = `${activeTab}|${status ?? ''}|${q}|${list.page}`

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, tab: ModerationTab) => {
    const index = TABS.findIndex((t) => t.id === tab)
    let nextIndex = index
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = TABS.length - 1
    else return

    e.preventDefault()
    const nextTab = TABS[nextIndex]
    handleTabChange(nextTab.id)
    tabRefs.current[nextTab.id]?.focus()
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
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el
              }}
              role="tab"
              id={`moderation-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`moderation-panel-${tab.id}`}
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
        className="space-y-4"
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
            {/* Schema note (spec §5.9): product feedback has no moderation
                status column, so approve/reject actions are not offered (G2).
                The note is always visible so the read-only state is never
                implied to be a temporary loading condition. */}
            <div className="flex items-center gap-2 rounded-xl border border-admin-border bg-admin-surface/50 px-4 py-3 text-xs text-admin-fg-muted">
              <AlertTriangle className="w-4 h-4 text-admin-warning shrink-0" />
              Product feedback is read-only this phase. Approve/reject actions require a backend status column.
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