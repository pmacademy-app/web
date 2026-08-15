import React from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
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
    <AdminSection title="Recent Activity" icon={Activity} meta={`${items.length} events`}>
      {items.length === 0 ? (
        <AdminEmptyState
          icon={Activity}
          title="No recent activity"
          description="Recent registrations, lesson completions, capstones and certificates will appear here."
          className="py-10"
        />
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
                <Link
                  href={item.href}
                  className="inline-block mt-0.5 text-[11px] font-semibold text-admin-accent hover:underline"
                >
                  View →
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </AdminSection>
  )
}