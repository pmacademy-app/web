import React from 'react'
import { Award } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminDataTable, Column } from '@/components/admin/AdminDataTable'

export const revalidate = 0

interface CertificateRow {
  id: string
  certificate_code: string
  user_id: string
  certificate_type: string
  module_slug?: string
  issued_at: string
}

export default async function AdminCertificatesPage() {
  const supabase = createServerSupabaseClient()
  const { data: certs } = await supabase
    .from('user_certificates')
    .select('*')
    .order('issued_at', { ascending: false })
    .limit(30)

  const certList = (certs || []) as unknown as CertificateRow[]

  const columns: Column<CertificateRow>[] = [
    {
      header: 'Certificate Code',
      cell: (cert) => <span className="font-mono font-bold text-amber-400">{cert.certificate_code}</span>,
    },
    {
      header: 'Type',
      cell: (cert) => <span className="text-slate-300 capitalize">{cert.certificate_type.replace('_', ' ')}</span>,
    },
    {
      header: 'Issued At',
      cell: (cert) => <span className="text-slate-400 font-mono text-[11px]">{new Date(cert.issued_at).toLocaleDateString()}</span>,
    },
    {
      header: 'Verification URL',
      headerClassName: 'text-right',
      className: 'text-right font-mono text-xs text-blue-400',
      cell: (cert) => `/verify/${cert.certificate_code}`,
    },
  ]

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Certificate Audit & Verification"
        description="Inspect issued certificates, verify credential integrity, and test public verification pages."
        icon={Award}
        iconColor="text-amber-400"
      />

      <AdminDataTable
        columns={columns}
        data={certList}
        keyExtractor={(c) => c.id}
        emptyTitle="No certificates issued yet"
        emptyDescription="Certificates will appear here once learners complete modules or the full curriculum."
      />
    </div>
  )
}
