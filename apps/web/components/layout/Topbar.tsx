'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Menu, User, LogOut, ChevronRight, Sparkles, Pencil } from 'lucide-react'
import { formatLogoutFailures, logout, LEARNER_LOGIN_PATH } from '@/lib/auth/logout'
import { getLevelTitle } from '@/lib/xp'
import { useBreadcrumbs } from '@/contexts/breadcrumb-context'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { NotificationToast } from '@/components/notifications/NotificationToast'
import { useQuickStart } from '@/components/quick-start/QuickStartContext'

interface TopbarProps {
  onMenuOpen: () => void
  userProfile: {
    name: string | null
    email: string
    level: number
    avatar_url?: string | null
  }
}

export default function Topbar({ onMenuOpen, userProfile }: TopbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { openQuickStart } = useQuickStart()

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
    const result = await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    if (!result.ok) {
      // Navigation has already happened; this records which step failed so a
      // session that survived the click is diagnosable.
      console.error('[Topbar] Sign out completed with failures:', formatLogoutFailures(result))
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
    <header className="h-16 sticky top-0 bg-background border-b border-border z-20 px-4 md:px-6 flex items-center justify-between">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuOpen}
          className="lg:hidden w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-border text-foreground hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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

      {/* Right: Feedback, Notifications & Profile Dropdown */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Feedback Trigger — Pencil button */}
        <button
          type="button"
          id="feedback-trigger-btn"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('learner:feedback:prompt', {
                detail: { key: 'header_feedback' },
              })
            )
          }}
          title="Give feedback"
          aria-label="Give feedback"
          className="relative p-2.5 rounded-lg border border-input bg-card hover:bg-secondary/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 flex items-center justify-center min-w-[44px] min-h-[44px]"
        >
          <Pencil className="w-4 h-4" />
        </button>

        {/* Notification Bell Header Control */}
        <NotificationBell />

        {/* Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            id="user-profile-menu-btn"
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            aria-label="Open user profile menu"
            className="relative flex items-center justify-center p-1 min-w-[44px] min-h-[44px] rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-transform cursor-pointer group"
          >
            {/* Precision circulating animated green orbital ring */}
            <div className="relative w-10 h-10 flex items-center justify-center">
              {/* Ultra-crisp vector rotating gradient ring */}
              <svg
                className="absolute inset-0 w-full h-full animate-[spin_3s_linear_infinite] motion-reduce:animate-none pointer-events-none drop-shadow-[0_0_6px_rgba(31,107,78,0.5)]"
                viewBox="0 0 40 40"
              >
                <defs>
                  {/* The two endpoint stops read the brand primary from the design
                      tokens rather than repeating its hex. CI blocks the brand
                      literals outside theme/tokens.ts, and the variable also keeps
                      the ring correct if the token is ever retuned. The two interior
                      stops are shades specific to this gradient and have no token. */}
                  <linearGradient id="topbarGreenAura" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--color-primary)" />
                    <stop offset="35%" stopColor="#2E8B67" />
                    <stop offset="70%" stopColor="#16543D" />
                    <stop offset="100%" stopColor="var(--color-primary)" />
                  </linearGradient>
                </defs>
                <circle
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  stroke="url(#topbarGreenAura)"
                  strokeWidth="2.5"
                />
              </svg>

              {/* Circular Avatar */}
              <div className="relative w-8 h-8 rounded-full overflow-hidden bg-muted/40 flex items-center justify-center border border-border/80 shadow-xs">
                {userProfile.avatar_url || !userProfile.name || userProfile.name.toLowerCase().includes('aditya') ? (
                  <img
                    src={userProfile.avatar_url || '/avatars/aditya.png'}
                    alt={userProfile.name || 'User avatar'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs select-none">
                    {userProfile.name ? userProfile.name[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
                  </div>
                )}
              </div>
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
                    openQuickStart('manual')
                  }}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-secondary/40 transition-colors focus:outline-none focus:bg-secondary/40 cursor-pointer"
                  role="menuitem"
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                  Quick Start Tour
                </button>
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

