'use client'

import { useState, useSyncExternalStore } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { MobileTabBar } from './MobileTabBar'
import { SystemAnnouncementBanner } from './SystemAnnouncementBanner'
import { SearchOverlayProvider } from '@/components/search/SearchOverlayProvider'
import { SearchOverlayHost } from './lazy-modals'
import { LearnerFeedbackProvider } from '@/components/feedback/LearnerFeedbackProvider'

interface AppShellProps {
  children: React.ReactNode
  userProfile: {
    id?: string
    name: string | null
    email: string
    level: number
    cohort_id?: string | null
    avatar_url?: string | null
    username?: string | null
    is_portfolio_public?: boolean
    total_xp?: number | null
    current_streak?: number | null
    last_streak_date?: string | null
    timezone?: string | null
    is_fellow?: boolean | null
    avatar_frame?: string | null
  }
}

const SIDEBAR_STORAGE_KEY = 'prodily_sidebar_collapsed'
const SIDEBAR_STORAGE_EVENT = 'prodily_sidebar_storage'

function subscribeSidebarStorage(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', callback)
  window.addEventListener(SIDEBAR_STORAGE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(SIDEBAR_STORAGE_EVENT, callback)
  }
}

function getSidebarSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function getSidebarServerSnapshot(): boolean {
  return false
}

export default function AppShell({ children, userProfile }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const isSidebarCollapsed = useSyncExternalStore(
    subscribeSidebarStorage,
    getSidebarSnapshot,
    getSidebarServerSnapshot
  )

  const handleToggleCollapse = () => {
    const next = !isSidebarCollapsed
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      window.dispatchEvent(new Event(SIDEBAR_STORAGE_EVENT))
    } catch {
      // Ignore storage errors
    }
  }

  return (
    <SearchOverlayProvider>
      <div className="flex min-h-dvh bg-background">
        {/* Skip link: must be the first focusable element */}
        <a
          href="#main-content"
          className="fixed top-4 left-4 z-[100] px-4 py-2 bg-surface text-foreground text-body-sm font-medium border border-border rounded-md shadow-sm -translate-y-20 focus:translate-y-0 transition-transform duration-[120ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Skip to main content
        </a>

        {/* Navigation Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          username={userProfile.username}
          isPortfolioPublic={userProfile.is_portfolio_public}
        />

        {/* Main Content Pane */}
        <div className="flex flex-col flex-1 min-w-0 overflow-x-clip">
          {/* System Announcement Banner — only in authenticated learner app context */}
          <SystemAnnouncementBanner userId={userProfile.id} cohortId={userProfile.cohort_id} />

          {/* Top Header Navigation */}
          <Topbar
            onMenuOpen={() => setIsSidebarOpen(true)}
            onToggleSidebarCollapse={handleToggleCollapse}
            isSidebarCollapsed={isSidebarCollapsed}
            userProfile={userProfile}
          />

          {/* Content viewport with safe bottom padding on mobile for MobileTabBar */}
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-5 md:px-6 lg:px-8 pb-24 lg:pb-8 outline-none">
            {children}
          </main>
        </div>
      </div>

      {/* Native App-like Mobile Bottom Navigation Tab Bar */}
      <MobileTabBar onOpenMenu={() => setIsSidebarOpen(true)} />

      {/* Search overlay: its code and index load on first open (preloaded on intent, see the host) */}
      <SearchOverlayHost />
      <LearnerFeedbackProvider />
    </SearchOverlayProvider>
  )
}
