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
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-800 text-slate-100 shadow-2xl h-full overflow-y-auto z-10 flex flex-col p-6 space-y-6 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {user.fullName}
              </h2>
              <p className="text-xs text-slate-400 font-mono">{user.email}</p>
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
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
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
            iconColor="text-purple-400"
          />
          <AdminKpiCard
            title="Active Streak"
            value={`${user.streakDays}d`}
            subtitle="Current streak days"
            icon={Flame}
            iconColor="text-amber-400"
          />
          <AdminKpiCard
            title="Lessons Completed"
            value={user.lessonsCompleted}
            subtitle="Curriculum lessons"
            icon={BookOpen}
            iconColor="text-emerald-400"
          />
          <AdminKpiCard
            title="Certificates Issued"
            value={user.certificatesCount}
            subtitle="Signed credentials"
            icon={Award}
            iconColor="text-blue-400"
          />
        </div>

        {/* Account Details Breakdown */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Account Profile & Metadata
          </h3>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800/80 flex justify-between items-center">
              <span className="text-slate-400">User ID</span>
              <span className="font-mono text-slate-200 text-[11px] select-all">{user.id}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800/80 flex justify-between items-center">
              <span className="text-slate-400">Account Goal</span>
              <span className="text-slate-200">{user.goal || 'General Skill Upgrade'}</span>
            </div>
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800/80 flex justify-between items-center">
              <span className="text-slate-400">Public Portfolio</span>
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
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline font-bold"
                  >
                    <span>View</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800/80 flex justify-between items-center">
              <span className="text-slate-400">Email Verification</span>
              <div className="flex items-center gap-2">
                <AdminStatusBadge
                  status={user.isVerified ? 'published' : 'archived'}
                  label={user.isVerified ? 'Verified' : 'Unverified'}
                />
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800/80 flex justify-between items-center">
              <span className="text-slate-400">Joined Date</span>
              <span className="font-mono text-slate-200">
                {new Date(user.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Admin Operational Controls: Progress Reset & Controlled User Deletion */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
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
              className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold hover:bg-blue-500/20 transition-colors cursor-pointer"
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
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold hover:bg-amber-500/20 transition-colors cursor-pointer"
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
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              Delete User Account
            </button>

            {user.hasPublicPortfolio ? (
              <a
                href={`/p/${user.username || user.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold hover:bg-emerald-500/20 transition-colors"
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
