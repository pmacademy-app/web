import React from 'react'
import Link from 'next/link'
import { ChevronRight, Users, BookOpen } from 'lucide-react'
import { AdminProgressBar } from './AdminProgressBar'
import { AdminStatusBadge } from './AdminStatusBadge'
import type { AdminModuleOverview } from '@/lib/admin/types'

/**
 * Module card for the curriculum overview grid (spec §4.2).
 *
 * Presentational — navigation is handled by the parent workspace via `href`.
 */
export function AdminModuleCard({ module, href }: { module: AdminModuleOverview; href: string }) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-4 rounded-xl bg-admin-surface border border-admin-border p-5 shadow-xl transition-all hover:border-admin-border-strong hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-admin-surface-raised border border-admin-border text-xl shrink-0">
            <span aria-hidden="true">{module.icon}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold text-admin-fg-subtle uppercase tracking-wider">
              Module {module.number}
            </p>
            <h3 className="text-sm font-bold text-admin-fg truncate">{module.name}</h3>
          </div>
        </div>
        <AdminStatusBadge status={module.status} />
      </div>

      <p className="text-xs text-admin-fg-muted leading-relaxed line-clamp-2">{module.description}</p>

      <div className="space-y-2">
        <AdminProgressBar value={module.avgCompletionPct} label="Avg completion" showValue />
        <div className="flex items-center justify-between text-[11px] text-admin-fg-muted font-medium">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            {module.lessonCount} lessons
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {module.learnersStarted.toLocaleString()} started
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-admin-border pt-3">
        <span className="text-xs font-semibold text-admin-accent">View module</span>
        <ChevronRight className="w-4 h-4 text-admin-fg-subtle transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}