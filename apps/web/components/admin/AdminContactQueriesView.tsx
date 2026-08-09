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
          <p className="font-bold text-white text-xs">{msg.name}</p>
          <a href={`mailto:${msg.email}`} className="text-[11px] text-blue-400 font-mono hover:underline">
            {msg.email}
          </a>
          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
            {msg.user_id ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <UserCheck className="w-3 h-3" /> Authenticated
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-400">
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
          <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-mono text-[10px] border border-slate-700 uppercase tracking-wider">
            {msg.category}
          </span>
          <p className="text-xs font-semibold text-slate-200 truncate">{msg.subject}</p>
        </div>
      ),
    },
    {
      header: 'Message Preview',
      cell: (msg) => (
        <div className="max-w-md">
          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed font-sans">
            {msg.message}
          </p>
          <button
            type="button"
            onClick={() => {
              setViewingMessage(msg)
              setAdminNotesText(msg.admin_notes || '')
            }}
            className="text-[11px] font-bold text-amber-400 hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer"
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
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
            {msg.source === 'inbound_email' ? 'Direct Email' : 'Web Form'}
          </span>
          <p className="text-[10px] text-slate-400 font-mono">
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
                className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
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
                className="px-2.5 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] font-bold border border-blue-500/20 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
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
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
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
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
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
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
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
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 relative text-slate-200">
            <button
              type="button"
              onClick={() => setViewingMessage(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-serif">{viewingMessage.subject}</h3>
                <p className="text-xs text-slate-400">
                  From: <strong>{viewingMessage.name}</strong> ({viewingMessage.email}) • {new Date(viewingMessage.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400">Topic Category:</span>{' '}
                <span className="font-bold text-amber-400 uppercase">{viewingMessage.category}</span>
              </div>
              <div>
                <span className="text-slate-400">Submitter Type:</span>{' '}
                <span className="font-bold text-slate-200">
                  {viewingMessage.user_id ? `Authenticated (${viewingMessage.user_id})` : 'Anonymous Visitor'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Submission Source:</span>{' '}
                <span className="font-bold text-slate-200">{viewingMessage.source}</span>
              </div>
              <div>
                <span className="text-slate-400">Current Status:</span>{' '}
                <span className="font-bold text-emerald-400 uppercase">{viewingMessage.status}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white uppercase tracking-wider">Message Content</label>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs leading-relaxed text-slate-200 font-sans whitespace-pre-wrap">
                {viewingMessage.message}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label htmlFor="admin-notes" className="text-xs font-bold text-white uppercase tracking-wider">
                Admin Operational Notes
              </label>
              <textarea
                id="admin-notes"
                rows={3}
                value={adminNotesText}
                onChange={(e) => setAdminNotesText(e.target.value)}
                placeholder="Add private operational notes or email response status..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(viewingMessage.id, 'replied', adminNotesText)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Save & Mark Replied
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(viewingMessage.id, 'archived', adminNotesText)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
              </div>

              <button
                type="button"
                onClick={() => setViewingMessage(null)}
                className="px-4 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
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
