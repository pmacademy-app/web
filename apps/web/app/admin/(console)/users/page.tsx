import React from 'react'
import { AdminConsoleService } from '@/lib/admin/service'
import { UserManagementView } from '@/components/admin/UserManagementView'
import type { AdminUserDetail } from '@/lib/admin/types'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<{ userId?: string }>
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const { userId } = await searchParams
  const users = await AdminConsoleService.getUsersOverview(50)

  let selectedUserDetail: AdminUserDetail | null = null
  if (userId) {
    selectedUserDetail = await AdminConsoleService.getUserDetail(userId)
  }

  return (
    <UserManagementView
      initialUsers={users}
      initialSelectedUser={selectedUserDetail}
    />
  )
}
