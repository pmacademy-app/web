'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LogOut,
  Menu,
  Bell,
  Search,
  X,
  User,
  BookOpen,
  Award,
  Mail,
  MessageSquare,
  ShieldAlert,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { getAdminSectionLabel } from '@/lib/admin/navigation'
import { signOutAdmin } from '@/lib/admin/session'
import type { AdminConsoleUser } from './AdminConsoleShell'
import type { AdminSearchResponse } from '@/app/api/admin/search/route'

interface AdminHeaderProps {
  onToggleMobileMenu?: () => void
  user?: AdminConsoleUser
  attention?: Record<string, number>
  /** Total actionable items across attention sources (drives the bell dot). */
  attentionTotal?: number
  /** Whether the database is reachable (drives the status chip). */
  systemOnline?: boolean
}

const TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/users': 'Users',
  '/admin/communications': 'Communications',
  '/admin/feedback': 'Moderation',
  '/admin/moderation': 'Moderation',
  '/admin/curriculum': 'Curriculum',
  '/admin/content': 'Curriculum',
  '/admin/certificates': 'Certificates',
  '/admin/achievements': 'Achievements',
  '/admin/achievements/badges': 'Badges',
  '/admin/achievements/certificates': 'Certificates',
  '/admin/system': 'System',
  '/admin/analytics': 'Analytics',
  '/admin/settings': 'Settings',
  '/admin/feature-flags': 'Feature Flags',
  '/admin/emails': 'Emails',
  '/admin/templates': 'Email Templates',
  '/admin/notifications': 'Notifications',
  '/admin/portfolios': 'Portfolios',
}

export function AdminHeader({
  onToggleMobileMenu,
  user,
  attention = {},
  attentionTotal = 0,
  systemOnline = true,
}: AdminHeaderProps = {}) {
  const router = useRouter()
  const pathname = usePathname()

  // State for popovers
  const [bellOpen, setBellOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AdminSearchResponse['results'] | null>(null)
  const [searching, setSearching] = useState(false)

  const bellRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  let title = TITLES[pathname]
  if (!title) {
    if (pathname.startsWith('/admin/users/')) {
      title = 'User Profile'
    } else if (pathname.startsWith('/admin/curriculum/')) {
      const parts = pathname.split('/').filter(Boolean)
      title = parts.length >= 4 ? 'Lesson Detail' : 'Module Detail'
    } else if (pathname.startsWith('/admin/communications/templates/')) {
      title = 'Template Editor'
    } else {
      title = 'Admin'
    }
  }
  const section = getAdminSectionLabel(pathname)

  const handleSignOut = () => signOutAdmin(router)
  const displayName = user?.name || user?.email.split('@')[0] || 'Admin'
  const hasAttention = attentionTotal > 0

  const handleOpenSearch = () => {
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const handleCloseSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults(null)
  }

  // Keyboard shortcut Cmd+K or Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => {
          if (!prev) {
            setTimeout(() => searchInputRef.current?.focus(), 50)
            return true
          } else {
            setSearchQuery('')
            setSearchResults(null)
            return false
          }
        })
      } else if (e.key === 'Escape') {
        setSearchOpen(false)
        setSearchQuery('')
        setSearchResults(null)
        setBellOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close bell on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
    }
    if (bellOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [bellOpen])

  // Debounced search query
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed || trimmed.length < 2) {
      return
    }

    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`)
        if (res.ok) {
          const data: AdminSearchResponse = await res.json()
          if (data.success) {
            setSearchResults(data.results)
          }
        }
      } catch (err) {
        console.error('Search failed:', err)
      } finally {
        setSearching(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchQuery(val)
    if (!val.trim() || val.trim().length < 2) {
      setSearchResults(null)
    }
  }

  return (
    <>
      <header className="no-print h-16 bg-admin-surface/80 backdrop-blur border-b border-admin-border px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          {onToggleMobileMenu && (
            <button
              type="button"
              onClick={onToggleMobileMenu}
              aria-label="Open admin navigation menu"
              className="md:hidden p-1.5 rounded-lg border border-admin-border bg-admin-surface-raised text-admin-fg-muted hover:text-admin-fg transition-colors cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            {section && (
              <span className="hidden sm:inline text-admin-fg-subtle">
                {section}
                <span className="mx-1.5 text-admin-fg-subtle/60">/</span>
              </span>
            )}
            <span className="font-semibold text-admin-fg truncate">{title}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Search Button */}
          <button
            type="button"
            onClick={handleOpenSearch}
            aria-label="Search Admin Console"
            className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-admin-border bg-admin-surface text-admin-fg-muted hover:text-admin-fg hover:border-admin-border-strong transition-all text-xs font-medium cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-admin-accent" />
            <span className="hidden md:inline">Quick Search...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-admin-surface-raised border border-admin-border text-[10px] font-mono text-admin-fg-subtle">
              ⌘K
            </kbd>
          </button>

          {/* Alerts Bell Popover */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => setBellOpen((prev) => !prev)}
              aria-label={hasAttention ? `${attentionTotal} items need attention` : 'No items need attention'}
              className="relative p-2 rounded-lg text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {hasAttention && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-admin-danger ring-2 ring-admin-surface animate-pulse" />
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-admin-surface border border-admin-border shadow-2xl p-4 z-50 animate-in fade-in-0 zoom-in-95 space-y-3">
                <div className="flex items-center justify-between border-b border-admin-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-admin-fg">Actionable Attention</span>
                    {attentionTotal > 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-admin-warning-soft text-admin-warning border border-admin-warning/20">
                        {attentionTotal} Actionable
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setBellOpen(false)}
                    className="p-1 rounded-md text-admin-fg-subtle hover:text-admin-fg cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {attentionTotal === 0 ? (
                  <div className="py-6 text-center text-xs text-admin-fg-muted space-y-1">
                    <p className="font-semibold text-admin-fg">All Queues Cleared</p>
                    <p className="text-[11px] text-admin-fg-subtle">No pending moderation, errors, or failed emails.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {(attention['/admin/communications'] || 0) > 0 && (
                      <Link
                        href="/admin/communications"
                        onClick={() => setBellOpen(false)}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-admin-border bg-admin-surface-raised/40 hover:bg-admin-surface-raised text-xs text-admin-fg transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Mail className="w-4 h-4 text-admin-accent shrink-0" />
                          <div>
                            <p className="font-semibold">Communications Inquiries</p>
                            <p className="text-[10px] text-admin-fg-muted">New learner messages & outbound queue</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-admin-accent-soft text-admin-accent">
                          {attention['/admin/communications']}
                        </span>
                      </Link>
                    )}

                    {(attention['/admin/moderation'] || 0) > 0 && (
                      <Link
                        href="/admin/moderation"
                        onClick={() => setBellOpen(false)}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-admin-border bg-admin-surface-raised/40 hover:bg-admin-surface-raised text-xs text-admin-fg transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <MessageSquare className="w-4 h-4 text-admin-warning shrink-0" />
                          <div>
                            <p className="font-semibold">Moderation Queue</p>
                            <p className="text-[10px] text-admin-fg-muted">Pending capstones & testimonials</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-admin-warning-soft text-admin-warning">
                          {attention['/admin/moderation']}
                        </span>
                      </Link>
                    )}

                    {(attention['/admin/system'] || 0) > 0 && (
                      <Link
                        href="/admin/system"
                        onClick={() => setBellOpen(false)}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-admin-border bg-admin-surface-raised/40 hover:bg-admin-surface-raised text-xs text-admin-fg transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <ShieldAlert className="w-4 h-4 text-admin-danger shrink-0" />
                          <div>
                            <p className="font-semibold">System Alerts & Errors</p>
                            <p className="text-[10px] text-admin-fg-muted">Unresolved runtime error groups</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-admin-danger-soft text-admin-danger">
                          {attention['/admin/system']}
                        </span>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* System status badge */}
          <div
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-admin-surface border text-xs ${
              systemOnline ? 'border-admin-border text-admin-fg-muted' : 'border-admin-danger/25 text-admin-danger'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {systemOnline ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-admin-success opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-admin-success" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-admin-danger" />
              )}
            </span>
            <span className={`font-semibold ${systemOnline ? 'text-admin-success' : 'text-admin-danger'}`}>
              {systemOnline ? 'System Online' : 'System Unreachable'}
            </span>
          </div>

          {/* Admin profile chip */}
          {user && (
            <div
              className="hidden lg:flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg bg-admin-surface border border-admin-border"
              title={user.email}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-admin-accent-soft text-admin-accent text-[10px] font-bold uppercase">
                {displayName.slice(0, 2)}
              </span>
              <span className="text-xs font-semibold text-admin-fg max-w-[120px] truncate">{displayName}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out of Admin Console"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-admin-surface border border-admin-border text-xs font-semibold text-admin-danger hover:text-admin-fg hover:bg-admin-danger-soft transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Global Search Dialog Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={handleCloseSearch}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin Global Search"
            className="relative w-full max-w-2xl rounded-2xl bg-admin-surface border border-admin-border shadow-2xl p-4 sm:p-5 space-y-4 animate-in fade-in-0 zoom-in-95"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 border-b border-admin-border pb-3">
              <Search className="w-5 h-5 text-admin-accent shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={handleSearchInputChange}
                placeholder="Search learners, curriculum lessons, certificates, or communications..."
                className="w-full bg-transparent text-sm sm:text-base text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none"
              />
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin text-admin-accent shrink-0" />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults(null)
                  }}
                  className="p-1 rounded text-admin-fg-subtle hover:text-admin-fg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <kbd className="px-2 py-0.5 rounded bg-admin-surface-raised border border-admin-border text-[10px] font-mono text-admin-fg-subtle">
                  ESC
                </kbd>
              )}
            </div>

            {/* Results Display */}
            <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
              {!searchQuery.trim() || searchQuery.trim().length < 2 ? (
                <div className="py-8 text-center text-xs text-admin-fg-muted space-y-1">
                  <p className="font-semibold text-admin-fg">Search anything in Prodily</p>
                  <p className="text-[11px] text-admin-fg-subtle">
                    Type at least 2 characters to search across users, lessons, certificates, and inquiries.
                  </p>
                </div>
              ) : searchResults &&
                searchResults.users.length === 0 &&
                searchResults.curriculum.length === 0 &&
                searchResults.certificates.length === 0 &&
                searchResults.communications.length === 0 ? (
                <div className="py-8 text-center text-xs text-admin-fg-muted">
                  No matching results for &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : searchResults ? (
                <div className="space-y-4">
                  {/* Users Group */}
                  {searchResults.users.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-admin-accent px-1">
                        <User className="w-3.5 h-3.5" /> Users ({searchResults.users.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.users.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={handleCloseSearch}
                            className="flex items-center justify-between p-2.5 rounded-xl border border-admin-border bg-admin-surface-raised/40 hover:bg-admin-surface-raised hover:border-admin-border-strong text-xs text-admin-fg transition-colors group"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-admin-fg truncate">{item.title}</p>
                              <p className="text-[11px] text-admin-fg-muted truncate">{item.subtitle}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {item.badge && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-admin-accent-soft text-admin-accent font-semibold">
                                  {item.badge}
                                </span>
                              )}
                              <ChevronRight className="w-3.5 h-3.5 text-admin-fg-subtle group-hover:text-admin-fg transition-colors" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Curriculum Group */}
                  {searchResults.curriculum.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-admin-accent px-1">
                        <BookOpen className="w-3.5 h-3.5" /> Curriculum ({searchResults.curriculum.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.curriculum.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={handleCloseSearch}
                            className="flex items-center justify-between p-2.5 rounded-xl border border-admin-border bg-admin-surface-raised/40 hover:bg-admin-surface-raised hover:border-admin-border-strong text-xs text-admin-fg transition-colors group"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-admin-fg truncate">{item.title}</p>
                              <p className="text-[11px] text-admin-fg-muted truncate">{item.subtitle}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-admin-info-soft text-admin-info font-semibold">
                                {item.badge}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-admin-fg-subtle group-hover:text-admin-fg transition-colors" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certificates Group */}
                  {searchResults.certificates.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-admin-accent px-1">
                        <Award className="w-3.5 h-3.5" /> Certificates ({searchResults.certificates.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.certificates.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={handleCloseSearch}
                            className="flex items-center justify-between p-2.5 rounded-xl border border-admin-border bg-admin-surface-raised/40 hover:bg-admin-surface-raised hover:border-admin-border-strong text-xs text-admin-fg transition-colors group"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-admin-fg truncate">{item.title}</p>
                              <p className="text-[11px] text-admin-fg-muted truncate">{item.subtitle}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-admin-warning-soft text-admin-warning font-semibold">
                                {item.badge}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-admin-fg-subtle group-hover:text-admin-fg transition-colors" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Communications Group */}
                  {searchResults.communications.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-admin-accent px-1">
                        <Mail className="w-3.5 h-3.5" /> Communications ({searchResults.communications.length})
                      </div>
                      <div className="space-y-1">
                        {searchResults.communications.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={handleCloseSearch}
                            className="flex items-center justify-between p-2.5 rounded-xl border border-admin-border bg-admin-surface-raised/40 hover:bg-admin-surface-raised hover:border-admin-border-strong text-xs text-admin-fg transition-colors group"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-admin-fg truncate">{item.title}</p>
                              <p className="text-[11px] text-admin-fg-muted truncate">{item.subtitle}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-admin-surface-raised text-admin-fg-muted font-semibold">
                                {item.badge}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-admin-fg-subtle group-hover:text-admin-fg transition-colors" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  )
}