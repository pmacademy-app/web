import React from 'react'
import { notFound } from 'next/navigation'
import { CommunicationsService } from '@/lib/admin/communications-service'
import { AdminTemplateEditor } from '@/components/admin/AdminTemplateEditor'

export const revalidate = 0

interface PageProps {
  params: Promise<{ templateKey: string }>
  searchParams: Promise<{ mode?: string }>
}

export default async function AdminTemplateEditorPage({ params, searchParams }: PageProps) {
  const { templateKey } = await params
  const { mode } = await searchParams

  const detail = await CommunicationsService.getTemplateDetail(templateKey)
  if (!detail) notFound()

  return (
    <AdminTemplateEditor
      detail={detail}
      initialMode={mode === 'preview' ? 'preview' : 'code'}
    />
  )
}