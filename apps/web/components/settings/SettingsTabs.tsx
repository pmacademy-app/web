'use client'

import React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { User, Shield, Briefcase, Bell, AlertTriangle } from 'lucide-react'
import { ProfileSettingsTab } from '@/components/settings/ProfileSettingsTab'
import { SecuritySettingsTab } from '@/components/settings/SecuritySettingsTab'
import { PortfolioSettingsForm } from '@/components/settings/PortfolioSettingsForm'
import { NotificationPreferencesTab } from '@/components/notifications/NotificationPreferencesTab'
import { DangerZoneTab } from '@/components/settings/DangerZoneTab'

export type SettingsTabKey = 'profile' | 'security' | 'portfolio' | 'notifications' | 'danger-zone'

export function SettingsTabs() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab') as SettingsTabKey | null

  const validTabs: SettingsTabKey[] = ['profile', 'security', 'portfolio', 'notifications', 'danger-zone']
  const activeTab: SettingsTabKey = tabParam && validTabs.includes(tabParam) ? tabParam : 'profile'

  const handleTabChange = (tab: SettingsTabKey) => {
    router.push(`/settings?tab=${tab}`, { scroll: false })
  }

  return (
    <div className="space-y-6">
      {/* 5-Tab Navigation */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto scrollbar-none max-w-full">
        <button
          type="button"
          onClick={() => handleTabChange('profile')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <User className="w-4 h-4" />
          Profile
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('security')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'security'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <Shield className="w-4 h-4" />
          Security
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('portfolio')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'portfolio'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Portfolio
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('notifications')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
          }`}
        >
          <Bell className="w-4 h-4" />
          Notifications
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('danger-zone')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'danger-zone'
              ? 'bg-destructive text-destructive-foreground shadow-xs'
              : 'text-destructive/80 hover:text-destructive hover:bg-destructive/10'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Danger Zone
        </button>
      </div>

      {/* Active Tab View */}
      <div>
        {activeTab === 'profile' && <ProfileSettingsTab />}
        {activeTab === 'security' && <SecuritySettingsTab />}
        {activeTab === 'portfolio' && <PortfolioSettingsForm />}
        {activeTab === 'notifications' && <NotificationPreferencesTab />}
        {activeTab === 'danger-zone' && <DangerZoneTab />}
      </div>
    </div>
  )
}
