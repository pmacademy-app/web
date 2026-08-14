'use client'

import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, Menu, Search, Bell } from 'lucide-react'
import { getAdminSectionLabel } from '@/lib/admin/navigation'
import { signOutAdmin } from '@/lib/admin/session'
import type { AdminConsoleUser } from './AdminConsoleShell'

interface AdminHeaderProps {
  onToggleMobileMenu?: () => void
  onOpenSearch?: () => void
  user?: AdminConsoleUser
}

const TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/users': 'Users',
  '/admin/communications': 'Communications',
  '/admin/feedback': 'Moderation',
  '/admin/content': 'Curriculum',
  '/admin/certificates': 'Certificates',
  '/admin/system': 'Health & Alerts',
}

export function AdminHeader({ onToggleMobileMenu, onOpenSearch, user }: AdminHeaderProps = {}) {
  const router = useRouter()
  const pathname = usePathname()

  const title = TITLES[pathname] ?? 'Admin'
  const section = getAdminSectionLabel(pathname)

  const handleSignOut = () => signOutAdmin(router)

  const displayName = user?.name || user?.email.split('@')[0] || 'Admin'

  return (
    <header className="h-16 bg-admin-surface/80 backdrop-blur border-b border-admin-border px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label="Open admin navigation menu"
            className="md:hidden p-1.5 rounded-lg border border-admin-border bg-admin-surface-raised text-admin-fg-muted hover:text-admin-fg transition-colors"
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

      <div className="flex items-center gap-2.5">
        {/* Search trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search admin console (Command K)"
          className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-admin-border bg-admin-surface-raised text-xs text-admin-fg-subtle hover:text-admin-fg transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search…</span>
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-admin-surface text-[10px] font-mono border border-admin-border">
            ⌘K
          </kbd>
        </button>

        {/* Alerts bell */}
        <button
          type="button"
          aria-label="System alerts"
          className="relative p-2 rounded-lg text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-admin-danger ring-2 ring-admin-surface" />
        </button>

        {/* System status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-admin-surface-raised border border-admin-border text-xs text-admin-fg-muted">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-admin-success opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-admin-success" />
          </span>
          <span className="font-semibold text-admin-success">System Online</span>
        </div>

        {/* Admin profile chip */}
        {user && (
          <div
            className="hidden lg:flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-lg bg-admin-surface-raised border border-admin-border"
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
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-admin-surface-raised border border-admin-border text-xs font-semibold text-admin-danger hover:text-admin-fg hover:bg-admin-danger-soft transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>
  )
}
