'use client'

import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, Menu, Bell } from 'lucide-react'
import { getAdminSectionLabel } from '@/lib/admin/navigation'
import { signOutAdmin } from '@/lib/admin/session'
import type { AdminConsoleUser } from './AdminConsoleShell'

interface AdminHeaderProps {
  onToggleMobileMenu?: () => void
  user?: AdminConsoleUser
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

export function AdminHeader({ onToggleMobileMenu, user, attentionTotal = 0, systemOnline = true }: AdminHeaderProps = {}) {
  const router = useRouter()
  const pathname = usePathname()

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
        {/* Alerts bell — dot only when there is something to act on */}
        <button
          type="button"
          aria-label={hasAttention ? `${attentionTotal} items need attention` : 'No items need attention'}
          className="relative p-2 rounded-lg text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors"
        >
          <Bell className="w-4 h-4" />
          {hasAttention && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-admin-danger ring-2 ring-admin-surface" />
          )}
        </button>

        {/* System status — reflects real DB reachability, not a hardcoded "online" */}
        <div
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-admin-surface-raised border text-xs ${
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