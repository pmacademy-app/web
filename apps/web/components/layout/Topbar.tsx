'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Menu, Search, User, LogOut, ChevronRight } from 'lucide-react'
import { useSearch } from '@/components/search/SearchOverlayProvider'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { getLevelTitle } from '@/lib/xp'
import { useBreadcrumbs } from '@/contexts/breadcrumb-context'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { NotificationToast } from '@/components/notifications/NotificationToast'

interface TopbarProps {
  onMenuOpen: () => void
  userProfile: {
    name: string | null
    email: string
    level: number
  }
}

export default function Topbar({ onMenuOpen, userProfile }: TopbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { openSearch } = useSearch()

  const { breadcrumbs: contextCrumbs } = useBreadcrumbs()

  // Dynamically calculate breadcrumbs
  const segments = pathname.split('/').filter(Boolean)
  const defaultCrumbs = segments.map((seg, i) => {
    // Human-readable labels
    let label = seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    if (label.toLowerCase() === 'curriculum') label = 'Curriculum'
    else if (label.toLowerCase() === 'review') label = 'Review Hub'
    else if (label.toLowerCase() === 'leaderboard') label = 'Cohort Leaderboard'

    let href = '/' + segments.slice(0, i + 1).join('/')
    // Redirect standalone module slug breadcrumbs to /academy to prevent 404 dead links
    if (segments[0] === 'academy' && i === 1 && segments.length > 1) {
      href = '/academy'
    }
    return { label, href }
  })

  const breadcrumbs = contextCrumbs.length > 0 ? contextCrumbs : defaultCrumbs

  const handleSignOut = async () => {
    try {
      const supabase = createBrowserSupabaseClient()
      await supabase.auth.signOut()

      // Sync and clear server-side cookies
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session: null }),
      })

      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('[Topbar] Sign out error:', err)
    }
  }

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const levelTitle = getLevelTitle(userProfile.level)

  return (
    <header className="h-16 sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border z-20 px-4 md:px-6 flex items-center justify-between">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuOpen}
          className="lg:hidden p-2 rounded-lg border border-border text-foreground hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumbs Navigation */}
        <nav aria-label="Breadcrumbs" className="hidden sm:flex items-center gap-1.5 text-xs font-medium">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded px-1"
          >
            Home
          </Link>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1
            return (
              <div key={`${crumb.label}-${idx}`} className="flex items-center gap-1.5">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                {isLast ? (
                  <span className="text-foreground font-semibold px-1" aria-current="page">
                    {crumb.label}
                  </span>
                ) : !crumb.href ? (
                  <span className="text-muted-foreground px-1">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded px-1"
                  >
                    {crumb.label}
                  </Link>
                )}
              </div>
            )
          })}
        </nav>

        {/* Mobile Page Title fallback */}
        <div className="sm:hidden font-serif font-bold text-foreground text-sm">
          {breadcrumbs[breadcrumbs.length - 1]?.label || 'PM Academy'}
        </div>
      </div>

      {/* Right: Search trigger & Profile Dropdown */}
      <div className="flex items-center gap-4">
        {/* Search Trigger — opens SearchOverlay (Sprint 8.2) */}
        <button
          type="button"
          id="search-trigger-btn"
          onClick={openSearch}
          aria-label="Search curriculum (Ctrl+K)"
          aria-keyshortcuts="Control+k Meta+k"
          className="flex items-center gap-2 border border-input bg-card hover:bg-secondary/40 text-muted-foreground px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Search className="w-4 h-4" />
          <span className="hidden md:inline">Search</span>
          <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium bg-muted border border-border rounded opacity-70">
            ⌘K
          </kbd>
        </button>

        {/* Notification Bell Header Control */}
        <NotificationBell />

        {/* Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            aria-label="Open user profile menu"
            className="flex items-center gap-2 p-1 rounded-full border border-border bg-card hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
              {userProfile.name ? userProfile.name[0].toUpperCase() : <User className="w-4 h-4" />}
            </div>
          </button>

          {dropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-lg py-2 z-30 focus:outline-none animate-in fade-in duration-100"
              role="menu"
              aria-label="User Profile Dropdown"
            >
              <div className="px-4 py-2 border-b border-border">
                <p className="text-sm font-semibold text-foreground truncate">
                  {userProfile.name || 'Student Learner'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate mb-1">
                  {userProfile.email}
                </p>
                <span className="inline-block text-[9px] uppercase tracking-wider font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                  Lvl {userProfile.level} — {levelTitle}
                </span>
              </div>

              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-secondary/40 transition-colors focus:outline-none focus:bg-secondary/40"
                  role="menuitem"
                >
                  <User className="w-4 h-4 text-muted-foreground" />
                  Profile Settings
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false)
                    handleSignOut()
                  }}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors focus:outline-none focus:bg-destructive/10 cursor-pointer"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <NotificationToast />
    </header>
  )
}
