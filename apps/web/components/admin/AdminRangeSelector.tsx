'use client'

import React, { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminDateRangeKey } from '@/lib/admin/types'

const PRESETS: Array<{ key: AdminDateRangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'custom', label: 'Custom' },
]

export function AdminRangeSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const active = (searchParams.get('range') as AdminDateRangeKey) || '30d'
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const createQueryString = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key)
        else params.set(key, value)
      }
      return params.toString()
    },
    [searchParams]
  )

  const applyRange = useCallback(
    (key: AdminDateRangeKey, nextFrom?: string | null, nextTo?: string | null) => {
      const updates: Record<string, string | null> = { range: key }
      if (key === 'custom') {
        updates.from = nextFrom ?? from ?? ''
        updates.to = nextTo ?? to ?? ''
      } else {
        updates.from = null
        updates.to = null
      }
      router.push(`${pathname}?${createQueryString(updates)}`)
    },
    [router, pathname, createQueryString, from, to]
  )

  const isCustom = active === 'custom'

  const customFrom = useMemo(() => from || '', [from])
  const customTo = useMemo(() => to || '', [to])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 p-1 rounded-lg bg-admin-surface border border-admin-border">
        <CalendarRange className="w-3.5 h-3.5 text-admin-fg-muted ml-1.5" />
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyRange(preset.key)}
            aria-pressed={active === preset.key}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50',
              active === preset.key
                ? 'bg-admin-accent text-admin-accent-contrast'
                : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {isCustom && (
        <div className="flex items-center gap-2 p-1 px-2 rounded-lg bg-admin-surface border border-admin-border">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => applyRange('custom', e.target.value, customTo)}
            aria-label="Custom range start"
            className="bg-transparent text-xs text-admin-fg font-medium outline-none [color-scheme:dark] rounded focus-visible:ring-1 focus-visible:ring-admin-accent/50"
          />
          <span className="text-admin-fg-muted text-xs">→</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => applyRange('custom', customFrom, e.target.value)}
            aria-label="Custom range end"
            className="bg-transparent text-xs text-admin-fg font-medium outline-none [color-scheme:dark] rounded focus-visible:ring-1 focus-visible:ring-admin-accent/50"
          />
        </div>
      )}
    </div>
  )
}