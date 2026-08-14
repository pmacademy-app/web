import React from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import type { AdminRecentActivityItem } from '@/lib/admin/types'

interface AdminRecentActivityListProps {
  items: AdminRecentActivityItem[]
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function AdminRecentActivityList({ items }: AdminRecentActivityListProps) {
  return (
    <div className="p-6 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-admin-border pb-4">
        <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-admin-accent" />
          Recent Activity
        </h2>
        <span className="text-[11px] font-mono text-admin-fg-muted">{items.length} events</span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-admin-fg-muted">No recent activity.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-admin-border">
          {items.map((item) => (
            <li key={item.id} className="relative pl-6">
              <span className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full bg-admin-accent border-2 border-admin-surface" />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-admin-fg">
                  <span className="font-semibold">{item.userName}</span>{' '}
                  <span className="text-admin-fg-muted">{item.activity}</span>{' '}
                  <span className="font-mono text-admin-accent">{item.entity}</span>
                </p>
                <span className="text-[10px] font-mono text-admin-fg-muted shrink-0">{timeAgo(item.timestamp)}</span>
              </div>
              {item.href && (
                <Link href={item.href} className="text-[11px] font-semibold text-admin-accent hover:underline">
                  View →
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}