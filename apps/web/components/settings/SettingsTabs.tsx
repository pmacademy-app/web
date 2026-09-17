'use client'

import React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { User, Shield, Briefcase, Bell, Gift, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProfileSettingsTab } from '@/components/settings/ProfileSettingsTab'
import { SecuritySettingsTab } from '@/components/settings/SecuritySettingsTab'
import { PortfolioSettingsForm } from '@/components/settings/PortfolioSettingsForm'
import { NotificationPreferencesTab } from '@/components/notifications/NotificationPreferencesTab'
import { ReferralSettingsTab } from '@/components/settings/ReferralSettingsTab'
import { DangerZoneTab } from '@/components/settings/DangerZoneTab'

export type SettingsTabKey = 'profile' | 'security' | 'portfolio' | 'notifications' | 'referrals' | 'danger-zone'

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
    <div className="space-y-6">
      {/* 6-Tab Navigation */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto scrollbar-none max-w-full">
        <Button
          type="button"
          variant={activeTab === 'profile' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('profile')}
          className="rounded-xl font-bold"
        >
          <User className="w-4 h-4" />
          Profile
        </Button>

        <Button
          type="button"
          variant={activeTab === 'security' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('security')}
          className="rounded-xl font-bold"
        >
          <Shield className="w-4 h-4" />
          Security
        </Button>

        <Button
          type="button"
          variant={activeTab === 'portfolio' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('portfolio')}
          className="rounded-xl font-bold"
        >
          <Briefcase className="w-4 h-4" />
          Portfolio
        </Button>

        <Button
          type="button"
          variant={activeTab === 'notifications' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('notifications')}
          className="rounded-xl font-bold"
        >
          <Bell className="w-4 h-4" />
          Notifications
        </Button>

        <Button
          type="button"
          variant={activeTab === 'referrals' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('referrals')}
          className="rounded-xl font-bold"
        >
          <Gift className="w-4 h-4" />
          Referrals
        </Button>

        <Button
          type="button"
          variant={activeTab === 'danger-zone' ? 'destructive' : 'ghost'}
          size="sm"
          onClick={() => handleTabChange('danger-zone')}
          className={
            activeTab === 'danger-zone'
              ? 'rounded-xl font-bold'
              : 'rounded-xl font-bold text-destructive hover:text-destructive hover:bg-destructive/10'
          }
        >
          <AlertTriangle className="w-4 h-4" />
          Danger Zone
        </Button>
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
