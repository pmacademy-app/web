import React from 'react'
import Link from 'next/link'
import { Award, ExternalLink, ShieldCheck } from 'lucide-react'
import { createServiceRoleClient } from '@/lib/supabase'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminDataTable, Column } from '@/components/admin/AdminDataTable'
import { DeveloperActionsSection } from '@/components/admin/DeveloperActionsSection'
import { AdminConsoleService } from '@/lib/admin/service'

export const revalidate = 0

interface CertificateRow {
  id: string
  certificate_code: string
  user_id: string
  type: string
  learner_name?: string
  issued_at: string
}

export default async function AdminCertificatesPage() {
  const supabase = createServiceRoleClient()
  const users = await AdminConsoleService.getUsersOverview(1)

  // Fetch certificates from certificates table
  const { data: certs } = await supabase
    .from('certificates')
    .select('*')
    .order('issued_at', { ascending: false })
    .limit(50)

  const certList = (certs || []) as unknown as CertificateRow[]

  const columns: Column<CertificateRow>[] = [
    {
      header: 'Certificate Code',
      cell: (cert) => <span className="font-mono font-bold text-admin-accent">{cert.certificate_code}</span>,
    },
    {
      header: 'Learner',
      cell: (cert) => <span className="text-admin-fg font-semibold">{cert.learner_name || 'Learner'}</span>,
    },
    {
      header: 'Credential Type',
      cell: (cert) => <span className="text-admin-fg-muted capitalize">{(cert.type || 'Full Curriculum').replace('_', ' ')}</span>,
    },
    {
      header: 'Issued Date',
      cell: (cert) => <span className="text-admin-fg-muted font-mono text-[11px]">{new Date(cert.issued_at).toLocaleDateString()}</span>,
    },
    {
      header: 'Verification Link',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (cert) => (
        <Link
          href={`/verify/${encodeURIComponent(cert.certificate_code)}`}
          target="_blank"
          className="inline-flex items-center gap-1 text-xs text-admin-info hover:text-admin-info/80 font-mono"
        >
          Verify <ExternalLink className="w-3 h-3" />
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Certificate Audit & Verification"
        description="Inspect issued certificates, verify credential integrity, and test public verification lookups."
        icon={Award}
      />

      {/* Certificates Data Table */}
      <AdminDataTable
        columns={columns}
        data={certList}
        keyExtractor={(c) => c.id}
        emptyTitle="No certificates issued yet"
        emptyDescription="Certificates will appear here once learners complete modules or the full curriculum."
      />

      {/* Dev Certificate Tools Section */}
      {users.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-admin-success" />
            <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Dev Certificate Tools</h2>
          </div>
          <DeveloperActionsSection
            targetUserId={users[0].id}
            targetUserEmail={users[0].email}
          />
        </div>
      )}
    </div>
  )
}
