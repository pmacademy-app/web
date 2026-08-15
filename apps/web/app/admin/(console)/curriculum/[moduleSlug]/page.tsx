import React from 'react'
import { notFound } from 'next/navigation'
import { CurriculumService } from '@/lib/admin/curriculum-service'
import { AdminModuleDetailView } from '@/components/admin/AdminModuleDetailView'

export const revalidate = 0

interface PageProps {
  params: Promise<{ moduleSlug: string }>
}

export default async function AdminModuleDetailPage({ params }: PageProps) {
  const { moduleSlug } = await params
  const { module, failed } = await CurriculumService.getModuleDetail(moduleSlug)
  if (!module) notFound()

  return <AdminModuleDetailView module={module} initialLoadFailed={failed} />
}