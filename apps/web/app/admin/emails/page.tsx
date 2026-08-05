import React from 'react'
import { Mail, RefreshCw, Play } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminDataTable, Column } from '@/components/admin/AdminDataTable'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'

export const revalidate = 0

interface EmailLogItem {
  id: string
  toEmail: string
  templateKey: string
  status: string
  createdAt: string
}

export default async function AdminEmailsPage() {
  const queue = await AdminConsoleService.getEmailQueueOverview()

  const columns: Column<EmailLogItem>[] = [
    {
      header: 'Recipient',
      cell: (item) => <span className="font-mono text-white font-semibold">{item.toEmail}</span>,
    },
    {
      header: 'Template Key',
      cell: (item) => <span className="font-mono text-amber-400 font-bold">{item.templateKey}</span>,
    },
    {
      header: 'Delivery Status',
      cell: (item) => <AdminStatusBadge status={item.status} />,
    },
    {
      header: 'Created At',
      cell: (item) => (
        <span className="text-slate-400 font-mono text-[11px]">
          {new Date(item.createdAt).toLocaleString()}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Email Queue & Deliverability"
        description="Monitor outgoing transactional emails, queue processing states, and delivery logs."
        icon={Mail}
        iconColor="text-blue-400"
        actions={
          <button className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-lg">
            <Play className="w-3.5 h-3.5 fill-slate-950" /> Process Queue Now
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard title="Pending Queue" value={queue.pendingCount} subtitle="Awaiting worker pickup" icon={Mail} iconColor="text-amber-400" />
        <AdminKpiCard title="Processing" value={queue.processingCount} subtitle="Currently dispatching" icon={RefreshCw} iconColor="text-blue-400" />
        <AdminKpiCard title="Delivered (24h)" value={queue.deliveredCount} subtitle="Successfully delivered" icon={Mail} iconColor="text-emerald-400" />
        <AdminKpiCard title="Failed / Bounced" value={queue.failedCount} subtitle="Delivery failures" icon={Mail} iconColor="text-rose-400" />
      </div>

      <AdminDataTable
        columns={columns}
        data={queue.recentLogs as EmailLogItem[]}
        keyExtractor={(item) => item.id}
        emptyTitle="No email logs available"
        emptyDescription="The outgoing email queue is currently empty."
      />
    </div>
  )
}
