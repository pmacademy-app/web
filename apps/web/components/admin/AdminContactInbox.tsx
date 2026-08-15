'use client'

import React, { useMemo, useState } from 'react'
import {
  Mail,
  Clock,
  Archive,
  UserCheck,
  UserX,
  Check,
  Loader2,
  ArrowLeft,
  Reply,
  Search,
  Filter,
} from 'lucide-react'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminPagination } from './AdminPagination'
import { useAdminToast } from './admin-toast'
import { cn } from '@/lib/utils'

export interface ContactMessageItem {
  id: string
  user_id: string | null
  name: string
  email: string
  subject: string
  category: string
  message: string
  status: 'new' | 'in_progress' | 'replied' | 'archived'
  source: 'web_form' | 'inbound_email'
  admin_notes: string | null
  created_at: string
}

interface AdminContactInboxProps {
  initialMessages: ContactMessageItem[]
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'replied', label: 'Replied' },
  { key: 'archived', label: 'Archived' },
]

const READ_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'read', label: 'Read' },
]

const DATE_FILTERS = [
  { key: 'all', label: 'Any date' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
]

const PAGE_SIZE = 25

function statusBadge(status: ContactMessageItem['status']) {
  switch (status) {
    case 'replied':
      return <AdminStatusBadge status="healthy" label="Replied" />
    case 'in_progress':
      return <AdminStatusBadge status="published" label="In Progress" />
    case 'archived':
      return <AdminStatusBadge status="archived" label="Archived" />
    default:
      return <AdminStatusBadge status="pending" label="New" />
  }
}

function matchesDateFilter(createdAt: string, filter: string): boolean {
  if (filter === 'all') return true
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  if (filter === 'today') {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return created >= startOfToday.getTime()
  }
  const days = filter === '7d' ? 7 : 30
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return created >= cutoff
}

export function AdminContactInbox({ initialMessages }: AdminContactInboxProps) {
  const { toast } = useAdminToast()
  const [messages, setMessages] = useState<ContactMessageItem[]>(initialMessages)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [topicFilter, setTopicFilter] = useState<string>('all')
  const [readFilter, setReadFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [adminNotesText, setAdminNotesText] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const selected = messages.find((m) => m.id === selectedId) || null

  // Topic options derived from the loaded messages (schema default is 'general').
  const topics = useMemo(() => {
    const set = new Set<string>()
    for (const msg of messages) if (msg.category) set.add(msg.category)
    return Array.from(set).sort()
  }, [messages])

  const filtered = useMemo(() => {
    return messages.filter((msg) => {
      if (statusFilter !== 'all' && msg.status !== statusFilter) return false
      if (topicFilter !== 'all' && msg.category !== topicFilter) return false
      if (readFilter === 'unread' && msg.status !== 'new') return false
      if (readFilter === 'read' && msg.status === 'new') return false
      if (!matchesDateFilter(msg.created_at, dateFilter)) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const haystack = `${msg.name} ${msg.email} ${msg.subject} ${msg.category} ${msg.message}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [messages, statusFilter, topicFilter, readFilter, dateFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const resetPage = () => setPage(1)

  const handleUpdateStatus = async (messageId: string, newStatus: string, notes?: string) => {
    setLoadingId(messageId)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/admin/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          status: newStatus,
          adminNotes: notes ?? adminNotesText,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, status: newStatus as ContactMessageItem['status'], admin_notes: notes ?? adminNotesText }
              : msg
          )
        )
        toast(`Message marked as ${newStatus.replace('_', ' ')}.`, 'success')
      } else {
        setErrorMsg(data.error || 'Failed to update contact message status.')
      }
    } catch {
      setErrorMsg('An unexpected network error occurred.')
    } finally {
      setLoadingId(null)
    }
  }

  const openMessage = (msg: ContactMessageItem) => {
    setSelectedId(msg.id)
    setAdminNotesText(msg.admin_notes || '')
  }

  const isLoading = (id: string) => loadingId === id

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div role="alert" className="p-3 rounded-xl bg-admin-danger-soft border border-admin-danger/25 text-admin-danger text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">
        {/* ── List pane ── */}
        <div className={cn('space-y-3', selected && 'hidden lg:block')}>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-admin-bg/60 border border-admin-border overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key)
                  resetPage()
                }}
                aria-pressed={statusFilter === tab.key}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
                  statusFilter === tab.key
                    ? 'bg-admin-accent text-admin-accent-contrast'
                    : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-admin-fg-subtle" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetPage()
              }}
              placeholder="Search messages…"
              aria-label="Search contact messages"
              className="h-9 w-full rounded-lg border border-admin-border bg-admin-surface pl-9 pr-3 text-sm text-admin-fg placeholder:text-admin-fg-subtle transition-colors outline-none focus-visible:border-admin-accent/60 focus-visible:ring-2 focus-visible:ring-admin-accent/30"
            />
          </div>

          {/* Topic / read / date filters */}
          <div className="p-3 rounded-xl bg-admin-bg/60 border border-admin-border space-y-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-admin-fg-muted uppercase tracking-wider">
              <Filter className="w-3 h-3" /> Filters
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="block">
                <span className="sr-only">Topic</span>
                <select
                  value={topicFilter}
                  onChange={(e) => {
                    setTopicFilter(e.target.value)
                    resetPage()
                  }}
                  className="w-full h-8 rounded-lg border border-admin-border bg-admin-surface px-2 text-xs text-admin-fg focus:outline-none focus:ring-2 focus:ring-admin-accent"
                >
                  <option value="all">All topics</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Read status</span>
                <select
                  value={readFilter}
                  onChange={(e) => {
                    setReadFilter(e.target.value)
                    resetPage()
                  }}
                  className="w-full h-8 rounded-lg border border-admin-border bg-admin-surface px-2 text-xs text-admin-fg focus:outline-none focus:ring-2 focus:ring-admin-accent"
                >
                  {READ_FILTERS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Date</span>
                <select
                  value={dateFilter}
                  onChange={(e) => {
                    setDateFilter(e.target.value)
                    resetPage()
                  }}
                  className="w-full h-8 rounded-lg border border-admin-border bg-admin-surface px-2 text-xs text-admin-fg focus:outline-none focus:ring-2 focus:ring-admin-accent"
                >
                  {DATE_FILTERS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-xl bg-admin-surface border border-admin-border shadow-xl overflow-hidden">
            {paged.length === 0 ? (
              <AdminEmptyState
                icon={Mail}
                title="No messages found"
                description="Submissions from the public Contact Us form will appear here."
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-admin-border max-h-[560px] overflow-y-auto">
                {paged.map((msg) => (
                  <li key={msg.id}>
                    <button
                      type="button"
                      onClick={() => openMessage(msg)}
                      aria-current={selectedId === msg.id ? 'true' : undefined}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors cursor-pointer',
                        selectedId === msg.id
                          ? 'bg-admin-accent-soft/60'
                          : 'hover:bg-admin-bg/40'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          {msg.status === 'new' && (
                            <span className="w-2 h-2 rounded-full bg-admin-accent shrink-0" aria-label="Unread" />
                          )}
                          <span className="text-xs font-bold text-admin-fg truncate">{msg.subject}</span>
                        </span>
                        <span className="text-[10px] font-mono text-admin-fg-subtle shrink-0">
                          {new Date(msg.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-admin-fg-muted truncate mt-0.5">
                        {msg.name} · {msg.email}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[9px] border border-admin-border uppercase tracking-wider">
                          {msg.category}
                        </span>
                        {statusBadge(msg.status)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {totalPages > 1 && (
            <AdminPagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={PAGE_SIZE}
              totalItems={filtered.length}
            />
          )}
        </div>

        {/* ── Detail pane ── */}
        <div className={cn('space-y-4', !selected && 'hidden lg:block')}>
          {!selected ? (
            <div className="rounded-xl bg-admin-surface border border-admin-border shadow-xl p-8">
              <AdminEmptyState
                icon={Mail}
                title="Select a message"
                description="Choose a message from the inbox to view its full content and take action."
                className="py-14"
              />
            </div>
          ) : (
            <div className="rounded-xl bg-admin-surface border border-admin-border shadow-xl overflow-hidden">
              {/* Detail header */}
              <div className="p-5 border-b border-admin-border space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-admin-accent-soft text-admin-accent flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-admin-fg truncate">{selected.subject}</h3>
                      <p className="text-xs text-admin-fg-muted truncate">
                        From: <strong>{selected.name}</strong> ({selected.email})
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="lg:hidden p-1.5 text-admin-fg-muted hover:text-admin-fg rounded-lg transition-colors cursor-pointer"
                    aria-label="Back to message list"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge(selected.status)}
                  <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border uppercase tracking-wider">
                    {selected.category}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border">
                    {selected.source === 'inbound_email' ? 'Direct Email' : 'Web Form'}
                  </span>
                  <span className="text-[10px] font-mono text-admin-fg-subtle">
                    {new Date(selected.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px]">
                  {selected.user_id ? (
                    <span className="flex items-center gap-1 text-admin-success font-medium">
                      <UserCheck className="w-3 h-3" /> Authenticated ({selected.user_id})
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-admin-fg-muted">
                      <UserX className="w-3 h-3" /> Anonymous Visitor
                    </span>
                  )}
                </div>
              </div>

              {/* Message body */}
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-admin-fg uppercase tracking-wider">Message Content</p>
                  <div className="p-4 rounded-xl bg-admin-bg border border-admin-border text-xs leading-relaxed text-admin-fg whitespace-pre-wrap">
                    {selected.message}
                  </div>
                </div>

                {/* Admin notes */}
                <div className="space-y-2">
                  <label htmlFor="admin-notes" className="block text-xs font-bold text-admin-fg uppercase tracking-wider">
                    Admin Operational Notes
                  </label>
                  <textarea
                    id="admin-notes"
                    rows={3}
                    value={adminNotesText}
                    onChange={(e) => setAdminNotesText(e.target.value)}
                    placeholder="Add private operational notes or email response status…"
                    className="w-full p-3 rounded-xl bg-admin-bg border border-admin-border text-xs text-admin-fg focus:outline-none focus:border-admin-accent"
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-admin-border">
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.status !== 'replied' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(selected.id, 'replied', adminNotesText)}
                        disabled={isLoading(selected.id)}
                        className="px-3 py-1.5 rounded-xl bg-admin-success hover:bg-admin-success/90 text-admin-fg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isLoading(selected.id) ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Save & Mark Replied
                      </button>
                    )}
                    {selected.status === 'new' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(selected.id, 'in_progress', adminNotesText)}
                        disabled={isLoading(selected.id)}
                        className="px-3 py-1.5 rounded-xl bg-admin-info-soft hover:bg-admin-info/20 text-admin-info text-xs font-bold border border-admin-info/25 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Clock className="w-3.5 h-3.5" /> In Progress
                      </button>
                    )}
                    {selected.status !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(selected.id, 'archived', adminNotesText)}
                        disabled={isLoading(selected.id)}
                        className="px-3 py-1.5 rounded-xl bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>
                    )}
                  </div>

                  <a
                    href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`}
                    className="px-3 py-1.5 rounded-xl border border-admin-border text-xs font-semibold text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Reply className="w-3.5 h-3.5" /> Reply by Email
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}