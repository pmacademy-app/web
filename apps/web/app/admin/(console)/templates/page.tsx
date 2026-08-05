import React from 'react'
import { FileCode } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminDataTable, Column } from '@/components/admin/AdminDataTable'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { SendTestEmailButton } from '@/components/admin/SendTestEmailButton'

export const revalidate = 0

interface TemplateItem {
  id: string
  key: string
  name: string
  category: string
  priority: string
}

const EMAIL_TEMPLATES: TemplateItem[] = [
  { id: 'tpl-1', key: 'auth.welcome', name: 'Welcome & Getting Started', category: 'Auth / Transactional', priority: 'High (2)' },
  { id: 'tpl-2', key: 'auth.verify_email', name: 'Verify Email Address', category: 'Auth / Security', priority: 'Critical (1)' },
  { id: 'tpl-3', key: 'auth.password_reset', name: 'Password Reset Request', category: 'Auth / Security', priority: 'Critical (1)' },
  { id: 'tpl-4', key: 'learning.module_complete', name: 'Module Completion Award', category: 'Major Milestone', priority: 'High (2)' },
  { id: 'tpl-5', key: 'certificate.generated', name: 'Certificate Signed & Issued', category: 'Major Milestone', priority: 'High (2)' },
  { id: 'tpl-6', key: 'portfolio.published', name: 'Portfolio Published Alert', category: 'Major Milestone', priority: 'High (2)' },
  { id: 'tpl-7', key: 'system.weekly_recap', name: 'Weekly Learning Summary', category: 'Scheduled Digest', priority: 'Medium (5)' },
  { id: 'tpl-8', key: 'system.product_announcement', name: 'Admin Product Announcement', category: 'Admin Broadcast', priority: 'Bulk (10)' },
]

export default async function AdminTemplatesPage() {
  const columns: Column<TemplateItem>[] = [
    {
      header: 'Template Key',
      cell: (tpl) => <span className="font-mono text-amber-400 font-semibold">{tpl.key}</span>,
    },
    {
      header: 'Template Name',
      cell: (tpl) => <span className="text-white font-bold">{tpl.name}</span>,
    },
    {
      header: 'Category',
      cell: (tpl) => <span className="text-slate-400">{tpl.category}</span>,
    },
    {
      header: 'Priority',
      cell: (tpl) => (
        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
          {tpl.priority}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: () => <AdminStatusBadge status="published" label="Active (v1)" />,
    },
    {
      header: 'Actions',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (tpl) => (
        <SendTestEmailButton templateKey={tpl.key} templateName={tpl.name} />
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Email Template Registry"
        description="Registered React Email templates, default dispatcher priority matrix, and preview triggers."
        icon={FileCode}
        iconColor="text-amber-400"
      />

      <AdminDataTable
        columns={columns}
        data={EMAIL_TEMPLATES}
        keyExtractor={(tpl) => tpl.id}
      />
    </div>
  )
}
