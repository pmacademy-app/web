import React from 'react'
import { AchievementsService } from '@/lib/admin/achievements-service'
import { AchievementsWorkspace } from '@/components/admin/AchievementsWorkspace'

export const revalidate = 0

export default async function AdminAchievementsPage() {
  const { kpis, failed } = await AchievementsService.getOverview()

  return <AchievementsWorkspace kpis={kpis} loadFailed={failed} />
}