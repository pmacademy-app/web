'use client'

import React from 'react'
import { X, Zap, Flame, Award, BookOpen, ExternalLink } from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminStatusBadge } from './AdminStatusBadge'
import { UserRoleToggle } from './UserRoleToggle'
import { DeveloperActionsSection } from './DeveloperActionsSection'
import type { AdminUserDetail } from '@/lib/admin/types'

interface UserDetailDrawerProps {
  user: AdminUserDetail | null
  isOpen: boolean
  onClose: () => void
}

export function UserDetailDrawer({ user, isOpen, onClose }: UserDetailDrawerProps) {
  if (!isOpen || !user) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-admin-bg/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-2xl bg-admin-surface border-l border-admin-border text-admin-fg shadow-2xl h-full overflow-y-auto z-10 flex flex-col p-6 space-y-6 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-admin-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-admin-accent-soft border border-admin-accent/25 text-admin-accent flex items-center justify-center font-bold text-lg">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-admin-fg flex items-center gap-2">
                {user.fullName}
              </h2>
              <p className="text-xs text-admin-fg-muted font-mono">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <UserRoleToggle
              userId={user.id}
              initialIsAdmin={user.isAdmin}
              userEmail={user.email}
            />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg transition-colors"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
              <span className="text-admin-fg-muted">Email Verification</span>
              <div className="flex items-center gap-2">
                <AdminStatusBadge
                  status={user.isVerified ? 'published' : 'archived'}
                  label={user.isVerified ? 'Verified' : 'Unverified'}
                />
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

        {/* Admin Operational Controls: Progress Reset & Controlled User Deletion */}
        <div className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border space-y-3">
          <h3 className="text-xs font-bold text-admin-fg-muted uppercase tracking-wider">
            Admin Controlled User Management
          </h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={async () => {
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
                    alert(`Verification email resent successfully to ${user.email}.`)
                  } else {
                    alert(data.error || 'Failed to resend verification email.')
                  }
                } catch {
                  alert('Network error resending verification email.')
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-admin-info-soft text-admin-info border border-admin-info/25 font-bold hover:bg-admin-info/20 transition-colors cursor-pointer"
            >
              Resend Verification Email
            </button>

            <button
              type="button"
              onClick={async () => {
                if (confirm(`Reset all curriculum progress, XP, and streak data for ${user.email}? This action cannot be undone.`)) {
                  try {
                    const res = await fetch(`/api/admin/users/${user.id}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'reset_progress' }),
                    })
                    const data = await res.json()
                    if (res.ok && data.success) {
                      alert(`Successfully reset user progress for ${user.email}.`)
                      onClose()
                    } else {
                      alert(data.error || 'Failed to reset progress.')
                    }
                  } catch {
                    alert('Network error resetting progress.')
                  }
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-admin-warning-soft text-admin-warning border border-admin-warning/25 font-bold hover:bg-admin-warning/20 transition-colors cursor-pointer"
            >
              Reset User Progress
            </button>

            <button
              type="button"
              onClick={async () => {
                if (confirm(`DANGER: Delete user account for ${user.email}? This will permanently remove all account data, progress, and certificates.`)) {
                  try {
                    const res = await fetch(`/api/admin/users/${user.id}`, {
                      method: 'DELETE',
                    })
                    const data = await res.json()
                    if (res.ok && data.success) {
                      alert(`Successfully deleted user account for ${user.email}.`)
                      onClose()
                    } else {
                      alert(data.error || 'Failed to delete account.')
                    }
                  } catch {
                    alert('Network error deleting user account.')
                  }
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-admin-danger-soft text-admin-danger border border-admin-danger/25 font-bold hover:bg-admin-danger/20 transition-colors cursor-pointer"
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
        </div>

        {/* Developer / Admin Operational Actions */}
        <div className="pt-2">
          <DeveloperActionsSection
            targetUserId={user.id}
            targetUserEmail={user.email}
          />
        </div>
      </div>
    </div>
  )
}
