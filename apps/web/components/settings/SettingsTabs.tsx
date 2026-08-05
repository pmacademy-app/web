'use client'

import React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { User, Bell } from 'lucide-react'
import { PortfolioSettingsForm } from '@/components/settings/PortfolioSettingsForm'
import { NotificationPreferencesTab } from '@/components/notifications/NotificationPreferencesTab'

export function SettingsTabs() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam === 'notifications' ? 'notifications' : 'portfolio'

  const handleTabChange = (tab: 'portfolio' | 'notifications') => {
    router.push(`/settings?tab=${tab}`, { scroll: false })
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        <button
          type="button"
          onClick={() => handleTabChange('portfolio')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'portfolio'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <User className="w-4 h-4" />
          Portfolio & Profile
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('notifications')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notification Preferences
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'portfolio' ? (
        <PortfolioSettingsForm />
      ) : (
        <NotificationPreferencesTab />
      )}
    </div>
  )
}
