'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Users, Flame, Zap, ExternalLink } from 'lucide-react'
import { AdminPageHeader } from './AdminPageHeader'
import { AdminDataTable, Column } from './AdminDataTable'
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
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-white">{user.fullName}</p>
            <p className="text-[11px] text-slate-400 font-mono">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      cell: (user) => (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${user.isAdmin ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
          {user.isAdmin ? 'Admin' : 'Learner'}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (user) => (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${user.isVerified ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
          {user.isVerified ? 'Verified' : 'Unverified'}
        </span>
      ),
    },
    {
      header: 'Level & XP',
      cell: (user) => (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold text-[10px] border border-purple-500/20">
            Lvl {user.level}
          </span>
          <span className="text-slate-300 font-mono flex items-center gap-1">
            <Zap className="w-3 h-3 text-purple-400" />
            {user.totalXp.toLocaleString()} XP
          </span>
        </div>
      ),
    },
    {
      header: 'Streak',
      cell: (user) => (
        <div className="flex items-center gap-1.5 text-amber-400 font-bold">
          <Flame className="w-3.5 h-3.5 fill-amber-400/20" />
          <span>{user.streakDays}d</span>
        </div>
      ),
    },
    {
      header: 'Joined Date',
      cell: (user) => (
        <span className="text-slate-400 font-mono text-[11px]">
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
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-semibold border border-emerald-500/20 transition-colors"
              title={`View ${user.fullName}'s public portfolio in a new tab`}
            >
              <ExternalLink className="w-3 h-3" />
              <span>View Portfolio</span>
            </a>
          ) : null}
          <button
            onClick={() => handleInspectUser(user.id)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition-colors"
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
    <div className="space-y-8">
      <AdminPageHeader
        title="User Management"
        description="Search registered learners, inspect level/XP velocity, and manage access roles."
        icon={Users}
        iconColor="text-amber-400"
      />

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search learners by name or email..."
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'learner')}
            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-amber-500/50"
          >
            <option value="all">All Roles</option>
            <option value="learner">Learners Only</option>
            <option value="admin">Admins Only</option>
          </select>
          <span className="text-xs text-slate-500 font-mono">
            {filteredUsers.length} of {initialUsers.length}
          </span>
        </div>
      </div>

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
    </div>
  )
}
