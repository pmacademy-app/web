import React from 'react'
import { LeaderboardAdminService } from '@/lib/admin/leaderboard-admin-service'
import { AdminLeaderboardView } from '@/components/admin/AdminLeaderboardView'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminLeaderboardPage({ searchParams }: PageProps) {
  const params = await searchParams
  const search = typeof params.search === 'string' ? params.search : undefined
  const tier = typeof params.tier === 'string' ? params.tier : undefined

  const data = await LeaderboardAdminService.getLeaderboardData(undefined, search, tier)

  return <AdminLeaderboardView initialData={data} />
}
