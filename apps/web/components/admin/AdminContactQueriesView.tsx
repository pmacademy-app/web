'use client'

import React, { useState } from 'react'
import { Mail, CheckCircle, Clock, Archive, UserCheck, UserX, FileText, Check, X, Loader2 } from 'lucide-react'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'

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

interface AdminContactQueriesViewProps {
  initialMessages: ContactMessageItem[]
}

export function AdminContactQueriesView({ initialMessages }: AdminContactQueriesViewProps) {
  const [messages, setMessages] = useState<ContactMessageItem[]>(initialMessages)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [viewingMessage, setViewingMessage] = useState<ContactMessageItem | null>(null)
  const [adminNotesText, setAdminNotesText] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

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
          prev.map((msg) => {
            if (msg.id !== messageId) return msg
            return {
              ...msg,
              status: newStatus as ContactMessageItem['status'],
              admin_notes: notes ?? adminNotesText,
            }
          })
        )
        if (viewingMessage && viewingMessage.id === messageId) {
          setViewingMessage((prev) => (prev ? { ...prev, status: newStatus as ContactMessageItem['status'], admin_notes: notes ?? adminNotesText } : null))
        }
      } else {
        setErrorMsg(data.error || 'Failed to update contact message status.')
      }
    } catch {
      setErrorMsg('An unexpected network error occurred.')
    } finally {
      setLoadingId(null)
    }
  }

  const filteredMessages = messages.filter((msg) => {
    if (statusFilter === 'all') return true
    return msg.status === statusFilter
  })

  const columns: Column<ContactMessageItem>[] = [
    {
      header: 'Submitter',
      cell: (msg) => (
        <div>
          <p className="font-bold text-admin-fg text-xs">{msg.name}</p>
          <a href={`mailto:${msg.email}`} className="text-[11px] text-admin-info font-mono hover:underline">
            {msg.email}
          </a>
          <div className="flex items-center gap-1 mt-1 text-[10px] text-admin-fg-muted">
            {msg.user_id ? (
              <span className="flex items-center gap-1 text-admin-success font-medium">
                <UserCheck className="w-3 h-3" /> Authenticated
              </span>
            ) : (
              <span className="flex items-center gap-1 text-admin-fg-muted">
                <UserX className="w-3 h-3" /> Anonymous Visitor
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Topic & Subject',
      cell: (msg) => (
        <div className="max-w-xs space-y-1">
          <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-accent font-mono text-[10px] border border-admin-border uppercase tracking-wider">
            {msg.category}
          </span>
          <p className="text-xs font-semibold text-admin-fg truncate">{msg.subject}</p>
        </div>
      ),
    },
    {
      header: 'Message Preview',
      cell: (msg) => (
        <div className="max-w-md">
          <p className="text-xs text-admin-fg-muted line-clamp-2 leading-relaxed font-sans">
            {msg.message}
          </p>
          <button
            type="button"
            onClick={() => {
              setViewingMessage(msg)
              setAdminNotesText(msg.admin_notes || '')
            }}
            className="text-[11px] font-bold text-admin-accent hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer"
          >
            <FileText className="w-3 h-3" /> Read Full Message
          </button>
        </div>
      ),
    },
    {
      header: 'Source & Date',
      cell: (msg) => (
        <div className="space-y-1">
          <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border">
            {msg.source === 'inbound_email' ? 'Direct Email' : 'Web Form'}
          </span>
          <p className="text-[10px] text-admin-fg-muted font-mono">
            {new Date(msg.created_at).toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (msg) => (
        <AdminStatusBadge
          status={
            msg.status === 'replied'
              ? 'healthy'
              : msg.status === 'in_progress'
              ? 'published'
              : msg.status === 'archived'
              ? 'archived'
              : 'pending'
          }
          label={msg.status.toUpperCase()}
        />
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (msg) => {
        const isLoading = loadingId === msg.id
        return (
          <div className="flex items-center justify-end gap-1.5">
            {msg.status !== 'replied' && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(msg.id, 'replied')}
                disabled={isLoading}
                title="Mark as Replied"
                className="px-2.5 py-1 rounded bg-admin-success-soft hover:bg-admin-success/20 text-admin-success text-[10px] font-bold border border-admin-success/25 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                <span>Replied</span>
              </button>
            )}

            {msg.status === 'new' && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(msg.id, 'in_progress')}
                disabled={isLoading}
                title="Mark In Progress"
                className="px-2.5 py-1 rounded bg-admin-info-soft hover:bg-admin-info/20 text-admin-info text-[10px] font-bold border border-admin-info/25 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Clock className="w-3 h-3" />
                <span>In Progress</span>
              </button>
            )}

            {msg.status !== 'archived' && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(msg.id, 'archived')}
                disabled={isLoading}
                title="Archive Query"
                className="p-1.5 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg border border-admin-border transition-colors cursor-pointer disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3 rounded-xl bg-admin-danger-soft border border-admin-danger/25 text-admin-danger text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        {['all', 'new', 'in_progress', 'replied', 'archived'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
              statusFilter === f
                ? 'bg-admin-accent-soft text-admin-accent border border-admin-accent/25'
                : 'bg-admin-surface text-admin-fg-muted hover:text-admin-fg border border-admin-border'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      <AdminDataTable
        columns={columns}
        data={filteredMessages}
        keyExtractor={(msg) => msg.id}
        emptyTitle="No contact messages found"
        emptyDescription="Submissions from the public Contact Us form will appear here for operational handling."
      />

      {/* Full Message Inspector Modal */}
      {viewingMessage && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-admin-surface border border-admin-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 relative text-admin-fg">
            <button
              type="button"
              onClick={() => setViewingMessage(null)}
              className="absolute top-4 right-4 p-1.5 text-admin-fg-muted hover:text-admin-fg rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-admin-border pb-4">
              <div className="w-10 h-10 rounded-xl bg-admin-accent-soft text-admin-accent flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-admin-fg font-serif">{viewingMessage.subject}</h3>
                <p className="text-xs text-admin-fg-muted">
                  From: <strong>{viewingMessage.name}</strong> ({viewingMessage.email}) • {new Date(viewingMessage.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-admin-bg p-3 rounded-xl border border-admin-border">
              <div>
                <span className="text-admin-fg-muted">Topic Category:</span>{' '}
                <span className="font-bold text-admin-accent uppercase">{viewingMessage.category}</span>
              </div>
              <div>
                <span className="text-admin-fg-muted">Submitter Type:</span>{' '}
                <span className="font-bold text-admin-fg">
                  {viewingMessage.user_id ? `Authenticated (${viewingMessage.user_id})` : 'Anonymous Visitor'}
                </span>
              </div>
              <div>
                <span className="text-admin-fg-muted">Submission Source:</span>{' '}
                <span className="font-bold text-admin-fg">{viewingMessage.source}</span>
              </div>
              <div>
                <span className="text-admin-fg-muted">Current Status:</span>{' '}
                <span className="font-bold text-admin-success uppercase">{viewingMessage.status}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-admin-fg uppercase tracking-wider">Message Content</label>
              <div className="p-4 rounded-xl bg-admin-bg border border-admin-border text-xs leading-relaxed text-admin-fg font-sans whitespace-pre-wrap">
                {viewingMessage.message}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-admin-border">
              <label htmlFor="admin-notes" className="text-xs font-bold text-admin-fg uppercase tracking-wider">
                Admin Operational Notes
              </label>
              <textarea
                id="admin-notes"
                rows={3}
                value={adminNotesText}
                onChange={(e) => setAdminNotesText(e.target.value)}
                placeholder="Add private operational notes or email response status..."
                className="w-full p-3 rounded-xl bg-admin-bg border border-admin-border text-xs text-admin-fg focus:outline-none focus:border-admin-accent"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(viewingMessage.id, 'replied', adminNotesText)}
                  className="px-3 py-1.5 rounded-xl bg-admin-success hover:bg-admin-success/90 text-admin-fg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Save & Mark Replied
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(viewingMessage.id, 'archived', adminNotesText)}
                  className="px-3 py-1.5 rounded-xl bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
              </div>

              <button
                type="button"
                onClick={() => setViewingMessage(null)}
                className="px-4 py-1.5 rounded-xl border border-admin-border text-xs font-semibold text-admin-fg-muted hover:text-admin-fg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
