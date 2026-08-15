'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Users, Flame, Zap, ExternalLink, UserPlus, Activity, TrendingUp, AlertTriangle } from 'lucide-react'
import { AdminPageShell } from './AdminPageShell'
import { AdminDataTable, Column, TableSort } from './AdminDataTable'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminPagination } from './AdminPagination'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminProgressBar } from './AdminProgressBar'
import { AdminEmptyState } from './AdminEmptyState'
import { UsersFilterBar } from './UsersFilterBar'
import { UserDetailDrawer } from './UserDetailDrawer'
import { serializeUserFilters } from '@/lib/admin/users-aggregation'
import type { AdminUserOverview, AdminUserDetail, AdminUserFilters } from '@/lib/admin/types'

export interface UsersWorkspaceKpis {
  totalUsers: number
  activeLearners30d: number
  newSignups24h: number
  avgCourseProgressPct: number
}

interface UsersWorkspaceProps {
  initialUsers: AdminUserOverview[]
  initialTotal: number
  /** True when the server-side list query failed (renders an error state). */
  initialLoadFailed?: boolean
  initialSelectedUser: AdminUserDetail | null
  initialSearch: string
  initialPage: number
  initialFilters: AdminUserFilters
  kpis: UsersWorkspaceKpis
}

const PAGE_SIZE = 25

export function UsersWorkspace({
  initialUsers,
  initialTotal,
  initialLoadFailed = false,
  initialSelectedUser,
  initialSearch,
  initialPage,
  initialFilters,
  kpis,
}: UsersWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeUserId = searchParams.get('userId')
  const isDrawerOpen = Boolean(activeUserId)

  const pushParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    router.push(`/admin/users${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false })
  }

  const handleSearch = (value: string) => pushParams({ search: value || undefined, page: undefined })

  const handleFiltersChange = (filters: AdminUserFilters) => {
    pushParams({ ...serializeUserFilters(filters), page: undefined })
  }

  const handleClearFilters = () => {
    const next = new URLSearchParams(searchParams.toString())
    for (const key of [
      'verification',
      'role',
      'activity',
      'progress',
      'minLevel',
      'joinedFrom',
      'joinedTo',
      'activeFrom',
      'activeTo',
      'sort',
      'sortDir',
    ]) {
      next.delete(key)
    }
    next.delete('page')
    router.push(`/admin/users${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false })
  }

  const handleSortChange = (sort: TableSort) => {
    pushParams({ sort: sort.key, sortDir: sort.dir, page: undefined })
  }

  const handlePageChange = (page: number) => pushParams({ page: String(page) })

  const handleInspectUser = (userId: string) => {
    // Preserve search/filters/sort/page so closing the drawer returns the
    // admin to the exact list context they were in (spec §58 — "The admin
    // should not lose their place in the underlying table").
    const next = new URLSearchParams(searchParams.toString())
    next.set('userId', userId)
    router.push(`/admin/users?${next.toString()}`, { scroll: false })
  }

  const handleCloseDrawer = () => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('userId')
    router.push(`/admin/users${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false })
  }

  const sort: TableSort | null =
    initialFilters.sort && initialFilters.sortDir
      ? { key: initialFilters.sort, dir: initialFilters.sortDir }
      : null

  const columns: Column<AdminUserOverview>[] = [
    {
      header: 'User',
      cell: (user) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-admin-surface-raised border border-admin-border flex items-center justify-center font-bold text-admin-accent shrink-0">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-admin-fg truncate">{user.fullName}</p>
            <p className="text-[11px] text-admin-fg-muted font-mono truncate">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (user) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <AdminStatusBadge
            status={user.isVerified ? 'published' : 'archived'}
            label={user.isVerified ? 'Verified' : 'Unverified'}
          />
          <AdminStatusBadge status={user.isAdmin ? 'admin' : 'learner'} />
        </div>
      ),
    },
    {
      header: 'Progress',
      sortable: true,
      sortKey: 'progressPct',
      cell: (user) => (
        <div className="w-28">
          <AdminProgressBar value={user.progressPct} showValue={false} />
        </div>
      ),
    },
    {
      header: 'Level',
      sortable: true,
      sortKey: 'level',
      cell: (user) => (
        <span className="px-2 py-0.5 rounded bg-admin-info-soft text-admin-info font-bold text-[10px] border border-admin-info/25">
          Lvl {user.level}
        </span>
      ),
    },
    {
      header: 'XP',
      sortable: true,
      sortKey: 'totalXp',
      cell: (user) => (
        <span className="text-admin-fg-muted font-mono flex items-center gap-1">
          <Zap className="w-3 h-3 text-admin-info" />
          {user.totalXp.toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Streak',
      sortable: true,
      sortKey: 'streakDays',
      cell: (user) => (
        <div className="flex items-center gap-1.5 text-admin-accent font-bold">
          <Flame className="w-3.5 h-3.5 fill-admin-accent/20" />
          <span>{user.streakDays}d</span>
        </div>
      ),
    },
    {
      header: 'Last Active',
      sortable: true,
      sortKey: 'lastActiveAt',
      cell: (user) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      header: 'Joined',
      sortable: true,
      sortKey: 'createdAt',
      cell: (user) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {new Date(user.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ]

  const totalPages = Math.max(1, Math.ceil(initialTotal / PAGE_SIZE))

  return (
    <AdminPageShell
      title="Users"
      description="Search, inspect and manage learners."
      icon={Users}
      kpis={
        <>
          <AdminKpiCard
            title="Total Users"
            value={kpis.totalUsers.toLocaleString()}
            subtitle="Registered accounts"
            icon={Users}
            iconColor="text-admin-accent"
          />
          <AdminKpiCard
            title="Active Learners"
            value={kpis.activeLearners30d.toLocaleString()}
            subtitle="Earned XP in last 30 days"
            icon={Activity}
            iconColor="text-admin-success"
          />
          <AdminKpiCard
            title="New Signups"
            value={kpis.newSignups24h.toLocaleString()}
            subtitle="Last 24 hours"
            icon={UserPlus}
            iconColor="text-admin-info"
          />
          <AdminKpiCard
            title="Avg Course Progress"
            value={`${kpis.avgCourseProgressPct.toFixed(1)}%`}
            subtitle="Across learners with progress"
            icon={TrendingUp}
            iconColor="text-admin-warning"
          />
        </>
      }
      toolbar={
        <>
          <AdminSearchInput
            value={initialSearch}
            onValueChange={handleSearch}
            placeholder="Search users by name or email..."
            aria-label="Search users"
            className="flex-1 min-w-52"
          />
          <span className="text-xs text-admin-fg-subtle font-mono shrink-0">
            {initialTotal.toLocaleString()} users
          </span>
        </>
      }
    >
      {initialLoadFailed ? (
        <AdminEmptyState
          icon={AlertTriangle}
          title="Unable to load this information"
          description="Something went wrong while loading the user list. Try again, or check that the database is reachable."
          action={
            <button
              type="button"
              onClick={() => router.refresh()}
              className="px-3 py-1.5 rounded-lg bg-admin-accent text-admin-accent-fg text-xs font-bold hover:bg-admin-accent/90 transition-colors cursor-pointer"
            >
              Try Again
            </button>
          }
        />
      ) : (
        <>
          <UsersFilterBar
            filters={initialFilters}
            onFiltersChange={handleFiltersChange}
            onClear={handleClearFilters}
          />

          <AdminDataTable
            columns={columns}
            data={initialUsers}
            keyExtractor={(u) => u.id}
            sort={sort}
            onSortChange={handleSortChange}
            onRowClick={(u) => handleInspectUser(u.id)}
            rowAriaLabel={(u) => `Open details for ${u.fullName}`}
            rowActions={(user) => (
              <div className="flex items-center justify-end gap-2">
                {user.hasPublicPortfolio ? (
                  <a
                    href={`/p/${user.username || user.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-admin-success-soft hover:bg-admin-success/20 text-admin-success text-[11px] font-semibold border border-admin-success/25 transition-colors"
                    title={`View ${user.fullName}'s public portfolio in a new tab`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Portfolio</span>
                  </a>
                ) : null}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleInspectUser(user.id)
                  }}
                  className="px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors cursor-pointer"
                >
                  Inspect
                </button>
              </div>
            )}
            emptyTitle="No users found"
            emptyDescription="No user accounts match your active search or filters."
          />

          <AdminPagination
            currentPage={initialPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            pageSize={PAGE_SIZE}
            totalItems={initialTotal}
          />
        </>
      )}

      <UserDetailDrawer
        userId={activeUserId}
        user={initialSelectedUser}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </AdminPageShell>
  )
}