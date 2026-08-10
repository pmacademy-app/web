'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Users, Flame, Zap } from 'lucide-react'
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
        <button
          onClick={() => handleInspectUser(user.id)}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition-colors"
        >
          Inspect Profile
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="User Management"
        description="Search registered learners, inspect level/XP velocity, and manage access roles."
        icon={Users}
        iconColor="text-amber-400"
      />

      <AdminDataTable
        columns={columns}
        data={initialUsers}
        keyExtractor={(u) => u.id}
        emptyTitle="No learners registered"
        emptyDescription="No user accounts match your search filters."
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
