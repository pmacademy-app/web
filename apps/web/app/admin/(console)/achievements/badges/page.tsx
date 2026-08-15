import React from 'react'
import { AchievementsService } from '@/lib/admin/achievements-service'
import { BadgesWorkspace } from '@/components/admin/BadgesWorkspace'

export const revalidate = 0

interface AdminBadgesPageProps {
  searchParams: Promise<{
    search?: string
    category?: string
    sort?: string
    sortDir?: string
    badge?: string
  }>
}

export default async function AdminBadgesPage({ searchParams }: AdminBadgesPageProps) {
  const params = await searchParams
  const search = params.search || ''
  const category = params.category || null
  const sortKey = params.sort === 'name' || params.sort === 'category' ? params.sort : 'awardCount'
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc'

  const [badgesResult, badgeDetail] = await Promise.all([
    AchievementsService.getBadges(search, category, sortKey, sortDir),
    params.badge ? AchievementsService.getBadgeDetail(params.badge) : Promise.resolve(null),
  ])

  return (
    <BadgesWorkspace
      initialBadges={badgesResult.badges}
      kpis={badgesResult.kpis}
      loadFailed={badgesResult.failed}
      initialSearch={search}
      initialCategory={category}
      initialSortKey={sortKey}
      initialSortDir={sortDir}
      selectedBadgeKey={params.badge || null}
      selectedBadgeDetail={badgeDetail}
    />
  )
}