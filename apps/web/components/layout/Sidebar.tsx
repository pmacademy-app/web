'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, BookOpen, Award, RotateCw, BarChart3, Trophy, Settings, X, ChevronDown, LogOut, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { formatLogoutFailures, logout, LEARNER_LOGIN_PATH } from '@/lib/auth/logout'
import { useSearch } from '@/components/search/SearchOverlayProvider'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const PROGRESS_SUBSECTIONS = [
  { label: 'Next Milestone', href: '/progress/milestones' },
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

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { openSearch } = useSearch()
  const isProgressRoute = pathname === '/progress' || pathname.startsWith('/progress')
  const [progressExpanded, setProgressExpanded] = useState(isProgressRoute)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  /**
   * Auto-expand the Progress submenu when the learner navigates into a `/progress/*`
   * route.
   *
   * `useState(isProgressRoute)` above only covers the first render, so a client-side
   * navigation from, say, `/dashboard` to `/progress/radar` still needs to open the
   * submenu. That used to be a `useEffect` calling `setProgressExpanded(true)`, which
   * React flags because a synchronous setState inside an effect renders the sidebar
   * twice on every such navigation — once collapsed, once expanded.
   *
   * This is React's documented "adjust state when a prop changes" pattern instead: the
   * comparison runs during render, so the corrected value is used in the same pass and
   * the intermediate collapsed frame never reaches the DOM. Tracking the previous route
   * flag (rather than writing `progressExpanded || isProgressRoute`) is what keeps a
   * manual collapse working — the learner can still close the submenu while standing on
   * a progress page, and it only re-opens when they navigate into one again.
   */
  const [wasProgressRoute, setWasProgressRoute] = useState(isProgressRoute)
  if (isProgressRoute !== wasProgressRoute) {
    setWasProgressRoute(isProgressRoute)
    if (isProgressRoute) setProgressExpanded(true)
  }

  /**
   * Sign out through the shared helper, exactly as the Topbar does.
   *
   * This used to be a hand-rolled copy that called `createBrowserSupabaseClient()` and
   * `auth.signOut()` before clearing the cookies. B13-A removed that call from the
   * canonical path on purpose: `persistSession` is disabled, so the browser client holds
   * no session and the revocation was a no-op that still reported success. The real
   * revocation happens in `POST /api/auth/session`, server-side, where the refresh token
   * actually lives.
   *
   * The copy also put the navigation inside the `try`, so a throw from either request
   * left the learner on an authenticated-looking page with the drawer still open.
   * `logout()` settles each step independently and navigates in a `finally`, and returns
   * the outcome instead of swallowing it.
   */
  const handleSignOut = async () => {
    setIsLoggingOut(true)
    onClose()

    const result = await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    if (!result.ok) {
      // Navigation has already happened; this records which step failed so a session
      // that survived the click is diagnosable.
      console.error('[Sidebar] Sign out completed with failures:', formatLogoutFailures(result))
    }
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-card border-r border-border py-6 px-4">
      {/* Logo: Logo Mark + Prodily */}
      <div className="flex items-center justify-between px-2 mb-5">
        <Link
          href="/dashboard"
          className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
          onClick={onClose}
        >
          <BrandMarkProdily size="sm" />
        </Link>
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

      {/* Search Trigger */}
      <div className="mb-4">
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
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1.5" aria-label="Main Navigation">
        {SIDEBAR_LINKS.map((link) => {
          const Icon = link.icon
          const isActive =
            pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href))

          if (link.label === 'Progress') {
            const isProgressActive = isProgressRoute
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
      <div className="border-t border-border pt-3 mt-auto">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isLoggingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-1 cursor-pointer disabled:opacity-50"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden lg:block w-64 h-screen sticky top-0 flex-shrink-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer container */}
          <div className="relative flex flex-col w-64 max-w-xs h-full bg-background animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
