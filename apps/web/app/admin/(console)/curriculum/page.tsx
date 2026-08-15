import React from 'react'
import { CurriculumService } from '@/lib/admin/curriculum-service'
import { AdminCurriculumWorkspace } from '@/components/admin/AdminCurriculumWorkspace'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminCurriculumPage({ searchParams }: PageProps) {
  const params = await searchParams
  const search = typeof params.search === 'string' ? params.search : ''

  const { overview, failed } = await CurriculumService.getCurriculumOverview()

  return (
    <AdminCurriculumWorkspace
      initialModules={overview.modules}
      initialKpis={overview.kpis}
      initialSearch={search}
      initialLoadFailed={failed}
      totalLearners={overview.totalLearners}
      totalLessonsCompleted={overview.totalLessonsCompleted}
    />
  )
}