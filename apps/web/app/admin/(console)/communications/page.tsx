import React from 'react'
import Link from 'next/link'
import { Mail, FileCode, RefreshCw, Bell, ShieldCheck, Send } from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminDataTable, Column } from '@/components/admin/AdminDataTable'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { ProcessEmailQueueButton } from '@/components/admin/ProcessEmailQueueButton'
import { SendTestEmailButton } from '@/components/admin/SendTestEmailButton'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<{ tab?: string }>
}

interface EmailLogItem {
  id: string
  toEmail: string
  templateKey: string
  status: string
  createdAt: string
}

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

export default async function AdminCommunicationsPage({ searchParams }: PageProps) {
  const { tab = 'templates' } = await searchParams
  const queue = await AdminConsoleService.getEmailQueueOverview()

  const templateColumns: Column<TemplateItem>[] = [
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

  const queueColumns: Column<EmailLogItem>[] = [
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
        title="Communications & Notifications"
        description="Unified management of in-app notifications, transactional email queue, templates, and broadcast triggers."
        icon={Mail}
        iconColor="text-blue-400"
        actions={<ProcessEmailQueueButton />}
      />

      {/* Sub-navigation Tabs */}
      <div className="border-b border-slate-800 flex gap-6 text-xs font-semibold">
        <Link
          href="/admin/communications?tab=templates"
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            tab === 'templates'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4" /> Templates
        </Link>
        <Link
          href="/admin/communications?tab=queue"
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            tab === 'queue'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <RefreshCw className="w-4 h-4" /> Queue & Health
        </Link>
        <Link
          href="/admin/communications?tab=broadcasts"
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            tab === 'broadcasts'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Send className="w-4 h-4" /> Broadcasts & Test Sends
        </Link>
      </div>

      {/* Tab 1: Templates */}
      {tab === 'templates' && (
        <div className="space-y-6">
          <AdminDataTable
            columns={templateColumns}
            data={EMAIL_TEMPLATES}
            keyExtractor={(tpl) => tpl.id}
          />
        </div>
      )}

      {/* Tab 2: Queue & Health */}
      {tab === 'queue' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminKpiCard title="Pending Queue" value={queue.pendingCount} subtitle="Awaiting worker pickup" icon={Mail} iconColor="text-amber-400" />
            <AdminKpiCard title="Processing" value={queue.processingCount} subtitle="Currently dispatching" icon={RefreshCw} iconColor="text-blue-400" />
            <AdminKpiCard title="Delivered (24h)" value={queue.deliveredCount} subtitle="Successfully delivered" icon={Mail} iconColor="text-emerald-400" />
            <AdminKpiCard title="Failed / Bounced" value={queue.failedCount} subtitle="Delivery failures" icon={Mail} iconColor="text-rose-400" />
          </div>

          <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Event Routing Matrix</h2>
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">Daily Learning Events (`lesson.completed`, `streak.updated`, `badge.earned`)</p>
                  <p className="text-slate-400">Routed exclusively to In-App Notification Center.</p>
                </div>
                <AdminStatusBadge status="published" label="In-App Only" />
              </div>

              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">Major Milestones (`module.completed`, `certificate.generated`, `weekly_recap`)</p>
                  <p className="text-slate-400">Routed to both In-App and Email Queue (respecting user preferences).</p>
                </div>
                <AdminStatusBadge status="healthy" label="In-App + Email" />
              </div>
            </div>
          </div>

          <AdminDataTable
            columns={queueColumns}
            data={queue.recentLogs as EmailLogItem[]}
            keyExtractor={(item) => item.id}
            emptyTitle="No email logs available"
            emptyDescription="The outgoing email queue is currently empty."
          />
        </div>
      )}

      {/* Tab 3: Broadcasts & Test Sends */}
      {tab === 'broadcasts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AdminKpiCard title="Primary Channel" value="In-App" subtitle="Real-time drawer notifications" icon={Bell} iconColor="text-amber-400" />
            <AdminKpiCard title="Secondary Channel" value="Email Engine" subtitle="Auth, Milestones & Weekly Recap" icon={Mail} iconColor="text-blue-400" />
            <AdminKpiCard title="Dispatcher Status" value="Active" subtitle="Event-driven notification platform" icon={ShieldCheck} iconColor="text-emerald-400" />
          </div>

          <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Send Test Email & Manual Triggers</h2>
            <p className="text-xs text-slate-400">
              Trigger instant transactional email dispatches to verify Resend API integration, HTML templates, and unsubscribe link generation.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <SendTestEmailButton templateKey="auth.welcome" templateName="Send Test Welcome Email" />
              <SendTestEmailButton templateKey="certificate.generated" templateName="Send Test Certificate Email" />
              <SendTestEmailButton templateKey="system.weekly_recap" templateName="Send Test Weekly Recap Email" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
