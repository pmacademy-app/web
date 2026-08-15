'use client'

import React, { useState } from 'react'
import { Zap, Flame, Award, BookOpen, ExternalLink, Loader2 } from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminDrawer } from './AdminDrawer'
import { AdminConfirmDialog } from './AdminConfirmDialog'
import { UserRoleToggle } from './UserRoleToggle'
import { DeveloperActionsSection } from './DeveloperActionsSection'
import { useAdminToast } from './admin-toast'
import type { AdminUserDetail } from '@/lib/admin/types'

interface UserDetailDrawerProps {
  user: AdminUserDetail | null
  isOpen: boolean
  onClose: () => void
}

type ConfirmAction = 'reset' | 'delete' | null

export function UserDetailDrawer({ user, isOpen, onClose }: UserDetailDrawerProps) {
  const { toast } = useAdminToast()
  const [pendingAction, setPendingAction] = useState<ConfirmAction>(null)
  const [busy, setBusy] = useState<ConfirmAction>(null)

  if (!user) return null

  const runAction = async (action: 'reset' | 'delete') => {
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
        title={user.fullName}
        description={user.email}
        size="lg"
      >
        {/* Role + quick stats */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-admin-border">
          <UserRoleToggle
            userId={user.id}
            initialIsAdmin={user.isAdmin}
            userEmail={user.email}
          />
          <AdminStatusBadge status={user.isVerified ? 'published' : 'archived'} label={user.isVerified ? 'Verified' : 'Unverified'} />
        </div>

        {/* KPI Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <AdminKpiCard
            title="Level & Total XP"
            value={`Lvl ${user.level}`}
            subtitle={`${user.totalXp.toLocaleString()} Total XP`}
            icon={Zap}
            iconColor="text-admin-info"
          />
          <AdminKpiCard
            title="Active Streak"
            value={`${user.streakDays}d`}
            subtitle="Current streak days"
            icon={Flame}
            iconColor="text-admin-accent"
          />
          <AdminKpiCard
            title="Lessons Completed"
            value={user.lessonsCompleted}
            subtitle="Curriculum lessons"
            icon={BookOpen}
            iconColor="text-admin-success"
          />
          <AdminKpiCard
            title="Certificates Issued"
            value={user.certificatesCount}
            subtitle="Signed credentials"
            icon={Award}
            iconColor="text-admin-info"
          />
        </div>

        {/* Account Details Breakdown */}
        <div className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border space-y-3">
          <h3 className="text-xs font-bold text-admin-fg-muted uppercase tracking-wider">
            Account Profile & Metadata
          </h3>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded bg-admin-surface border border-admin-border flex justify-between items-center">
              <span className="text-admin-fg-muted">User ID</span>
              <span className="font-mono text-admin-fg text-[11px] select-all">{user.id}</span>
            </div>
            <div className="p-2.5 rounded bg-admin-surface border border-admin-border flex justify-between items-center">
              <span className="text-admin-fg-muted">Account Goal</span>
              <span className="text-admin-fg">{user.goal || 'General Skill Upgrade'}</span>
            </div>
            <div className="p-2.5 rounded bg-admin-surface border border-admin-border flex justify-between items-center">
              <span className="text-admin-fg-muted">Public Portfolio</span>
              <div className="flex items-center gap-2">
                <AdminStatusBadge
                  status={user.hasPublicPortfolio ? 'published' : 'archived'}
                  label={user.hasPublicPortfolio ? 'Enabled' : 'Disabled'}
                />
                {user.hasPublicPortfolio && (
                  <a
                    href={`/p/${user.username || user.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-admin-success hover:underline font-bold"
                  >
                    <span>View</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded bg-admin-surface border border-admin-border flex justify-between items-center">
              <span className="text-admin-fg-muted">Joined Date</span>
              <span className="font-mono text-admin-fg">
                {new Date(user.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Admin Operational Controls */}
        <div className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border space-y-3">
          <h3 className="text-xs font-bold text-admin-fg-muted uppercase tracking-wider">
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

            {user.hasPublicPortfolio ? (
              <a
                href={`/p/${user.username || user.id}`}
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

        {/* Developer / Admin Operational Actions */}
        <div className="pt-2">
          <DeveloperActionsSection
            targetUserId={user.id}
            targetUserEmail={user.email}
          />
        </div>
      </AdminDrawer>

      {/* Reset confirmation */}
      <AdminConfirmDialog
        open={pendingAction === 'reset'}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
        title="Reset user progress?"
        description={`This will reset all curriculum progress, XP, and streak data for ${user.email}. This action cannot be undone.`}
        confirmLabel="Reset Progress"
        destructive
        onConfirm={() => runAction('reset')}
        onCancel={() => setPendingAction(null)}
      />

      {/* Delete confirmation */}
      <AdminConfirmDialog
        open={pendingAction === 'delete'}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
        title="Delete user account?"
        description={`DANGER: This will permanently remove all account data, progress, and certificates for ${user.email}.`}
        confirmLabel="Delete Account"
        destructive
        onConfirm={() => runAction('delete')}
        onCancel={() => setPendingAction(null)}
      />
    </>
  )
}