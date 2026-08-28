'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Clock,
  BookOpen,
  Users,
  HelpCircle,
  ListOrdered,
  Star,
  MessageSquare,
} from 'lucide-react'
import { AdminPageHeader } from './AdminPageHeader'
import { AdminSection } from './AdminSection'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminLoadWarning } from './AdminLoadWarning'
import { AdminLessonPreview } from './AdminLessonPreview'
import type { AdminLessonDetail } from '@/lib/admin/types'

interface AdminLessonDetailViewProps {
  lesson: AdminLessonDetail
  prevLessonUrl: string | null
  nextLessonUrl: string | null
  /** Total lessons in the curriculum (used in the header copy). */
  totalLessons: number
  /** True when the live completion query failed (renders a warning banner). */
  initialLoadFailed?: boolean
}

/**
 * Lesson detail workspace (spec §4.5–4.6): metadata panel + the large
 * learner-facing preview as the primary experience.
 */
export function AdminLessonDetailView({
  lesson,
  prevLessonUrl,
  nextLessonUrl,
  totalLessons,
  initialLoadFailed = false,
}: AdminLessonDetailViewProps) {
  const router = useRouter()

  const metaItems: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: 'Difficulty',
      value: (
        <span role="img" aria-label={`Difficulty ${lesson.difficulty} of 5`}>
          <span className="text-admin-warning" aria-hidden="true">
            {'★'.repeat(lesson.difficulty)}
            {'☆'.repeat(Math.max(0, 5 - lesson.difficulty))}
          </span>
        </span>
      ),
    },
    {
      label: 'Reading time',
      value: (
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-admin-fg-subtle" />
          {lesson.estimatedReadingTime} min
        </span>
      ),
    },
    {
      label: 'Completion time',
      value: `${lesson.estimatedCompletionTime} min`,
    },
    {
      label: 'Content types',
      value: (
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
      label: 'Completions',
      value: (
        <span className="inline-flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-admin-fg-subtle" />
          {lesson.completions.toLocaleString()} learners ({lesson.completionPct.toFixed(1)}%)
        </span>
      ),
    },
    {
      label: 'Quiz',
      value: (
        <span className="inline-flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5 text-admin-fg-subtle" />
          {lesson.quizAttempts.toLocaleString()} attempts · avg{' '}
          {lesson.quizAvgScore === null ? '—' : `${lesson.quizAvgScore.toFixed(1)}%`}
        </span>
      ),
    },
    {
      label: 'Content Quality',
      value:
        lesson.clarityScore !== null && lesson.clarityScore !== undefined ? (
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-bold">★ {lesson.clarityScore.toFixed(1)}</span>
            {lesson.clarityPct !== null && (
              <span className="text-admin-fg-subtle text-xs">({lesson.clarityPct}% clear)</span>
            )}
            {lesson.needsReview && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-semibold text-amber-400">
                Needs Review
              </span>
            )}
          </div>
        ) : (
          <span className="text-admin-fg-subtle">No ratings yet</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={lesson.title}
        description={`Lesson ${lesson.globalOrder} of ${totalLessons} · Module ${lesson.moduleNumber} — ${lesson.moduleName}`}
        icon={BookOpen}
        actions={
          <>
            <a
              href={`/academy/${lesson.module}/${lesson.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-xs font-semibold border border-admin-border transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in learner app
            </a>
            {prevLessonUrl && (
              <button
                type="button"
                onClick={() => router.push(prevLessonUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-xs font-semibold border border-admin-border transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Prev
              </button>
            )}
            {nextLessonUrl && (
              <button
                type="button"
                onClick={() => router.push(nextLessonUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-xs font-semibold border border-admin-border transition-colors cursor-pointer"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        }
      />

      <div className="flex items-center gap-2">
        <AdminStatusBadge status={lesson.status} />
        <span className="text-[11px] font-mono text-admin-fg-subtle">{lesson.id}</span>
      </div>

      {/* Metadata panel */}
      <AdminSection title="Lesson Metadata" icon={ListOrdered}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
          {metaItems.map((item) => (
            <div key={item.label}>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-admin-fg-subtle">
                {item.label}
              </dt>
              <dd className="mt-1 text-admin-fg font-semibold">{item.value}</dd>
            </div>
          ))}
        </dl>

        {lesson.prerequisites.length > 0 && (
          <div className="mt-5 pt-4 border-t border-admin-border">
            <p className="text-[11px] font-bold uppercase tracking-wider text-admin-fg-subtle mb-2">
              Prerequisites
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lesson.prerequisites.map((title) => (
                <span
                  key={title}
                  className="px-2 py-0.5 rounded bg-admin-surface-raised border border-admin-border text-[11px] text-admin-fg-muted"
                >
                  {title}
                </span>
              ))}
            </div>
          </div>
        )}
      </AdminSection>

      {/* Learner Feedback & Clarity Issues (Phase 6) */}
      {lesson.recentFeedback && lesson.recentFeedback.length > 0 && (
        <AdminSection title="Learner Feedback & Clarity Issues" icon={MessageSquare}>
          <div className="space-y-3">
            {lesson.recentFeedback.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-admin-surface border border-admin-border/80 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold text-xs flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {item.rating}/5
                    </span>
                    {item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-2">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-admin-surface-raised border border-admin-border text-[10px] font-medium text-admin-fg-muted"
                          >
                            {tag.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-admin-fg-subtle font-mono">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {item.comment && (
                  <p className="text-xs text-admin-fg italic bg-admin-surface-raised/40 p-2 rounded-lg border border-admin-border/40">
                    &ldquo;{item.comment}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        </AdminSection>
      )}

      {initialLoadFailed && (
        <AdminLoadWarning message="Live completion stats could not be fetched — showing the lesson preview without them. Check that the database is reachable." />
      )}

      <AdminLessonPreview blocks={lesson.blocks} lessonId={lesson.id} />
    </div>
  )
}