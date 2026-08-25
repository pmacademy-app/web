import React from 'react'
import Link from 'next/link'
import {
  Mail,
  FileCode,
  RefreshCw,
  Bell,
  MessageSquare,
  LayoutDashboard,
  Zap,
  Star,
  Megaphone,
} from 'lucide-react'
import { AdminConsoleService } from '@/lib/admin/service'
import { CommunicationsService } from '@/lib/admin/communications-service'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { AnnouncementsService } from '@/lib/admin/announcements-service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { ProcessEmailQueueButton } from '@/components/admin/ProcessEmailQueueButton'
import { AdminEmailAutomationsView } from '@/components/admin/AdminEmailAutomationsView'
import { AdminCommunicationsOverview } from '@/components/admin/AdminCommunicationsOverview'
import { AdminEmailDashboard } from '@/components/admin/AdminEmailDashboard'
import { AdminTemplateList } from '@/components/admin/AdminTemplateList'
import { AdminQueueView } from '@/components/admin/AdminQueueView'
import { AdminContactInbox, type ContactMessageItem } from '@/components/admin/AdminContactInbox'
import { AdminNotificationListView } from '@/components/admin/AdminNotificationListView'
import { AdminAnnouncementsView } from '@/components/admin/AdminAnnouncementsView'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<{
    tab?: string
    status?: string
    page?: string
    q?: string
    category?: string
    tq?: string
  }>
}

const TABS: Array<{ key: string; label: string; icon: React.ElementType; href?: string }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'automations', label: 'Automations', icon: Zap },
  { key: 'templates', label: 'Templates', icon: FileCode },
  { key: 'queue', label: 'Queue', icon: RefreshCw },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'contact', label: 'Contact', icon: MessageSquare },
  { key: 'testimonials', label: 'Testimonials', icon: Star, href: '/admin/moderation?tab=testimonials' },
  { key: 'feedback', label: 'Feedback', icon: MessageSquare, href: '/admin/moderation?tab=feedback' },
]

export default async function AdminCommunicationsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const tab = params.tab || 'overview'

  // Always fetch queue overview (header action + queue tab + email KPIs).
  const queue = await AdminConsoleService.getEmailQueueOverview()

  // Fetch per-tab data in parallel; each service degrades to empty fallbacks.
  const [overview, emailHistory, volumeSeries, automationsState, templates, notificationEvents, contactMessages, announcementsData] =
    await Promise.all([
      tab === 'overview' ? CommunicationsService.getCommunicationsOverview() : Promise.resolve(null),
      tab === 'email' || tab === 'queue'
        ? CommunicationsService.getEmailHistory({
            status: params.status,
            search: params.q,
            page: Number(params.page) || 1,
            pageSize: 25,
          })
        : Promise.resolve(null),
      tab === 'email' ? CommunicationsService.getEmailVolumeSeries(14) : Promise.resolve([]),
      tab === 'automations' ? EmailAutomationsService.getState() : Promise.resolve(null),
      tab === 'templates' ? Promise.resolve(CommunicationsService.getTemplateList()) : Promise.resolve([]),
      tab === 'notifications' ? CommunicationsService.getNotificationEvents(50) : Promise.resolve([]),
      tab === 'contact' ? CommunicationsService.getContactMessages(100) : Promise.resolve([]),
      tab === 'announcements' ? AnnouncementsService.getAnnouncements({ limit: 100 }) : Promise.resolve({ announcements: [] }),
    ])

  const contactMessagesTyped: ContactMessageItem[] = (contactMessages || []).map((c) => ({
    id: String(c.id),
    user_id: c.user_id ? String(c.user_id) : null,
    name: String(c.name || 'Anonymous'),
    email: String(c.email || ''),
    subject: String(c.subject || 'Inquiry'),
    category: String(c.category || 'general'),
    message: String(c.message || ''),
    status: (c.status as ContactMessageItem['status']) || 'new',
    source: (c.source as ContactMessageItem['source']) || 'web_form',
    admin_notes: c.admin_notes ? String(c.admin_notes) : null,
    created_at: String(c.created_at || new Date().toISOString()),
  }))

  // Template list filtering (server-driven via searchParams).
  const categoryFilter = params.category || 'all'
  const templateSearch = params.tq || ''
  const filteredTemplates = (templates || []).filter((tpl) => {
    if (categoryFilter !== 'all' && tpl.category !== categoryFilter) return false
    if (templateSearch.trim()) {
      const q = templateSearch.trim().toLowerCase()
      if (!`${tpl.name} ${tpl.key} ${tpl.trigger}`.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Communications"
        description="Unified management of email, templates, automations, notifications and contact inquiries."
        icon={Mail}
        actions={<ProcessEmailQueueButton />}
      />

      {/* Secondary navigation tabs */}
      <nav aria-label="Communications sections" className="border-b border-admin-border flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-admin-border">
        {TABS.map(({ key, label, icon: Icon, href }) => (
          <Link
            key={key}
            href={href || `/admin/communications?tab=${key}`}
            aria-current={tab === key ? 'page' : undefined}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-admin-accent text-admin-accent bg-admin-accent-soft/50 font-semibold'
                : 'border-transparent text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised/50'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </Link>
        ))}
      </nav>

      {/* Overview */}
      {tab === 'overview' && overview && <AdminCommunicationsOverview data={overview} />}

      {/* Announcements */}
      {tab === 'announcements' && (
        <AdminAnnouncementsView initialAnnouncements={announcementsData.announcements} />
      )}

      {/* Email */}
      {tab === 'email' && emailHistory && (
        <AdminEmailDashboard
          history={emailHistory}
          volumeSeries={volumeSeries || []}
          queueCounts={{
            pending: queue.pendingCount,
            delivered: queue.deliveredCount,
            failed: queue.failedCount,
            deadLetter: queue.deadLetterCount,
          }}
        />
      )}

      {/* Automations */}
      {tab === 'automations' && automationsState && <AdminEmailAutomationsView initialState={automationsState} />}

      {/* Templates */}
      {tab === 'templates' && (
        <AdminTemplateList templates={filteredTemplates} category={categoryFilter} search={templateSearch} />
      )}

      {/* Queue & Health */}
      {tab === 'queue' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminKpiCard title="Pending Queue" value={queue.pendingCount} subtitle="Awaiting worker pickup" icon={Mail} iconColor="text-admin-warning" />
            <AdminKpiCard title="Processing" value={queue.processingCount} subtitle="Currently dispatching" icon={RefreshCw} iconColor="text-admin-info" />
            <AdminKpiCard title="Delivered (24h)" value={queue.deliveredCount} subtitle="Successfully delivered" icon={Mail} iconColor="text-admin-success" />
            <AdminKpiCard title="Failed / Bounced" value={queue.failedCount} subtitle="Delivery failures" icon={Mail} iconColor="text-admin-danger" />
          </div>

          <div className="p-6 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-xl">
            <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider">Event Routing Matrix</h2>
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
                <div>
                  <p className="font-bold text-admin-fg">In-App Only (`lesson.completed`, `streak.updated`, `quiz.completed`, `review.completed`, `srs.review_due`, `capstone.submitted`)</p>
                  <p className="text-admin-fg-muted">Routed exclusively to the In-App Notification Center.</p>
                </div>
                <AdminStatusBadge status="published" label="In-App Only" />
              </div>

              <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
                <div>
                  <p className="font-bold text-admin-fg">In-App + Email (`user.registered`, `user.verified`, `password.reset_requested`, `module.completed`, `badge.earned`, `xp.level_up`, `certificate.generated`, `portfolio.published`)</p>
                  <p className="text-admin-fg-muted">Routed to both In-App and the Email Queue (respecting user preferences and automation toggles).</p>
                </div>
                <AdminStatusBadge status="healthy" label="In-App + Email" />
              </div>

              <div className="p-4 rounded-lg bg-admin-bg/60 border border-admin-border flex items-center justify-between">
                <div>
                  <p className="font-bold text-admin-fg">Scheduled Automations (`learning.weekly_recap`, `learning.daily_reminder`, `inactive.resume_learning`)</p>
                  <p className="text-admin-fg-muted">Not events — dispatched by the scheduler on a cadence, not by learner activity.</p>
                </div>
                <AdminStatusBadge status="info" label="Scheduled" />
              </div>
            </div>
          </div>

          {emailHistory && <AdminQueueView history={emailHistory} />}
        </div>
      )}

      {/* Notifications */}
      {tab === 'notifications' && <AdminNotificationListView events={notificationEvents || []} />}

      {/* Contact inbox */}
      {tab === 'contact' && <AdminContactInbox initialMessages={contactMessagesTyped} />}
    </div>
  )
}