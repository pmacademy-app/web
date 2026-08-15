'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Users, Flame, Zap, ExternalLink } from 'lucide-react'
import { AdminPageShell } from './AdminPageShell'
import { AdminDataTable, Column } from './AdminDataTable'
import { AdminSearchInput } from './AdminSearchInput'
import { UserDetailDrawer } from './UserDetailDrawer'
import type { AdminUserOverview, AdminUserDetail } from '@/lib/admin/types'

interface UserManagementViewProps {
  initialUsers: AdminUserOverview[]
  initialSelectedUser: AdminUserDetail | null
}

export function UserManagementView({ initialUsers, initialSelectedUser }: UserManagementViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeUserId = searchParams.get('userId')
  const isDrawerOpen = Boolean(activeUserId && initialSelectedUser?.id === activeUserId)

  const handleInspectUser = (userId: string) => {
    router.push(`/admin/users?userId=${userId}`, { scroll: false })
  }

  const handleCloseDrawer = () => {
    router.push('/admin/users', { scroll: false })
  }

  const columns: Column<AdminUserOverview>[] = [
    {
      header: 'Learner / User',
      cell: (user) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-admin-surface-raised border border-admin-border flex items-center justify-center font-bold text-admin-accent">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-admin-fg">{user.fullName}</p>
            <p className="text-[11px] text-admin-fg-muted font-mono">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      cell: (user) => (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${user.isAdmin ? 'bg-admin-accent-soft text-admin-accent border border-admin-accent/25' : 'bg-admin-surface-raised text-admin-fg-muted border border-admin-border'}`}>
          {user.isAdmin ? 'Admin' : 'Learner'}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (user) => (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${user.isVerified ? 'bg-admin-success-soft text-admin-success border border-admin-success/25' : 'bg-admin-warning-soft text-admin-warning border border-admin-warning/25'}`}>
          {user.isVerified ? 'Verified' : 'Unverified'}
        </span>
      ),
    },
    {
      header: 'Level & XP',
      cell: (user) => (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-admin-info-soft text-admin-info font-bold text-[10px] border border-admin-info/25">
            Lvl {user.level}
          </span>
          <span className="text-admin-fg-muted font-mono flex items-center gap-1">
            <Zap className="w-3 h-3 text-admin-info" />
            {user.totalXp.toLocaleString()} XP
          </span>
        </div>
      ),
    },
    {
      header: 'Streak',
      cell: (user) => (
        <div className="flex items-center gap-1.5 text-admin-accent font-bold">
          <Flame className="w-3.5 h-3.5 fill-admin-accent/20" />
          <span>{user.streakDays}d</span>
        </div>
      ),
    },
    {
      header: 'Joined Date',
      cell: (user) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {new Date(user.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (user) => (
        <div className="flex items-center justify-end gap-2">
          {user.hasPublicPortfolio ? (
            <a
              href={`/p/${user.username || user.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-admin-success-soft hover:bg-admin-success/20 text-admin-success text-[11px] font-semibold border border-admin-success/25 transition-colors"
              title={`View ${user.fullName}'s public portfolio in a new tab`}
            >
              <ExternalLink className="w-3 h-3" />
              <span>View Portfolio</span>
            </a>
          ) : null}
          <button
            onClick={() => handleInspectUser(user.id)}
            className="px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors"
          >
            Inspect Profile
          </button>
        </div>
      ),
    },
  ]

  const [searchQuery, setSearchQuery] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<'all' | 'admin' | 'learner'>('all')

  const filteredUsers = React.useMemo(() => {
    return initialUsers.filter((u) => {
      const matchesSearch =
        !searchQuery.trim() ||
        u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesRole =
        roleFilter === 'all' ||
        (roleFilter === 'admin' && u.isAdmin) ||
        (roleFilter === 'learner' && !u.isAdmin)

      return matchesSearch && matchesRole
    })
  }, [initialUsers, searchQuery, roleFilter])

  return (
    <AdminPageShell
      title="User Management"
      description="Search registered learners, inspect level/XP velocity, and manage access roles."
      icon={Users}
      toolbar={
        <>
          <AdminSearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Search learners by name or email..."
            aria-label="Search learners"
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'learner')}
              className="px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-xs text-admin-fg-muted focus:outline-none focus:border-admin-accent/50"
            >
              <option value="all">All Roles</option>
              <option value="learner">Learners Only</option>
              <option value="admin">Admins Only</option>
            </select>
            <span className="text-xs text-admin-fg-subtle font-mono">
              {filteredUsers.length} of {initialUsers.length}
            </span>
          </div>
        </>
      }
    >
      <AdminDataTable
        columns={columns}
        data={filteredUsers}
        keyExtractor={(u) => u.id}
        emptyTitle="No learners found"
        emptyDescription="No user accounts match your active search or role filters."
      />

      {/* Slide-over User Detail Drawer */}
      <UserDetailDrawer
        user={initialSelectedUser}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </AdminPageShell>
  )
}
