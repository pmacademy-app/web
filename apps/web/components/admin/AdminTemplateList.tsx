'use client'

import React, { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FileCode, Eye, Settings2, Send } from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminSection } from './AdminSection'
import { AdminSendTestEmailModal } from './AdminSendTestEmailModal'
import { AdminProductionSendModal } from './AdminProductionSendModal'
import { cn } from '@/lib/utils'
import type { AdminTemplateListItem } from '@/lib/admin/communications-service'

interface AdminTemplateListProps {
  templates: AdminTemplateListItem[]
  category: string
  search: string
}

const CATEGORY_TABS = ['all', 'Transactional', 'Scheduled', 'System']

export function AdminTemplateList({ templates, category, search }: AdminTemplateListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [testTarget, setTestTarget] = React.useState<AdminTemplateListItem | null>(null)
  const [productionOpen, setProductionOpen] = React.useState(false)

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
      cell: (tpl) =>
        tpl.isDeferred ? (
          <AdminStatusBadge status="archived" label="Deferred" />
        ) : tpl.isCritical ? (
          <AdminStatusBadge status="healthy" label="Always On" />
        ) : (
          <AdminStatusBadge status="published" label="Active" />
        ),
    },
    {
      header: 'Subject',
      cell: (tpl) => <span className="text-[11px] text-admin-fg-muted max-w-xs block truncate">{tpl.subjectLine}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <AdminSection
        title="Email Templates"
        icon={FileCode}
        meta={`${templates.length} templates`}
        actions={
          <button
            type="button"
            onClick={() => setProductionOpen(true)}
            className="px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3 h-3 text-admin-accent" />
            Send Production Email
          </button>
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
          rowActions={(tpl) => (
            <div className="flex items-center justify-end gap-1.5">
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
                Send Test
              </button>
            </div>
          )}
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
    </div>
  )
}