'use client'

import React, { useState } from 'react'
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit2,
  Calendar,
  Send,
  Clock,
} from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminSection } from './AdminSection'
import { AdminAnnouncementEditorModal } from './AdminAnnouncementEditorModal'
import { useAdminToast } from './admin-toast'
import type { SystemAnnouncementItem } from '@/lib/admin/announcements-service'

interface AdminAnnouncementsViewProps {
  initialAnnouncements: SystemAnnouncementItem[]
}

const STATUS_TABS = ['all', 'active', 'scheduled', 'draft', 'paused', 'expired']

export function AdminAnnouncementsView({ initialAnnouncements }: AdminAnnouncementsViewProps) {
  const { toast } = useAdminToast()
  const [announcements, setAnnouncements] = useState<SystemAnnouncementItem[]>(initialAnnouncements)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SystemAnnouncementItem | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const reloadData = async () => {
    try {
      const res = await fetch('/api/admin/announcements')
      const json = await res.json()
      if (json.success && Array.isArray(json.announcements)) {
        setAnnouncements(json.announcements)
      }
    } catch (err) {
      console.error('Failed to reload announcements:', err)
    }
  }

  const handlePublish = async (item: SystemAnnouncementItem) => {
    setActionLoading(item.id)
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}/publish`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to publish')
      toast('Announcement published successfully', 'success')
      await reloadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Publish failed', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleTogglePause = async (item: SystemAnnouncementItem) => {
    const nextPaused = item.status !== 'paused'
    setActionLoading(item.id)
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextPaused }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update status')
      toast(`Announcement ${nextPaused ? 'paused' : 'resumed'} successfully`, 'success')
      await reloadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (item: SystemAnnouncementItem) => {
    if (!confirm(`Are you sure you want to delete "${item.title}"?`)) return

    setActionLoading(item.id)
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete')
      toast('Announcement deleted successfully', 'success')
      await reloadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = announcements.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        (a.targetCohortId && a.targetCohortId.toLowerCase().includes(q))
      )
    }
    return true
  })

  const columns: Column<SystemAnnouncementItem>[] = [
    {
      header: 'Announcement',
      cell: (item) => (
        <div className="min-w-0 max-w-xs sm:max-w-md">
          <p className="text-xs font-bold text-admin-fg truncate">{item.title}</p>
          <p className="text-[11px] text-admin-fg-muted line-clamp-1">{item.content}</p>
        </div>
      ),
    },
    {
      header: 'Type',
      cell: (item) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
            item.type === 'warning'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              : item.type === 'critical'
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              : item.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
          }`}
        >
          {item.type}
        </span>
      ),
    },
    {
      header: 'Audience',
      cell: (item) => (
        <span className="text-[11px] font-mono text-admin-fg-muted uppercase">
          {item.targetAudience === 'cohort'
            ? `Cohort (${item.targetCohortId || 'unspecified'})`
            : item.targetAudience}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (item) => {
        if (item.status === 'active') return <AdminStatusBadge status="published" label="Active" />
        if (item.status === 'scheduled') return <AdminStatusBadge status="healthy" label="Scheduled" />
        if (item.status === 'paused') return <AdminStatusBadge status="archived" label="Paused" />
        if (item.status === 'expired') return <AdminStatusBadge status="error" label="Expired" />
        return <AdminStatusBadge status="draft" label="Draft" />
      },
    },
    {
      header: 'Schedule / Expiry',
      cell: (item) => (
        <div className="text-[11px] text-admin-fg-muted space-y-0.5">
          {item.scheduledAt && (
            <p className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-admin-accent" />
              {new Date(item.scheduledAt).toLocaleDateString()}
            </p>
          )}
          {item.expiresAt ? (
            <p className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-admin-fg-subtle" />
              Exp: {new Date(item.expiresAt).toLocaleDateString()}
            </p>
          ) : (
            <span className="text-admin-fg-subtle text-[10px]">No expiry</span>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <AdminSection
        title="System Announcements & Sitewide Banners"
        icon={Megaphone}
        meta={`${announcements.length} total`}
        actions={
          <button
            type="button"
            onClick={() => {
              setSelectedItem(null)
              setEditorOpen(true)
            }}
            className="px-3 py-1.5 rounded-lg bg-admin-accent text-admin-accent-contrast hover:bg-admin-accent/90 text-xs font-bold transition-all shadow-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Announcement
          </button>
        }
        bodyClassName="space-y-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-admin-bg/60 border border-admin-border overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer capitalize ${
                  statusFilter === tab
                    ? 'bg-admin-accent text-admin-accent-contrast'
                    : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <AdminSearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search announcements…"
            className="w-full sm:w-64"
          />
        </div>

        <AdminDataTable
          columns={columns}
          data={filtered}
          keyExtractor={(item) => item.id}
          rowActions={(item) => {
            const isLoading = actionLoading === item.id

            return (
              <div className="flex items-center justify-end gap-1.5">
                {item.status === 'draft' && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handlePublish(item)}
                    title="Publish immediately"
                    className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-accent hover:text-admin-accent border border-admin-border transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
                {(item.status === 'active' || item.status === 'paused') && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleTogglePause(item)}
                    title={item.status === 'active' ? 'Pause announcement' : 'Resume announcement'}
                    className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg border border-admin-border transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {item.status === 'active' ? (
                      <Pause className="w-3.5 h-3.5 text-admin-warning" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-admin-success" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setSelectedItem(item)
                    setEditorOpen(true)
                  }}
                  title="Edit announcement"
                  className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg border border-admin-border transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleDelete(item)}
                  title="Delete announcement"
                  className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-danger hover:text-admin-danger/80 border border-admin-border transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          }}
          emptyTitle="No announcements found"
          emptyDescription={
            search || statusFilter !== 'all'
              ? 'Try adjusting your filters or search term.'
              : 'Create your first system announcement or banner above.'
          }
        />
      </AdminSection>

      <AdminAnnouncementEditorModal
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false)
          setSelectedItem(null)
        }}
        announcement={selectedItem}
        onSaved={reloadData}
      />
    </div>
  )
}
