'use client'

import { useState, useSyncExternalStore } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { MobileTabBar } from './MobileTabBar'
import { SystemAnnouncementBanner } from './SystemAnnouncementBanner'
import { SearchOverlayProvider } from '@/components/search/SearchOverlayProvider'
import { SearchOverlay } from '@/components/search/SearchOverlay'
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
      <div className="flex min-h-screen bg-background">
        {/* Navigation Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />

        {/* Main Content Pane */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
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
          <main className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-5 md:px-6 lg:px-8 pb-24 lg:pb-8 outline-none">
            {children}
          </main>
        </div>
      </div>

      {/* Native App-like Mobile Bottom Navigation Tab Bar */}
      <MobileTabBar onOpenMenu={() => setIsSidebarOpen(true)} />

      {/* Search Overlay — mounted at shell level, lazy index loaded on first open */}
      <SearchOverlay />
      <LearnerFeedbackProvider />
    </SearchOverlayProvider>
  )
}
