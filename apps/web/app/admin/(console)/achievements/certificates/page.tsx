import React from 'react'
import { AchievementsService } from '@/lib/admin/achievements-service'
import { CertificatesWorkspace } from '@/components/admin/CertificatesWorkspace'

export const revalidate = 0

interface AdminCertificatesPageProps {
  searchParams: Promise<{
    search?: string
    type?: string
    page?: string
    sort?: string
    sortDir?: string
    cert?: string
  }>
}

const PAGE_SIZE = 25

export default async function AdminCertificatesPage({ searchParams }: AdminCertificatesPageProps) {
  const params = await searchParams
  const search = params.search || ''
  const type = params.type || null
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1)
  const sortKey = params.sort === 'learnerName' || params.sort === 'type' ? params.sort : 'issuedAt'
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc'

  const [listResult, detail] = await Promise.all([
    AchievementsService.getCertificates(search, type, page, PAGE_SIZE, sortKey, sortDir),
    params.cert ? AchievementsService.getCertificateDetail(params.cert) : Promise.resolve(null),
  ])

  return (
    <CertificatesWorkspace
      initialCertificates={listResult.certificates}
      initialTotal={listResult.total}
      kpis={listResult.kpis}
      loadFailed={listResult.failed}
      initialSearch={search}
      initialType={type}
      initialPage={page}
      initialSortKey={sortKey}
      initialSortDir={sortDir}
      pageSize={PAGE_SIZE}
      selectedCertificateId={params.cert || null}
      selectedCertificateDetail={detail}
    />
  )
}