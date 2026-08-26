'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
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
  }
}

export default function AppShell({ children, userProfile }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <SearchOverlayProvider>
      <div className="flex min-h-screen bg-background">
        {/* Navigation Sidebar */}
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* Main Content Pane */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* System Announcement Banner — only in authenticated learner app context */}
          <SystemAnnouncementBanner userId={userProfile.id} cohortId={userProfile.cohort_id} />

          {/* Top Header Navigation */}
          <Topbar onMenuOpen={() => setIsSidebarOpen(true)} userProfile={userProfile} />

          {/* Content viewport */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 outline-none">
            {children}
          </main>
        </div>
      </div>

      {/* Search Overlay — mounted at shell level, lazy index loaded on first open */}
      <SearchOverlay />
      <LearnerFeedbackProvider />
    </SearchOverlayProvider>
  )
}
