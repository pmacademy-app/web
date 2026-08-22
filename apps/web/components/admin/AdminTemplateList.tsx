'use client'

import React, { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FileCode, Eye, Settings2, Send, Plus, Pause, Play, Radio } from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminSection } from './AdminSection'
import { AdminSendTestEmailModal } from './AdminSendTestEmailModal'
import { AdminProductionSendModal } from './AdminProductionSendModal'
import { AdminCreateTemplateModal } from './AdminCreateTemplateModal'
import { AdminBroadcastModal } from './AdminBroadcastModal'
import { useAdminToast } from './admin-toast'
import { cn } from '@/lib/utils'
import type { AdminTemplateListItem } from '@/lib/admin/communications-service'

interface AdminTemplateListProps {
  templates: AdminTemplateListItem[]
  category: string
  search: string
}

const CATEGORY_TABS = ['all', 'Transactional', 'Scheduled', 'System', 'Custom']

export function AdminTemplateList({ templates, category, search }: AdminTemplateListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useAdminToast()

  const [testTarget, setTestTarget] = useState<AdminTemplateListItem | null>(null)
  const [productionOpen, setProductionOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [pausedMap, setPausedMap] = useState<Record<string, boolean>>({})
  const [togglingKey, setTogglingKey] = useState<string | null>(null)

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

  const applyFilter = useCallback(
    (updates: Record<string, string | null>) => {
      router.push(`${pathname}?${createQueryString(updates)}`)
    },
    [router, pathname, createQueryString]
  )

  const handleCategory = (next: string) => {
    applyFilter({ category: next === 'all' ? null : next })
  }

  const handleSearch = (next: string) => {
    applyFilter({ tq: next || null })
  }

  const handleTogglePause = async (tpl: AdminTemplateListItem) => {
    if (tpl.isCritical) {
      toast('Critical authentication templates cannot be paused.', 'error')
      return
    }

    const currentPaused = Boolean(pausedMap[tpl.key])
    const targetPaused = !currentPaused
    setTogglingKey(tpl.key)

    try {
      const res = await fetch(`/api/admin/notifications/templates/${encodeURIComponent(tpl.key)}/toggle-pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: targetPaused }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to toggle pause')
      }

      setPausedMap((prev) => ({ ...prev, [tpl.key]: targetPaused }))
      toast(json.message || `Template ${targetPaused ? 'paused' : 'resumed'}.`, 'success')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error updating state', 'error')
    } finally {
      setTogglingKey(null)
    }
  }

  const columns: Column<AdminTemplateListItem>[] = [
    {
      header: 'Template',
      cell: (tpl) => (
        <div className="min-w-0">
          <p className="text-xs font-bold text-admin-fg truncate">{tpl.name}</p>
          <p className="font-mono text-[11px] text-admin-accent font-semibold">{tpl.key}</p>
        </div>
      ),
    },
    {
      header: 'Category',
      cell: (tpl) => (
        <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border uppercase tracking-wider">
          {tpl.category}
        </span>
      ),
    },
    {
      header: 'Trigger',
      cell: (tpl) => <span className="text-[11px] text-admin-fg-muted max-w-xs block truncate">{tpl.trigger}</span>,
    },
    {
      header: 'Status',
      cell: (tpl) => {
        const isPaused = Boolean(pausedMap[tpl.key])
        if (isPaused) return <AdminStatusBadge status="archived" label="Paused" />
        if (tpl.isDeferred) return <AdminStatusBadge status="archived" label="Deferred" />
        if (tpl.isCritical) return <AdminStatusBadge status="healthy" label="Always On" />
        return <AdminStatusBadge status="published" label="Active" />
      },
    },
    {
      header: 'Subject',
      cell: (tpl) => <span className="text-[11px] text-admin-fg-muted max-w-xs block truncate">{tpl.subjectLine}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <AdminSection
        title="Email & Notification Templates"
        icon={FileCode}
        meta={`${templates.length} templates`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-2.5 py-1 rounded bg-admin-accent-soft hover:bg-admin-accent/20 text-admin-accent text-[11px] font-bold border border-admin-accent/30 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              New Template
            </button>
            <button
              type="button"
              onClick={() => setBroadcastOpen(true)}
              className="px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Radio className="w-3 h-3 text-admin-accent" />
              Push Broadcast
            </button>
            <button
              type="button"
              onClick={() => setProductionOpen(true)}
              className="px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3 h-3 text-admin-accent" />
              Direct Send
            </button>
          </div>
        }
        bodyClassName="space-y-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-admin-bg/60 border border-admin-border overflow-x-auto">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleCategory(tab)}
                aria-pressed={category === tab}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
                  category === tab
                    ? 'bg-admin-accent text-admin-accent-contrast'
                    : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
                )}
              >
                {tab === 'all' ? 'All' : tab}
              </button>
            ))}
          </div>
          <AdminSearchInput
            value={search}
            onValueChange={handleSearch}
            placeholder="Search templates…"
            aria-label="Search email templates"
            className="w-full sm:w-64"
          />
        </div>

        <AdminDataTable
          columns={columns}
          data={templates}
          keyExtractor={(tpl) => tpl.key}
          rowActions={(tpl) => {
            const isPaused = Boolean(pausedMap[tpl.key])
            const isToggling = togglingKey === tpl.key

            return (
              <div className="flex items-center justify-end gap-1.5">
                {!tpl.isCritical && (
                  <button
                    type="button"
                    disabled={isToggling}
                    onClick={() => handleTogglePause(tpl)}
                    title={isPaused ? 'Resume notification' : 'Pause notification'}
                    className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg border border-admin-border transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isPaused ? <Play className="w-3.5 h-3.5 text-admin-success" /> : <Pause className="w-3.5 h-3.5 text-admin-warning" />}
                  </button>
                )}
                <Link
                  href={`/admin/communications/templates/${tpl.key}`}
                  title="Open template editor"
                  className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg border border-admin-border transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href={`/admin/communications/templates/${tpl.key}?mode=preview`}
                  title="Preview template"
                  className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg border border-admin-border transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setTestTarget(tpl)}
                  title="Send test email"
                  className="px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors cursor-pointer"
                >
                  Test
                </button>
              </div>
            )
          }}
          emptyTitle="No templates found"
          emptyDescription={
            search || category !== 'all'
              ? 'Try adjusting the search or category filter.'
              : 'Registered email templates will appear here.'
          }
        />
      </AdminSection>

      <AdminSendTestEmailModal
        open={testTarget !== null}
        onClose={() => setTestTarget(null)}
        templateKey={testTarget?.key || ''}
        templateName={testTarget?.name || ''}
      />

      <AdminProductionSendModal open={productionOpen} onClose={() => setProductionOpen(false)} />
      <AdminCreateTemplateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => router.refresh()} />
      <AdminBroadcastModal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
    </div>
  )
}