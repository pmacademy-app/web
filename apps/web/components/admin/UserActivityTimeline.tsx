import React from 'react'
import {
  CheckCircle2,
  HelpCircle,
  Award,
  ScrollText,
  PenLine,
  FolderCheck,
  Activity,
} from 'lucide-react'
import { AdminEmptyState } from './AdminEmptyState'
import type { AdminUserActivityItem, AdminUserActivityType } from '@/lib/admin/types'
import { cn } from '@/lib/utils'

const TYPE_META: Record<AdminUserActivityType, { icon: React.ElementType; color: string; dot: string }> = {
  lesson_completed: { icon: CheckCircle2, color: 'text-admin-success', dot: 'bg-admin-success' },
  quiz_attempted: { icon: HelpCircle, color: 'text-admin-info', dot: 'bg-admin-info' },
  badge_earned: { icon: Award, color: 'text-admin-accent', dot: 'bg-admin-accent' },
  certificate_issued: { icon: ScrollText, color: 'text-admin-warning', dot: 'bg-admin-warning' },
  reflection_created: { icon: PenLine, color: 'text-admin-fg-muted', dot: 'bg-admin-neutral' },
  capstone_submitted: { icon: FolderCheck, color: 'text-admin-success', dot: 'bg-admin-success' },
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}

/**
 * User Activity timeline — chronological feed of lesson completions, quiz
 * attempts, badges, certificates, reflections and capstone submissions.
 */
export function UserActivityTimeline({ items }: { items: AdminUserActivityItem[] }) {
  if (items.length === 0) {
    return (
      <AdminEmptyState
        icon={Activity}
        title="No activity yet"
        description="Lesson completions, quiz attempts, badges and certificates will appear here as the learner progresses."
        className="py-10"
      />
    )
  }

  return (
    <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-admin-border">
      {items.map((item) => {
        const meta = TYPE_META[item.type] || TYPE_META.lesson_completed
        const Icon = meta.icon
        return (
          <li key={item.id} className="relative pl-9">
            <span
              className={cn(
                'absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-admin-border bg-admin-surface',
                meta.dot
              )}
            >
              <Icon className={cn('w-3 h-3 text-admin-surface', meta.color)} />
            </span>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-admin-fg">{item.label}</p>
                <p className="text-[11px] text-admin-fg-muted truncate">{item.detail}</p>
              </div>
              <span className="text-[10px] font-mono text-admin-fg-subtle shrink-0">
                {formatTimestamp(item.timestamp)}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}