import React from 'react'
import Link from 'next/link'
import { Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminSystemSnapshotItem } from '@/lib/admin/types'

interface AdminSystemSnapshotProps {
  items: AdminSystemSnapshotItem[]
}

const STATUS_STYLES: Record<AdminSystemSnapshotItem['status'], { dot: string; label: string }> = {
  healthy: { dot: 'bg-admin-success', label: 'Healthy' },
  degraded: { dot: 'bg-admin-warning', label: 'Degraded' },
  down: { dot: 'bg-admin-danger', label: 'Down' },
}

export function AdminSystemSnapshot({ items }: AdminSystemSnapshotProps) {
  return (
    <div className="p-6 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-admin-border pb-4">
        <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider flex items-center gap-2">
          <Server className="w-4 h-4 text-admin-accent" />
          System Snapshot
        </h2>
        <span className="text-[11px] font-mono text-admin-fg-muted">
          {items[0]?.lastChecked ? `Checked ${new Date(items[0].lastChecked).toLocaleTimeString()}` : ''}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const styles = STATUS_STYLES[item.status]
          return (
            <div
              key={item.id}
              className="p-3 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', styles.dot)} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-admin-fg">{item.label}</p>
                  <p className="text-[11px] text-admin-fg-muted truncate">{item.summary}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-wide text-admin-fg-muted">
                  {styles.label}
                </span>
                <Link href={item.href} className="text-[11px] font-semibold text-admin-accent hover:underline">
                  View
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}