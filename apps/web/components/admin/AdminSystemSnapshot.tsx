'use client'

import React from 'react'
import Link from 'next/link'
import { Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminSection } from './AdminSection'
import { useIsMounted } from '@/lib/admin/use-is-mounted'
import type { AdminSystemSnapshotItem } from '@/lib/admin/types'

interface AdminSystemSnapshotProps {
  items: AdminSystemSnapshotItem[]
}

const STATUS_STYLES: Record<AdminSystemSnapshotItem['status'], { dot: string; label: string }> = {
  healthy: { dot: 'bg-admin-success', label: 'Healthy' },
  degraded: { dot: 'bg-admin-warning', label: 'Degraded' },
  down: { dot: 'bg-admin-danger', label: 'Down' },
  // No telemetry source wired up — neutral, not a false "healthy".
  unknown: { dot: 'bg-admin-neutral', label: 'No telemetry' },
}

export function AdminSystemSnapshot({ items }: AdminSystemSnapshotProps) {
  const mounted = useIsMounted()

  const metaText = mounted && items[0]?.lastChecked
    ? `Checked ${new Date(items[0].lastChecked).toLocaleTimeString()}`
    : 'Live telemetry'

  return (
    <AdminSection
      title="System Snapshot"
      icon={Server}
      meta={metaText}
    >
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
    </AdminSection>
  )
}