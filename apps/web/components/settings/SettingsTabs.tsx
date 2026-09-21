'use client'

import React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { User, Shield, Briefcase, Bell, Gift, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProfileSettingsTab } from '@/components/settings/ProfileSettingsTab'
import { SecuritySettingsTab } from '@/components/settings/SecuritySettingsTab'
import { PortfolioSettingsForm } from '@/components/settings/PortfolioSettingsForm'
import { NotificationPreferencesTab } from '@/components/notifications/NotificationPreferencesTab'
import { ReferralSettingsTab } from '@/components/settings/ReferralSettingsTab'
import { DangerZoneTab } from '@/components/settings/DangerZoneTab'

export type SettingsTabKey = 'profile' | 'security' | 'portfolio' | 'notifications' | 'referrals' | 'danger-zone'

interface TabItem {
  key: SettingsTabKey
  label: string
  icon: React.ElementType
}

const TABS: TabItem[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'security', label: 'Security', icon: Shield },
  { key: 'portfolio', label: 'Portfolio', icon: Briefcase },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'referrals', label: 'Referrals', icon: Gift },
  { key: 'danger-zone', label: 'Danger Zone', icon: AlertTriangle },
]

export function SettingsTabs() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab') as SettingsTabKey | null

  const validTabs: SettingsTabKey[] = ['profile', 'security', 'portfolio', 'notifications', 'referrals', 'danger-zone']
  const activeTab: SettingsTabKey = tabParam && validTabs.includes(tabParam) ? tabParam : 'profile'

  const handleTabChange = (tab: SettingsTabKey) => {
    router.push(`/settings?tab=${tab}`, { scroll: false })
  }

  return (
    <div className="space-y-4">
      {/* Option B: Sleek Recessed Segmented Control Strip */}
      <div className="inline-flex max-w-full items-center p-0.5 bg-muted/60 dark:bg-muted/40 rounded-lg border border-border/60 gap-0.5 overflow-x-auto scrollbar-none shadow-2xs">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const isDanger = tab.key === 'danger-zone'
          const Icon = tab.icon

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all cursor-pointer whitespace-nowrap select-none',
                isActive
                  ? isDanger
                    ? 'bg-card text-destructive shadow-2xs border border-destructive/20 font-semibold'
                    : 'bg-card text-foreground shadow-2xs border border-border/50 font-semibold'
                  : isDanger
                    ? 'text-destructive/70 hover:text-destructive hover:bg-destructive/10 font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40 font-medium'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5 shrink-0', isActive && !isDanger && 'text-primary')} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Active Tab View */}
      <div>
        {activeTab === 'profile' && <ProfileSettingsTab />}
        {activeTab === 'security' && <SecuritySettingsTab />}
        {activeTab === 'portfolio' && <PortfolioSettingsForm />}
        {activeTab === 'notifications' && <NotificationPreferencesTab />}
        {activeTab === 'referrals' && <ReferralSettingsTab />}
        {activeTab === 'danger-zone' && <DangerZoneTab />}
      </div>
    </div>
  )
}
