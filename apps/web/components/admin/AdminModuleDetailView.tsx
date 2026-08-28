'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Users, TrendingUp, ArrowLeft, ExternalLink, Eye } from 'lucide-react'
import { AdminPageHeader } from './AdminPageHeader'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminProgressBar } from './AdminProgressBar'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminLoadWarning } from './AdminLoadWarning'
import type { AdminLessonOverview, AdminModuleDetail } from '@/lib/admin/types'

interface AdminModuleDetailViewProps {
  module: AdminModuleDetail
  /** True when the live completion query failed (renders an error state). */
  initialLoadFailed?: boolean
}

/**
 * Module detail workspace (spec §4.3–4.4): module header, KPI summary and the
 * lesson table. Row clicks / "Preview" navigate to the lesson detail page,
 * which hosts the full learner-facing preview.
 */
export function AdminModuleDetailView({ module, initialLoadFailed = false }: AdminModuleDetailViewProps) {
  const router = useRouter()
  const [filterNeedsReview, setFilterNeedsReview] = useState(false)

  const columns: Column<AdminLessonOverview>[] = [
    {
      header: '#',
      accessorKey: 'order',
      className: 'w-12 text-admin-fg-subtle font-mono',
    },
    {
      header: 'Lesson',
      cell: (lesson) => (
        <div className="min-w-0">
          <p className="font-semibold text-admin-fg truncate">{lesson.title}</p>
          <p className="text-[11px] text-admin-fg-muted font-mono truncate">{lesson.slug}</p>
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (lesson) => (
        <div className="flex flex-wrap gap-1">
          {lesson.types.map((type) => (
            <span
              key={type}
              className="px-1.5 py-0.5 rounded bg-admin-surface-raised border border-admin-border text-[10px] font-semibold text-admin-fg-muted capitalize"
            >
              {type}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Completion',
      cell: (lesson) => (
        <div className="w-28">
          <AdminProgressBar value={lesson.completionPct} showValue={false} />
        </div>
      ),
    },
    {
      header: 'Content Quality',
      cell: (lesson) => {
        if (lesson.clarityScore === null || lesson.clarityScore === undefined) {
          return <span className="text-xs text-admin-fg-muted font-mono">—</span>
        }
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-admin-fg flex items-center gap-1">
                <span className="text-amber-400">★</span> {lesson.clarityScore.toFixed(1)}
              </span>
              {lesson.clarityPct !== null && (
                <span className="text-[10px] text-admin-fg-muted font-mono">
                  ({lesson.clarityPct}% clear)
                </span>
              )}
            </div>
            {lesson.needsReview && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-semibold text-amber-500 w-fit">
                Needs Review
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Status',
      cell: (lesson) => <AdminStatusBadge status={lesson.status} />,
    },
  ]

  const needsReviewCount = module.lessons.filter((l) => l.needsReview).length
  const displayedLessons = filterNeedsReview
    ? module.lessons.filter((l) => l.needsReview)
    : module.lessons

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`Module ${module.number} — ${module.name}`}
        description={module.description}
        icon={BookOpen}
        actions={
          <>
            <a
              href={`/academy#${module.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-xs font-semibold border border-admin-border transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in learner app
            </a>
            <button
              type="button"
              onClick={() => router.push('/admin/curriculum')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-xs font-semibold border border-admin-border transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to curriculum
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminKpiCard
          title="Lessons"
          value={module.lessonCount}
          subtitle="In this module"
          icon={BookOpen}
          iconColor="text-admin-info"
        />
        <AdminKpiCard
          title="Learners Started"
          value={module.learnersStarted.toLocaleString()}
          subtitle="Completed at least one lesson"
          icon={Users}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="Avg Completion"
          value={`${module.avgCompletionPct.toFixed(1)}%`}
          subtitle="Among started learners"
          icon={TrendingUp}
          iconColor="text-admin-success"
        />
      </div>

      {initialLoadFailed && (
        <AdminLoadWarning message="Live completion stats could not be fetched — showing the lesson list without them. Check that the database is reachable." />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilterNeedsReview(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
            !filterNeedsReview
              ? 'bg-admin-surface-raised border-admin-border text-admin-fg shadow-sm'
              : 'border-transparent text-admin-fg-muted hover:text-admin-fg'
          }`}
        >
          All Lessons ({module.lessons.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterNeedsReview(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
            filterNeedsReview
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
              : 'border-transparent text-admin-fg-muted hover:text-admin-fg'
          }`}
        >
          <span>Needs Review</span>
          {needsReviewCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-mono rounded-full bg-amber-500/20 text-amber-400">
              {needsReviewCount}
            </span>
          )}
        </button>
      </div>

      <AdminDataTable
        columns={columns}
        data={displayedLessons}
        keyExtractor={(lesson) => lesson.id}
        onRowClick={(lesson) => router.push(`/admin/curriculum/${module.slug}/${lesson.id}`)}
        rowAriaLabel={(lesson) => `Open lesson ${lesson.title}`}
        rowActions={(lesson) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/admin/curriculum/${module.slug}/${lesson.id}`)
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors cursor-pointer"
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
        )}
        emptyTitle="No lessons found"
        emptyDescription="This module has no lessons in the curriculum."
      />
    </div>
  )
}