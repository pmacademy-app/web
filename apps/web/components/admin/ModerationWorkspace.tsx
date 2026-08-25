'use client'

import React, { useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldAlert, MessageSquare, Lightbulb, FileCheck2, Globe, AlertTriangle } from 'lucide-react'
import { AdminPageShell } from './AdminPageShell'
import { AdminLoadWarning } from './AdminLoadWarning'
import { FeedbackModerationView } from './FeedbackModerationView'
import { FeedbackListView } from './FeedbackListView'
import { CapstonesView } from './CapstonesView'
import { PortfoliosView } from './PortfoliosView'
import type { TestimonialItem } from '@/lib/admin/feedback-service'
import type { AdminFeedbackItem } from './FeedbackListView'
import type { AdminCapstoneRow, AdminPortfolioRow } from '@/lib/admin/achievements-aggregation'

export type ModerationTab = 'testimonials' | 'feedback' | 'capstones' | 'portfolios'

interface ModerationWorkspaceProps {
  initialTab: string
  initialTestimonials: TestimonialItem[]
  initialFeedback: AdminFeedbackItem[]
  initialCapstones: AdminCapstoneRow[]
  capstonesLoadFailed: boolean
  initialPortfolios: AdminPortfolioRow[]
  portfoliosLoadFailed: boolean
  initialCapstoneStatus: string
  selectedCapstoneId: string | null
  selectedCapstoneDetail: AdminCapstoneRow | null
}

const TABS: { id: ModerationTab; label: string; icon: React.ElementType }[] = [
  { id: 'testimonials', label: 'Testimonials', icon: MessageSquare },
  { id: 'feedback', label: 'Product Feedback', icon: Lightbulb },
  { id: 'capstones', label: 'Capstones', icon: FileCheck2 },
  { id: 'portfolios', label: 'Portfolios', icon: Globe },
]

export function ModerationWorkspace({
  initialTab,
  initialTestimonials,
  initialFeedback,
  initialCapstones,
  capstonesLoadFailed,
  initialPortfolios,
  portfoliosLoadFailed,
  initialCapstoneStatus,
  selectedCapstoneId,
  selectedCapstoneDetail,
}: ModerationWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const activeTab: ModerationTab = TABS.some((t) => t.id === initialTab) ? (initialTab as ModerationTab) : 'testimonials'

  const handleTabChange = useCallback(
    (tab: ModerationTab) => {
      const next = new URLSearchParams(searchParams.toString())
      next.set('tab', tab)
      next.delete('capstone')
      router.push(`/admin/moderation?${next.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

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
        {activeTab === 'testimonials' && <FeedbackModerationView initialQueue={initialTestimonials} embedded />}

        {activeTab === 'feedback' && (
          <>
            {/* Schema note (spec §5.9): product feedback has no moderation
                status column, so approve/reject actions are not offered (G2).
                The note is always visible so the read-only state is never
                implied to be a temporary loading condition. */}
            <div className="flex items-center gap-2 rounded-xl border border-admin-border bg-admin-surface/50 px-4 py-3 text-xs text-admin-fg-muted">
              <AlertTriangle className="w-4 h-4 text-admin-warning shrink-0" />
              Product feedback is read-only this phase. Approve/reject actions require a backend status column.
            </div>
            <FeedbackListView initialFeedback={initialFeedback} />
          </>
        )}

        {activeTab === 'capstones' && (
          <>
            {capstonesLoadFailed && (
              <AdminLoadWarning message="Live capstone submissions could not be loaded. Showing cached or empty values." />
            )}
            <CapstonesView
              initialCapstones={initialCapstones}
              initialStatusFilter={initialCapstoneStatus}
              selectedCapstoneId={selectedCapstoneId}
              selectedCapstoneDetail={selectedCapstoneDetail}
            />
          </>
        )}

        {activeTab === 'portfolios' && (
          <>
            {portfoliosLoadFailed && (
              <AdminLoadWarning message="Live portfolio data could not be loaded. Showing cached or empty values." />
            )}
            <PortfoliosView initialPortfolios={initialPortfolios} />
          </>
        )}
      </div>
    </AdminPageShell>
  )
}