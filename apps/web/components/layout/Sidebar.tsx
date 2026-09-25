'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  Award,
  RotateCw,
  BarChart3,
  Trophy,
  Settings,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMarkProdily, BrandIcon } from '@/components/brand/BrandLogo'
import { formatLogoutFailures, logout, LEARNER_LOGIN_PATH } from '@/lib/auth/logout'
import { useSearch } from '@/components/search/SearchOverlayProvider'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

const PROGRESS_SUBSECTIONS = [
  { label: 'Skill Radar', href: '/progress/radar' },
  { label: 'Core Metrics', href: '/progress/metrics' },
  { label: 'Badge Showcase', href: '/progress/badges' },
  { label: 'Capstones', href: '/progress/capstones' },
  { label: 'Certificates', href: '/progress/certificates' },
]

const SIDEBAR_LINKS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, quickStartTarget: undefined },
  { label: 'Curriculum', href: '/academy', icon: BookOpen, quickStartTarget: 'curriculum' },
  { label: 'Capstones', href: '/capstones', icon: Award, quickStartTarget: 'capstones' },
  { label: 'Badges', href: '/badges', icon: Trophy, quickStartTarget: 'badges' },
  { label: 'Review Hub', href: '/review', icon: RotateCw, quickStartTarget: 'review' },
  { label: 'Progress', href: '/progress', icon: BarChart3, quickStartTarget: undefined },
  { label: 'Leaderboard', href: '/leaderboard', icon: Trophy, quickStartTarget: 'leaderboard' },
  { label: 'Settings', href: '/settings', icon: Settings, quickStartTarget: 'settings' },
]

export default function Sidebar({ isOpen, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { openSearch } = useSearch()
  const isProgressRoute = pathname === '/progress' || pathname.startsWith('/progress')
  const [progressExpanded, setProgressExpanded] = useState(isProgressRoute)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const [wasProgressRoute, setWasProgressRoute] = useState(isProgressRoute)
  if (isProgressRoute !== wasProgressRoute) {
    setWasProgressRoute(isProgressRoute)
    if (isProgressRoute) setProgressExpanded(true)
  }

  const handleSignOut = async () => {
    setIsLoggingOut(true)
    onClose()

    const result = await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    if (!result.ok) {
      console.error('[Sidebar] Sign out completed with failures:', formatLogoutFailures(result))
    }
  }

  const renderSidebarContent = (collapsed: boolean) => (
    <div
      className={cn(
        'flex flex-col h-full max-h-screen bg-card border-r border-border py-4 transition-[width,padding] duration-200 ease-out-quint overflow-hidden select-none',
        collapsed ? 'w-[72px] px-2.5 items-center' : 'w-64 px-4'
      )}
    >
      {/* Logo & Collapse Header */}
      <div className={cn('flex items-center mb-4 w-full shrink-0', collapsed ? 'justify-center' : 'justify-between px-2')}>
        {!collapsed ? (
          <>
            <Link
              href="/dashboard"
              className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
              onClick={onClose}
            >
              <BrandMarkProdily size="sm" />
            </Link>
            <div className="flex items-center gap-1">
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="hidden lg:flex p-1.5 rounded-lg border border-transparent hover:border-border text-muted-foreground hover:text-foreground hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer transition-colors"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {/* Mobile close button */}
              <button
                type="button"
                onClick={onClose}
                className="lg:hidden p-1.5 rounded-lg border border-border text-foreground hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
              title="Prodily Dashboard"
            >
              <BrandIcon size="sm" />
            </Link>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1.5 rounded-lg border border-border/60 hover:border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer transition-colors"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Trigger */}
      <div className="mb-3 w-full shrink-0">
        {!collapsed ? (
          <button
            type="button"
            id="sidebar-search-trigger-btn"
            onClick={() => {
              onClose()
              openSearch()
            }}
            aria-label="Search curriculum (Ctrl+K)"
            aria-keyshortcuts="Control+k Meta+k"
            className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/60 hover:border-border text-xs text-muted-foreground hover:text-foreground transition-all duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-2xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Search className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              <span className="truncate text-xs font-medium">Search...</span>
            </div>
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/70 bg-background/80 border border-border/50 rounded shadow-2xs">
              ⌘K
            </kbd>
          </button>
        ) : (
          <div className="w-full flex justify-center group relative">
            <button
              type="button"
              id="sidebar-search-trigger-btn-collapsed"
              onClick={() => {
                onClose()
                openSearch()
              }}
              aria-label="Search curriculum (Ctrl+K)"
              aria-keyshortcuts="Control+k Meta+k"
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/60 hover:border-border text-muted-foreground hover:text-foreground transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-2xs"
              title="Search (⌘K)"
            >
              <Search className="w-4 h-4 shrink-0" />
            </button>
            <div
              role="tooltip"
              className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-medium shadow-md whitespace-nowrap z-50 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
            >
              Search (⌘K)
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav
        className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden space-y-1.5 py-1 pr-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]"
        aria-label="Main Navigation"
      >
        {SIDEBAR_LINKS.map((link) => {
          const Icon = link.icon
          const isActive =
            pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))

          if (link.label === 'Progress') {
            const isProgressActive = isProgressRoute

            if (collapsed) {
              return (
                <div key={link.label} className="w-full flex justify-center group relative">
                  <Link
                    href="/progress"
                    onClick={onClose}
                    className={cn(
                      'w-10 h-10 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                      isProgressActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                    )}
                    aria-label="Progress"
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                  </Link>
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-medium shadow-md whitespace-nowrap z-50 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
                  >
                    Progress
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground" />
                  </div>
                </div>
              )
            }

            return (
              <div key={link.label} className="space-y-1">
                <button
                  type="button"
                  aria-expanded={progressExpanded}
                  aria-label="Toggle Progress menu"
                  onClick={() => setProgressExpanded((prev) => !prev)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer group select-none text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                    isProgressActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </div>

                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 transition-transform duration-200 shrink-0 text-muted-foreground group-hover:text-foreground',
                      progressExpanded && 'rotate-180 text-primary'
                    )}
                  />
                </button>

                {/* Dropdown sections */}
                {progressExpanded && (
                  <div className="ml-5 pl-3 border-l border-border/70 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {PROGRESS_SUBSECTIONS.map((sub) => {
                      const isSubActive = pathname === sub.href
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={onClose}
                          className={cn(
                            'flex items-center py-1.5 px-2 rounded-md text-xs transition-colors group select-none',
                            isSubActive
                              ? 'bg-primary/15 text-primary font-semibold shadow-2xs'
                              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 font-medium'
                          )}
                        >
                          <span className="truncate">{sub.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          if (collapsed) {
            return (
              <div key={link.href} className="w-full flex justify-center group relative">
                <Link
                  href={link.href}
                  onClick={onClose}
                  {...(link.quickStartTarget ? { 'data-quick-start-target': link.quickStartTarget } : {})}
                  className={cn(
                    'w-10 h-10 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                  )}
                  aria-label={link.label}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                </Link>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-medium shadow-md whitespace-nowrap z-50 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
                >
                  {link.label}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground" />
                </div>
              </div>
            )
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              {...(link.quickStartTarget ? { 'data-quick-start-target': link.quickStartTarget } : {})}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              {link.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer / Logout Button */}
      <div className="border-t border-border pt-3 mt-auto w-full shrink-0">
        {!collapsed ? (
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isLoggingOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-1 cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
          </button>
        ) : (
          <div className="w-full flex justify-center group relative">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer disabled:opacity-50"
              aria-label="Log out"
            >
              <LogOut className="w-5 h-5 shrink-0" />
            </button>
            <div
              role="tooltip"
              className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-medium shadow-md whitespace-nowrap z-50 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
            >
              {isLoggingOut ? 'Logging out...' : 'Log out'}
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground" />
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar (Collapsible) */}
      <aside
        className={cn(
          'hidden lg:block h-screen sticky top-0 flex-shrink-0 z-30 overflow-hidden transition-[width] duration-200 ease-out-quint',
          isCollapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {renderSidebarContent(isCollapsed)}
      </aside>

      {/* Mobile Drawer Sidebar Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer container with rounded edge and shadow */}
          <div className="relative flex flex-col w-72 max-w-[85vw] h-full bg-card border-r border-border shadow-2xl animate-in slide-in-from-left duration-200 z-10 overflow-hidden">
            {renderSidebarContent(false)}
          </div>
        </div>
      )}
    </>
  )
}

