'use client'

import React, { useCallback, useState } from 'react'
import { Search, Loader2, UserCheck, UserX, AlertTriangle } from 'lucide-react'
import { AdminModal } from './AdminModal'
import { SendProductionEmailModal, type TargetUser } from './SendProductionEmailModal'

interface AdminProductionSendModalProps {
  open: boolean
  onClose: () => void
}

interface UserSearchResult {
  id: string
  email: string
  fullName: string
  isVerified: boolean
  emailConfirmedAt: string | null
}

/**
 * Production-send entry point for the Communications workspace (spec §6.4).
 *
 * The admin searches for a recipient learner, then the existing
 * `SendProductionEmailModal` handles template selection + confirmation.
 * Test sends (spec §6.5) remain a separate flow per RULES.md #5.
 */
export function AdminProductionSendModal({ open, onClose }: AdminProductionSendModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [target, setTarget] = useState<TargetUser | null>(null)

  const runSearch = useCallback(async (search: string) => {
    const q = search.trim()
    if (!q) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q)}&limit=10`)
      const data = await res.json()
      if (res.ok && data.success) {
        setResults((data.users || []) as UserSearchResult[])
      } else {
        setErrorMsg(data.error || 'Failed to search users.')
      }
    } catch {
      setErrorMsg('Network error while searching users.')
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }, [])

  const handleSelect = (user: UserSearchResult) => {
    setTarget({
      id: user.id,
      name: user.fullName || user.email.split('@')[0],
      email: user.email,
      email_confirmed_at: user.emailConfirmedAt || undefined,
    })
  }

  return (
    <>
      <AdminModal
        open={open && !target}
        onClose={onClose}
        title="Send Production Email"
        description="Find a learner to send a real email to. Test sends remain a separate flow."
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-admin-fg-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void runSearch(query)
                }
              }}
              placeholder="Search by name or email…"
              aria-label="Search learners"
              className="h-9 w-full rounded-lg border border-admin-border bg-admin-surface pl-9 pr-3 text-sm text-admin-fg placeholder:text-admin-fg-subtle transition-colors outline-none focus-visible:border-admin-accent/60 focus-visible:ring-2 focus-visible:ring-admin-accent/30"
            />
          </div>

          <button
            type="button"
            onClick={() => void runSearch(query)}
            disabled={loading || !query.trim()}
            className="px-3 py-1.5 rounded-lg bg-admin-accent hover:bg-admin-accent/90 text-admin-accent-fg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Search
          </button>

          {errorMsg && (
            <div role="alert" className="p-3 rounded-xl bg-admin-danger-soft border border-admin-danger/25 text-admin-danger text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {searched && !loading && results.length === 0 && (
            <p className="text-xs text-admin-fg-muted">No learners matched “{query.trim()}”.</p>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-admin-border rounded-xl border border-admin-border bg-admin-surface overflow-hidden max-h-72 overflow-y-auto">
              {results.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(user)}
                    className="w-full text-left px-4 py-3 hover:bg-admin-bg/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-admin-fg truncate">{user.fullName || user.email}</span>
                      {user.isVerified ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-admin-success shrink-0">
                          <UserCheck className="w-3 h-3" /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-admin-warning shrink-0">
                          <UserX className="w-3 h-3" /> Unverified
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-admin-fg-muted truncate mt-0.5">{user.email}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminModal>

      {target && (
        <SendProductionEmailModal
          isOpen={true}
          onClose={() => {
            setTarget(null)
            onClose()
          }}
          targetUser={target}
        />
      )}
    </>
  )
}