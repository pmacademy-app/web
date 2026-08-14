'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, LogOut, PanelsTopLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { signOutAdmin } from '@/lib/admin/session'
import type { AdminConsoleUser } from './AdminConsoleShell'
import {
  ADMIN_NAV_BUILT,
  isAdminNavItemActive,
} from '@/lib/admin/navigation'

export interface AdminSidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
  user?: AdminConsoleUser
}

export function AdminSidebar({ mobileOpen, onMobileClose, user }: AdminSidebarProps = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const displayName = user?.name || user?.email.split('@')[0] || 'Admin'
  const handleSignOut = () => signOutAdmin(router)

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  const content = (
    <div
      className={cn(
        'bg-admin-surface border-r border-admin-border text-admin-fg flex flex-col h-full transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div
        className={cn(
          'flex items-center justify-between gap-2 p-4 border-b border-admin-border',
          collapsed && 'justify-center px-2'
        )}
      >
        {collapsed ? (
          <PanelsTopLeft className="w-6 h-6 text-admin-accent shrink-0" />
        ) : (
          <>
            <Link
              href="/admin"
              onClick={onMobileClose}
              className="flex items-center gap-2 focus:outline-none rounded shrink-0"
            >
              <BrandMarkProdily size="sm" badgeText="Admin" onDark />
            </Link>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="hidden lg:flex p-1.5 rounded-lg text-admin-fg-subtle hover:text-admin-fg hover:bg-admin-surface-raised transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin scrollbar-thumb-admin-border">
        {ADMIN_NAV_BUILT.map((group) => {
          const groupCollapsed = collapsedGroups.has(group.label)
          const groupHasActive = group.items.some((item) => isAdminNavItemActive(item, pathname))
          return (
            <div key={group.label}>
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={!groupCollapsed}
                  aria-label={`${group.label} section`}
                  className="w-full flex items-center justify-between px-2 pb-1.5 text-[10px] font-bold text-admin-fg-subtle uppercase tracking-wider hover:text-admin-fg transition-colors cursor-pointer"
                >
                  <span className={cn(groupHasActive && !groupCollapsed && 'text-admin-accent')}>{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'w-3 h-3 transition-transform duration-150',
                      groupCollapsed && '-rotate-90'
                    )}
                  />
                </button>
              ) : (
                <div className="h-4" aria-hidden="true" />
              )}
              {!groupCollapsed && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = isAdminNavItemActive(item, pathname)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onMobileClose}
                        title={collapsed ? item.name : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors relative group',
                          collapsed && 'justify-center px-2',
                          isActive
                            ? 'bg-admin-accent-soft text-admin-accent border border-admin-accent/25 font-semibold'
                            : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
                        )}
                      >
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0',
                            isActive ? 'text-admin-accent' : 'text-admin-fg-subtle group-hover:text-admin-fg'
                          )}
                        />
                        {!collapsed && (
                          <>
                            <span className="truncate">{item.name}</span>
                            {item.badge && (
                              <span className="ml-auto px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-admin-warning-soft text-admin-warning">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Expand control when collapsed */}
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="flex w-full items-center justify-center p-2 rounded-lg text-admin-fg-subtle hover:text-admin-fg hover:bg-admin-surface-raised transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </nav>

      {/* Footer / Admin identity & view switch */}
      <div className="p-3 border-t border-admin-border bg-admin-surface-raised/40 space-y-2">
        {user && !collapsed && (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin-accent-soft text-admin-accent text-xs font-bold uppercase border border-admin-accent/25">
              {displayName.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-admin-fg truncate">{displayName}</p>
              <p className="text-[10px] text-admin-fg-subtle truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out of Admin Console"
              title="Sign out"
              className="p-1.5 rounded-lg text-admin-fg-subtle hover:text-admin-danger hover:bg-admin-danger-soft transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <Link
          href="/dashboard"
          onClick={onMobileClose}
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-admin-fg-muted hover:text-admin-fg bg-admin-surface hover:bg-admin-surface-raised rounded-lg border border-admin-border transition-colors"
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="w-3.5 h-3.5" />
            Switch to Learner View
          </span>
        </Link>

        {collapsed && user && (
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out of Admin Console"
            title="Sign out"
            className="flex w-full items-center justify-center p-2 rounded-lg text-admin-fg-subtle hover:text-admin-danger hover:bg-admin-danger-soft transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex h-screen sticky top-0 flex-shrink-0 z-30">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <div className="relative flex flex-col h-full animate-in slide-in-from-left duration-200">
            {content}
          </div>
        </div>
      )}
    </>
  )
}
