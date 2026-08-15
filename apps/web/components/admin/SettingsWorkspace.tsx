'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AdminConfirmDialog } from './AdminConfirmDialog'
import { useAdminToast } from './admin-toast'
import { ProductSettingsSection } from './ProductSettingsSection'
import { LearningSettingsSection } from './LearningSettingsSection'
import { EmailSettingsSection } from './EmailSettingsSection'
import { NotificationSettingsSection } from './NotificationSettingsSection'
import { FeatureFlagsSection } from './FeatureFlagsSection'
import type {
  SettingsSectionKey,
  ProductSettings,
  LearningSettings,
  EmailSettings,
  NotificationSettings,
} from '@/lib/admin/types'
import type { FeatureFlagRecord } from '@/lib/notifications/feature-flags/types'

export interface SettingsDataMap {
  product: ProductSettings
  learning: LearningSettings
  email: EmailSettings
  notifications: NotificationSettings
  'feature-flags': FeatureFlagRecord[]
}

export interface SettingsWorkspaceProps {
  initialSection: SettingsSectionKey
  initialData: SettingsDataMap
}

const SECTIONS: Array<{ key: SettingsSectionKey; label: string; icon: React.ReactNode }> = [
  { key: 'product', label: 'Product', icon: <SettingsIcon /> },
  { key: 'learning', label: 'Learning', icon: <BookOpenIcon /> },
  { key: 'email', label: 'Email', icon: <MailIcon /> },
  { key: 'notifications', label: 'Notifications', icon: <BellIcon /> },
  { key: 'feature-flags', label: 'Feature Flags', icon: <FlagIcon /> },
]

function SettingsIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function BookOpenIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function MailIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function BellIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function FlagIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  )
}

export function SettingsWorkspace({
  initialSection,
  initialData,
}: SettingsWorkspaceProps) {
  const router = useRouter()
  const { toast } = useAdminToast()

  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(initialSection)
  const [sectionData, setSectionData] = useState<SettingsDataMap>(initialData)
  const [dirtySections, setDirtySections] = useState<Set<SettingsSectionKey>>(new Set())
  const [savingSection, setSavingSection] = useState<SettingsSectionKey | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    targetSection: SettingsSectionKey | null
    action: 'navigate' | 'leave'
  }>({ open: false, targetSection: null, action: 'navigate' })

  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtySections.size > 0) {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirtySections])

  const markDirty = useCallback((section: SettingsSectionKey) => {
    setDirtySections((prev) => new Set(prev).add(section))
  }, [])

  const markClean = useCallback((section: SettingsSectionKey) => {
    setDirtySections((prev) => {
      const next = new Set(prev)
      next.delete(section)
      return next
    })
  }, [])

  const updateProductData = useCallback(
    (partial: Partial<ProductSettings>) => {
      setSectionData((prev) => ({
        ...prev,
        product: { ...prev.product, ...partial },
      }))
      markDirty('product')
    },
    [markDirty]
  )

  const updateLearningData = useCallback(
    (partial: Partial<LearningSettings>) => {
      setSectionData((prev) => ({
        ...prev,
        learning: { ...prev.learning, ...partial },
      }))
      markDirty('learning')
    },
    [markDirty]
  )

  const updateEmailData = useCallback(
    (partial: Partial<EmailSettings>) => {
      setSectionData((prev) => ({
        ...prev,
        email: { ...prev.email, ...partial },
      }))
      markDirty('email')
    },
    [markDirty]
  )

  const updateNotificationData = useCallback(
    (partial: Partial<NotificationSettings>) => {
      setSectionData((prev) => ({
        ...prev,
        notifications: { ...prev.notifications, ...partial },
      }))
      markDirty('notifications')
    },
    [markDirty]
  )

  const handleSave = useCallback(
    async (section: Exclude<SettingsSectionKey, 'feature-flags'>) => {
      setSavingSection(section)
      try {
        const res = await fetch(`/api/admin/settings?section=${section}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sectionData[section]),
        })
        const data = await res.json()
        if (res.ok && data.success) {
          markClean(section)
          toast(`${section.charAt(0).toUpperCase() + section.slice(1)} settings saved.`, 'success')
        } else {
          toast(data.error || 'Failed to save settings.', 'error')
        }
      } catch {
        toast('Network error saving settings.', 'error')
      } finally {
        setSavingSection(null)
      }
    },
    [sectionData, markClean, toast]
  )

  const handleReset = useCallback(
    (section: Exclude<SettingsSectionKey, 'feature-flags'>) => {
      setSectionData((prev) => ({
        ...prev,
        [section]: initialData[section],
      }))
      markClean(section)
      toast('Changes reset.', 'info')
    },
    [initialData, markClean, toast]
  )

  const handleConfirmAction = useCallback(() => {
    if (confirmDialog.action === 'navigate' && confirmDialog.targetSection) {
      setActiveSection(confirmDialog.targetSection)
      router.push(`/admin/settings?section=${confirmDialog.targetSection}`)
    }
    setConfirmDialog({ open: false, targetSection: null, action: 'navigate' })
  }, [confirmDialog, router])

  const handleCancelConfirm = useCallback(() => {
    setConfirmDialog({ open: false, targetSection: null, action: 'navigate' })
  }, [])

  const handleTabClick = useCallback(
    (section: SettingsSectionKey) => {
      if (section === activeSection) return
      if (dirtySections.has(activeSection)) {
        setConfirmDialog({ open: true, targetSection: section, action: 'navigate' })
      } else {
        setActiveSection(section)
        router.push(`/admin/settings?section=${section}`)
      }
    },
    [activeSection, dirtySections, router]
  )

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <nav
        aria-label="Settings sections"
        className="border-b border-admin-border flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-admin-border"
        role="tablist"
      >
        {SECTIONS.map(({ key, label, icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeSection === key}
            aria-controls={`settings-panel-${key}`}
            id={`settings-tab-${key}`}
            onClick={() => handleTabClick(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors',
              'border-b-2 -mb-px',
              activeSection === key
                ? 'border-admin-accent text-admin-accent bg-admin-accent-soft/50'
                : 'border-transparent text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised/50'
            )}
          >
            {icon}
            {label}
            {dirtySections.has(key) && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-admin-warning-soft text-admin-warning">
                ●
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Active Section Panel */}
      <div
        id={`settings-panel-${activeSection}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeSection}`}
        className="animate-in fade-in-0 duration-150"
      >
        {activeSection === 'product' && (
          <ProductSettingsSection
            sectionKey="product"
            data={sectionData.product}
            onChange={updateProductData}
            onSave={() => handleSave('product')}
            onReset={() => handleReset('product')}
            isDirty={dirtySections.has('product')}
            isSaving={savingSection === 'product'}
            initialData={initialData.product}
          />
        )}
        {activeSection === 'learning' && (
          <LearningSettingsSection
            sectionKey="learning"
            data={sectionData.learning}
            onChange={updateLearningData}
            onSave={() => handleSave('learning')}
            onReset={() => handleReset('learning')}
            isDirty={dirtySections.has('learning')}
            isSaving={savingSection === 'learning'}
            initialData={initialData.learning}
          />
        )}
        {activeSection === 'email' && (
          <EmailSettingsSection
            sectionKey="email"
            data={sectionData.email}
            onChange={updateEmailData}
            onSave={() => handleSave('email')}
            onReset={() => handleReset('email')}
            isDirty={dirtySections.has('email')}
            isSaving={savingSection === 'email'}
            initialData={initialData.email}
          />
        )}
        {activeSection === 'notifications' && (
          <NotificationSettingsSection
            sectionKey="notifications"
            data={sectionData.notifications}
            onChange={updateNotificationData}
            onSave={() => handleSave('notifications')}
            onReset={() => handleReset('notifications')}
            isDirty={dirtySections.has('notifications')}
            isSaving={savingSection === 'notifications'}
            initialData={initialData.notifications}
          />
        )}
        {activeSection === 'feature-flags' && (
          <FeatureFlagsSection
            data={sectionData['feature-flags']}
            isSaving={savingSection !== null}
          />
        )}
      </div>

      {/* Confirm Dialog */}
      <AdminConfirmDialog
        open={confirmDialog.open}
        onOpenChange={handleCancelConfirm}
        title={confirmDialog.action === 'navigate' ? 'Unsaved changes' : 'Leave page?'}
        description={
          confirmDialog.action === 'navigate'
            ? 'You have unsaved changes in this section. Do you want to leave without saving?'
            : 'You have unsaved changes. Are you sure you want to leave this page?'
        }
        confirmLabel={confirmDialog.action === 'navigate' ? 'Leave without saving' : 'Leave'}
        cancelLabel="Stay"
        destructive={confirmDialog.action === 'navigate'}
        onConfirm={handleConfirmAction}
        onCancel={handleCancelConfirm}
      />
    </div>
  )
}