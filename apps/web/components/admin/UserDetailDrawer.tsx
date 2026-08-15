'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Flame, BookOpen, Award, ExternalLink, Loader2, ShieldCheck, UserX } from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminDrawer } from './AdminDrawer'
import { AdminConfirmDialog } from './AdminConfirmDialog'
import { AdminAvatar } from './AdminAvatar'
import { AdminEmptyState } from './AdminEmptyState'
import { UserRoleToggle } from './UserRoleToggle'
import { DeveloperActionsSection } from './DeveloperActionsSection'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { USER_DETAIL_TABS, UserTabPanels, type UserDetailTabKey } from './UserTabPanels'
import { useAdminToast } from './admin-toast'
import type { AdminUserDetail } from '@/lib/admin/types'

interface UserDetailDrawerProps {
  /** Active user id from the URL (`?userId=`). Null when the drawer is closed. */
  userId: string | null
  /** Server-fetched detail payload. May lag behind `userId` during navigation. */
  user: AdminUserDetail | null
  isOpen: boolean
  onClose: () => void
}

type ConfirmAction = 'reset' | 'delete' | null

function DrawerSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-admin-surface-raised border border-admin-border" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-40 rounded bg-admin-surface-raised" />
          <div className="h-3 w-56 rounded bg-admin-surface-raised" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-admin-surface-raised border border-admin-border" />
        ))}
      </div>
      <div className="h-8 w-full rounded-lg bg-admin-surface-raised" />
      <div className="h-64 rounded-xl bg-admin-surface-raised border border-admin-border" />
    </div>
  )
}

export function UserDetailDrawer({ userId, user, isOpen, onClose }: UserDetailDrawerProps) {
  const { toast } = useAdminToast()
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<ConfirmAction>(null)
  const [busy, setBusy] = useState<ConfirmAction>(null)
  const [activeTab, setActiveTab] = useState<UserDetailTabKey>('overview')
  const [prevUserId, setPrevUserId] = useState(userId)

  // Reset to the Overview tab when inspecting a different user (derived state
  // during render — the recommended pattern for resetting on prop change).
  if (userId !== prevUserId) {
    setPrevUserId(userId)
    setActiveTab('overview')
  }

  const dataReady = Boolean(user && userId && user.id === userId)
  const notFound = Boolean(userId && !user)

  const runAction = async (action: 'reset' | 'delete') => {
    if (!user) return
    setPendingAction(null)
    setBusy(action)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'reset' ? JSON.stringify({ action: 'reset_progress' }) : undefined,
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(
          action === 'delete'
            ? `Deleted user account for ${user.email}.`
            : `Reset progress for ${user.email}.`,
          'success'
        )
        onClose()
        // Re-fetch the server-rendered list so the deleted user / reset
        // progress is reflected in the table immediately.
        router.refresh()
      } else {
        toast(data.error || (action === 'delete' ? 'Failed to delete account.' : 'Failed to reset progress.'), 'error')
      }
    } catch {
      toast(action === 'delete' ? 'Network error deleting account.' : 'Network error resetting progress.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const resendVerification = async () => {
    if (!user) return
    try {
      const res = await fetch('/api/admin/emails/production-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: user.id,
          templateKey: 'auth.verify_email',
          confirmProductionSend: true,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast(`Verification email resent to ${user.email}.`, 'success')
      } else {
        toast(data.error || 'Failed to resend verification email.', 'error')
      }
    } catch {
      toast('Network error resending verification email.', 'error')
    }
  }

  return (
    <>
      <AdminDrawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={dataReady ? user!.fullName : 'User details'}
        description={dataReady ? user!.email : 'Loading profile…'}
        size="lg"
      >
        {!dataReady ? (
          notFound ? (
            <AdminEmptyState
              icon={UserX}
              title="User not found"
              description="No account matches this user id. It may have been deleted or the link is invalid."
            />
          ) : (
            <DrawerSkeleton />
          )
        ) : (
          <>
            {/* Header: avatar + role + verification */}
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-admin-border">
              <div className="flex items-center gap-3 min-w-0">
                <AdminAvatar name={user!.fullName} size="lg" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-admin-fg truncate">{user!.fullName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <AdminStatusBadge
                      status={user!.isVerified ? 'published' : 'archived'}
                      label={user!.isVerified ? 'Verified' : 'Unverified'}
                    />
                    <AdminStatusBadge status={user!.isAdmin ? 'admin' : 'learner'} />
                  </div>
                </div>
              </div>
              <UserRoleToggle
                userId={user!.id}
                initialIsAdmin={user!.isAdmin}
                userEmail={user!.email}
              />
            </div>

            {/* KPI summary */}
            <div className="grid grid-cols-2 gap-3">
              <AdminKpiCard
                title="Level"
                value={user!.kpis.level}
                subtitle={`${user!.kpis.xp.toLocaleString()} Total XP`}
                icon={Zap}
                iconColor="text-admin-info"
              />
              <AdminKpiCard
                title="Current Streak"
                value={`${user!.kpis.streakDays}d`}
                subtitle="Consecutive active days"
                icon={Flame}
                iconColor="text-admin-accent"
              />
              <AdminKpiCard
                title="Lessons Completed"
                value={user!.learning.lessonsCompleted}
                subtitle={`of ${user!.learning.lessonsTotal} curriculum lessons`}
                icon={BookOpen}
                iconColor="text-admin-success"
              />
              <AdminKpiCard
                title="Course Progress"
                value={`${user!.kpis.courseProgressPct.toFixed(1)}%`}
                subtitle="Curriculum completion"
                icon={Award}
                iconColor="text-admin-warning"
              />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UserDetailTabKey)}>
              <TabsList className="w-full justify-start overflow-x-auto">
                {USER_DETAIL_TABS.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <TabsTrigger key={tab.key} value={tab.key} className="shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </TabsTrigger>
                  )
                })}
              </TabsList>

              {USER_DETAIL_TABS.map((tab) => (
                <TabsContent key={tab.key} value={tab.key} className="pt-4">
                  {activeTab === tab.key && <UserTabPanels user={user!} activeTab={tab.key} />}
                </TabsContent>
              ))}
            </Tabs>

            {/* Admin operational controls (Account tab footer) */}
            <div className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border space-y-3">
              <h3 className="text-xs font-bold text-admin-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-admin-accent" />
                Admin Controlled User Management
              </h3>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={busy !== null}
                  className="px-3 py-1.5 rounded-lg bg-admin-info-soft text-admin-info border border-admin-info/25 font-bold hover:bg-admin-info/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Resend Verification Email
                </button>

                <button
                  type="button"
                  onClick={() => setPendingAction('reset')}
                  disabled={busy !== null}
                  className="px-3 py-1.5 rounded-lg bg-admin-warning-soft text-admin-warning border border-admin-warning/25 font-bold hover:bg-admin-warning/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Reset User Progress
                </button>

                <button
                  type="button"
                  onClick={() => setPendingAction('delete')}
                  disabled={busy !== null}
                  className="px-3 py-1.5 rounded-lg bg-admin-danger-soft text-admin-danger border border-admin-danger/25 font-bold hover:bg-admin-danger/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Delete User Account
                </button>

                {user!.hasPublicPortfolio ? (
                  <a
                    href={`/p/${user!.username || user!.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-admin-success-soft text-admin-success border border-admin-success/25 font-bold hover:bg-admin-success/20 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View Portfolio</span>
                  </a>
                ) : null}
              </div>
              {busy && (
                <p className="flex items-center gap-1.5 text-[11px] text-admin-fg-muted">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {busy === 'delete' ? 'Deleting account…' : 'Resetting progress…'}
                </p>
              )}
            </div>

            {/* Developer / QA actions */}
            <div className="pt-2">
              <DeveloperActionsSection
                targetUserId={user!.id}
                targetUserEmail={user!.email}
              />
            </div>
          </>
        )}
      </AdminDrawer>

      {/* Reset confirmation */}
      <AdminConfirmDialog
        open={pendingAction === 'reset' && dataReady}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
        title="Reset user progress?"
        description={`This will reset all curriculum progress, XP, and streak data for ${user?.email}. This action cannot be undone.`}
        confirmLabel="Reset Progress"
        destructive
        onConfirm={() => runAction('reset')}
        onCancel={() => setPendingAction(null)}
      />

      {/* Delete confirmation */}
      <AdminConfirmDialog
        open={pendingAction === 'delete' && dataReady}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
        title="Delete user account?"
        description={`DANGER: This will permanently remove all account data, progress, and certificates for ${user?.email}.`}
        confirmLabel="Delete Account"
        destructive
        onConfirm={() => runAction('delete')}
        onCancel={() => setPendingAction(null)}
      />
    </>
  )
}