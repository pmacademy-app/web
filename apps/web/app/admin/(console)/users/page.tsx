import React from 'react'
import { AdminConsoleService } from '@/lib/admin/service'
import { UsersWorkspace } from '@/components/admin/UsersWorkspace'
import { parseUserFilters } from '@/lib/admin/users-aggregation'
import { getUserProofSummary, type AdminUserProofSummary } from '@/lib/admin/user-proof-service'
import type { AdminUserDetail } from '@/lib/admin/types'

export const revalidate = 0

const PAGE_SIZE = 25

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const get = (key: string): string | undefined => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const search = get('search') || ''
  const page = Math.max(1, parseInt(get('page') || '1', 10) || 1)
  const userId = get('userId')
  const filters = parseUserFilters(params)

  const [{ users, total, failed }, kpis] = await Promise.all([
    AdminConsoleService.getUsersOverview(PAGE_SIZE, search, filters, page),
    AdminConsoleService.getUsersKpis(),
  ])

  let selectedUserDetail: AdminUserDetail | null = null
  // Proof state is a separate loader (Admin R6 / C3); null means it failed and the drawer says so.
  let selectedUserProof: AdminUserProofSummary | null = null
  if (userId) {
    ;[selectedUserDetail, selectedUserProof] = await Promise.all([
      AdminConsoleService.getUserDetailData(userId),
      getUserProofSummary(userId),
    ])
  }

  return (
    <UsersWorkspace
      initialUsers={users}
      initialTotal={total}
      initialLoadFailed={Boolean(failed)}
      initialSelectedUser={selectedUserDetail}
      initialProof={selectedUserProof}
      initialSearch={search}
      initialPage={page}
      initialFilters={filters}
      kpis={kpis}
    />
  )
}