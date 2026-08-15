'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileBadge, CalendarDays, Layers, Clock3, ExternalLink } from 'lucide-react'
import { AdminPageShell } from './AdminPageShell'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSearchInput } from './AdminSearchInput'
import { AdminPagination } from './AdminPagination'
import { AdminLoadWarning } from './AdminLoadWarning'
import { AdminDataTable, Column, TableSort } from './AdminDataTable'
import { AdminStatusBadge } from './AdminStatusBadge'
import { CertificateDetailDrawer } from './CertificateDetailDrawer'
import type {
  AdminCertificateKpis,
  AdminCertificateRow,
  AdminCertificateSortKey,
} from '@/lib/admin/achievements-aggregation'
import type { AdminCertificateDetail } from '@/lib/admin/achievements-service'

interface CertificatesWorkspaceProps {
  initialCertificates: AdminCertificateRow[]
  initialTotal: number
  kpis: AdminCertificateKpis
  loadFailed: boolean
  initialSearch: string
  initialType: string | null
  initialPage: number
  initialSortKey: AdminCertificateSortKey
  initialSortDir: 'asc' | 'desc'
  pageSize: number
  selectedCertificateId: string | null
  selectedCertificateDetail: AdminCertificateDetail | null
}

const CERT_TYPES = ['full_curriculum', 'module', 'specialization']

// Schema note (spec §28 KPI "Recently Verified"): the schema has no
// verification tracking (no verified_at / verification event log), so a
// "Recently Verified" KPI cannot be computed. It is intentionally replaced by
// "Credential Types" (a real, computable KPI) — see plan §5.2 schema
// limitations. "Recently Issued" (30-day window) covers the issuance side.
export function CertificatesWorkspace({
  initialCertificates,
  initialTotal,
  kpis,
  loadFailed,
  initialSearch,
  initialType,
  initialPage,
  initialSortKey,
  initialSortDir,
  pageSize,
  selectedCertificateId,
  selectedCertificateDetail,
}: CertificatesWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const pushParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    router.push(`/admin/achievements/certificates${next.toString() ? `?${next.toString()}` : ''}`, { scroll: false })
  }

  const handleSearch = (value: string) => pushParams({ search: value || undefined, page: undefined })
  const handleType = (type: string | null) => pushParams({ type: type || undefined, page: undefined })
  const handlePageChange = (page: number) => pushParams({ page: String(page) })
  const handleSortChange = (sort: TableSort) => {
    pushParams({ sort: sort.key, sortDir: sort.dir, page: undefined })
  }
  const handleSelectCertificate = (id: string) => pushParams({ cert: id })
  const handleCloseDrawer = () => pushParams({ cert: undefined })

  const sort: TableSort | null = { key: initialSortKey, dir: initialSortDir }
  const totalPages = Math.max(1, Math.ceil(initialTotal / pageSize))

  const columns: Column<AdminCertificateRow>[] = [
    {
      header: 'Certificate Code',
      cell: (cert) => <span className="font-mono font-bold text-admin-accent">{cert.code}</span>,
    },
    {
      header: 'Learner',
      sortable: true,
      sortKey: 'learnerName',
      cell: (cert) => <span className="text-admin-fg font-semibold">{cert.learnerName}</span>,
    },
    {
      header: 'Credential Type',
      sortable: true,
      sortKey: 'type',
      cell: (cert) => (
        <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border capitalize">
          {cert.type.replace('_', ' ')}
        </span>
      ),
    },
    {
      header: 'Career Title',
      cell: (cert) => <span className="text-admin-fg-muted">{cert.careerTitle || '—'}</span>,
    },
    {
      header: 'Issued Date',
      sortable: true,
      sortKey: 'issuedAt',
      cell: (cert) => (
        <span className="text-admin-fg-muted font-mono text-[11px]">
          {new Date(cert.issuedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: () => <AdminStatusBadge status="success" label="Issued" />,
    },
    {
      header: 'Verification',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (cert) => (
        <a
          href={`/verify/${encodeURIComponent(cert.code)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-admin-info hover:text-admin-info/80 font-mono"
        >
          Verify <ExternalLink className="w-3 h-3" />
        </a>
      ),
    },
  ]

  return (
    <AdminPageShell
      title="Certificates"
      description="Audit issued credentials, learner attribution and verification links."
      icon={FileBadge}
      kpis={
        <>
          <AdminKpiCard
            title="Total Issued"
            value={kpis.totalIssued.toLocaleString()}
            subtitle="All-time issued credentials"
            icon={FileBadge}
            iconColor="text-admin-accent"
          />
          <AdminKpiCard
            title="Issued This Month"
            value={kpis.issuedThisMonth.toLocaleString()}
            subtitle="Credentials issued in the current month"
            icon={CalendarDays}
            iconColor="text-admin-success"
          />
          <AdminKpiCard
            title="Recently Issued"
            value={kpis.recentlyIssued.toLocaleString()}
            subtitle="Credentials issued in the last 30 days"
            icon={Clock3}
            iconColor="text-admin-warning"
          />
          <AdminKpiCard
            title="Credential Types"
            value={kpis.distinctTypes.toLocaleString()}
            subtitle="Distinct certificate types in use"
            icon={Layers}
            iconColor="text-admin-info"
          />
        </>
      }
      toolbar={
        <>
          <AdminSearchInput
            value={initialSearch}
            onValueChange={handleSearch}
            placeholder="Search by learner or certificate code..."
            aria-label="Search certificates"
            className="flex-1 min-w-52"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleType(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                !initialType
                  ? 'bg-admin-accent-soft text-admin-accent border border-admin-accent/25'
                  : 'bg-admin-surface text-admin-fg-muted hover:text-admin-fg border border-admin-border'
              }`}
            >
              All
            </button>
            {CERT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                  initialType === t
                    ? 'bg-admin-accent-soft text-admin-accent border border-admin-accent/25'
                    : 'bg-admin-surface text-admin-fg-muted hover:text-admin-fg border border-admin-border'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
        </>
      }
    >
      {loadFailed && (
        <AdminLoadWarning message="Live certificate data could not be loaded. Showing cached or empty values." />
      )}

      <AdminDataTable
        columns={columns}
        data={initialCertificates}
        keyExtractor={(c) => c.id}
        sort={sort}
        onSortChange={handleSortChange}
        onRowClick={(c) => handleSelectCertificate(c.id)}
        rowAriaLabel={(c) => `Open details for certificate ${c.code}`}
        emptyTitle="No certificates found"
        emptyDescription="No issued certificates match your active search or filters."
      />

      <AdminPagination
        currentPage={initialPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        pageSize={pageSize}
        totalItems={initialTotal}
      />

      <CertificateDetailDrawer
        certificateId={selectedCertificateId}
        certificate={selectedCertificateDetail}
        isOpen={Boolean(selectedCertificateId)}
        onClose={handleCloseDrawer}
      />
    </AdminPageShell>
  )
}