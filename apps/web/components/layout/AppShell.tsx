'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

interface AppShellProps {
  children: React.ReactNode
  userProfile: {
    name: string | null
    email: string
    level: number
  }
}

export default function AppShell({ children, userProfile }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      {/* Navigation Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Pane */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top Header Navigation */}
        <Topbar onMenuOpen={() => setIsSidebarOpen(true)} userProfile={userProfile} />

        {/* Content viewport */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 outline-none">
          {children}
        </main>
      </div>
    </div>
  )
}
