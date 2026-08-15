'use client'

import React from 'react'
import {
  Target,
  BookOpen,
  Activity,
  Award,
  MessageSquare,
  UserCog,
  ExternalLink,
  Mail,
  Bell,
  LifeBuoy,
  ScrollText,
  FolderCheck,
  Globe,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
import { AdminStatusBadge } from './AdminStatusBadge'
import { AdminProgressBar } from './AdminProgressBar'
import { UserActivityTimeline } from './UserActivityTimeline'
import type { AdminUserDetail } from '@/lib/admin/types'
import { cn } from '@/lib/utils'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

/* ─── Overview ─────────────────────────────────────────────────────────── */

function OverviewTab({ user }: { user: AdminUserDetail }) {
  const latestBadge = user.achievements.badges[0]
  const latestCert = user.achievements.certificates[0]
  const recentActivity = user.activity.slice(0, 5)

  return (
    <div className="space-y-4">
      <AdminSection title="Goal" icon={Target} iconColor="text-admin-accent">
        <p className="text-sm text-admin-fg">{user.goal || 'General Skill Upgrade'}</p>
      </AdminSection>

      <AdminSection title="Progress Summary" icon={BookOpen} iconColor="text-admin-success">
        <AdminProgressBar value={user.kpis.courseProgressPct} label="Course completion" />
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border text-center">
            <p className="text-lg font-extrabold text-admin-fg">{user.learning.lessonsCompleted}</p>
            <p className="text-[10px] uppercase tracking-wider text-admin-fg-muted font-bold">Lessons</p>
          </div>
          <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border text-center">
            <p className="text-lg font-extrabold text-admin-fg">{user.learning.quizAttempts}</p>
            <p className="text-[10px] uppercase tracking-wider text-admin-fg-muted font-bold">Quizzes</p>
          </div>
          <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border text-center">
            <p className="text-lg font-extrabold text-admin-fg">{user.achievements.badges.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-admin-fg-muted font-bold">Badges</p>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Recent Activity" icon={Activity} meta={`${user.activity.length} events`}>
        <UserActivityTimeline items={recentActivity} />
      </AdminSection>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AdminSection title="Latest Achievement" icon={Award} iconColor="text-admin-accent">
          {latestBadge ? (
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
                <Award className="w-5 h-5 text-admin-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-admin-fg truncate">{latestBadge.name}</p>
                <p className="text-[11px] text-admin-fg-muted">{formatDateShort(latestBadge.earnedAt)}</p>
              </div>
            </div>
          ) : (
            <AdminEmptyState icon={Award} title="No badges yet" className="py-6" />
          )}
        </AdminSection>

        <AdminSection title="Latest Certificate" icon={ScrollText} iconColor="text-admin-warning">
          {latestCert ? (
            <div className="space-y-1.5">
              <p className="text-sm font-bold text-admin-fg font-mono">{latestCert.code}</p>
              <p className="text-[11px] text-admin-fg-muted capitalize">{latestCert.type.replace(/_/g, ' ')}</p>
              <p className="text-[11px] text-admin-fg-muted">{formatDateShort(latestCert.issuedAt)}</p>
            </div>
          ) : (
            <AdminEmptyState icon={ScrollText} title="No certificates yet" className="py-6" />
          )}
        </AdminSection>
      </div>

      <AdminSection title="Portfolio" icon={Globe} iconColor="text-admin-info">
        {user.achievements.portfolio.hasPortfolio ? (
          <div className="flex items-center justify-between gap-3">
            <AdminStatusBadge
              status={user.achievements.portfolio.isPublic ? 'published' : 'archived'}
              label={user.achievements.portfolio.isPublic ? 'Public' : 'Private'}
            />
            {user.achievements.portfolio.url && (
              <a
                href={user.achievements.portfolio.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-admin-accent hover:underline"
              >
                Open portfolio <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <AdminEmptyState icon={Globe} title="No portfolio" description="This learner has not enabled a public portfolio." className="py-6" />
        )}
      </AdminSection>
    </div>
  )
}

/* ─── Learning ─────────────────────────────────────────────────────────── */

function LearningTab({ user }: { user: AdminUserDetail }) {
  return (
    <div className="space-y-4">
      <AdminSection title="Course Progress" icon={BookOpen} iconColor="text-admin-success">
        <AdminProgressBar value={user.learning.courseProgressPct} label="Overall completion" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border text-center">
            <p className="text-lg font-extrabold text-admin-fg">
              {user.learning.lessonsCompleted}
              <span className="text-xs text-admin-fg-muted font-semibold">/{user.learning.lessonsTotal}</span>
            </p>
            <p className="text-[10px] uppercase tracking-wider text-admin-fg-muted font-bold">Lessons</p>
          </div>
          <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border text-center">
            <p className="text-lg font-extrabold text-admin-fg">{user.learning.quizAttempts}</p>
            <p className="text-[10px] uppercase tracking-wider text-admin-fg-muted font-bold">Quiz attempts</p>
          </div>
          <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border text-center">
            <p className="text-lg font-extrabold text-admin-fg">
              {user.learning.quizAvgScore === null ? '—' : `${user.learning.quizAvgScore}%`}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-admin-fg-muted font-bold">Avg score</p>
          </div>
          <div className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border text-center">
            <p className="text-lg font-extrabold text-admin-fg">{user.learning.srsReviews}</p>
            <p className="text-[10px] uppercase tracking-wider text-admin-fg-muted font-bold">SRS reviews</p>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Module Progress" icon={BookOpen} iconColor="text-admin-info">
        {user.learning.modules.length === 0 ? (
          <AdminEmptyState icon={BookOpen} title="No module data" description="Module progress will appear once the learner starts the curriculum." className="py-8" />
        ) : (
          <div className="space-y-3">
            {user.learning.modules.map((mod) => (
              <div key={mod.slug} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-admin-fg capitalize truncate">{mod.title.replace(/-/g, ' ')}</p>
                  <span className="text-[11px] font-mono text-admin-fg-subtle shrink-0">
                    {mod.lessonsCompleted}/{mod.lessonsTotal}
                  </span>
                </div>
                <AdminProgressBar value={mod.completedPct} showValue={false} />
              </div>
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  )
}

/* ─── Activity ─────────────────────────────────────────────────────────── */

function ActivityTab({ user }: { user: AdminUserDetail }) {
  return (
    <AdminSection title="Activity Timeline" icon={Activity} meta={`${user.activity.length} events`}>
      <UserActivityTimeline items={user.activity} />
    </AdminSection>
  )
}

/* ─── Achievements ─────────────────────────────────────────────────────── */

function AchievementsTab({ user }: { user: AdminUserDetail }) {
  return (
    <div className="space-y-4">
      <AdminSection title="Badges" icon={Award} iconColor="text-admin-accent" meta={`${user.achievements.badges.length} earned`}>
        {user.achievements.badges.length === 0 ? (
          <AdminEmptyState icon={Award} title="No badges earned" className="py-8" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {user.achievements.badges.map((badge) => (
              <div
                key={badge.id}
                className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border space-y-1.5"
                title={badge.description}
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-admin-accent-soft border border-admin-accent/25">
                    <Award className="w-4 h-4 text-admin-accent" />
                  </div>
                  <p className="text-xs font-bold text-admin-fg truncate">{badge.name}</p>
                </div>
                <p className="text-[10px] text-admin-fg-muted">{formatDateShort(badge.earnedAt)}</p>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Certificates" icon={ScrollText} iconColor="text-admin-warning" meta={`${user.achievements.certificates.length} issued`}>
        {user.achievements.certificates.length === 0 ? (
          <AdminEmptyState icon={ScrollText} title="No certificates issued" className="py-8" />
        ) : (
          <div className="space-y-2">
            {user.achievements.certificates.map((cert) => (
              <div key={cert.id} className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-admin-fg font-mono truncate">{cert.code}</p>
                  <p className="text-[10px] text-admin-fg-muted capitalize">{cert.type.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-[10px] font-mono text-admin-fg-subtle shrink-0">{formatDateShort(cert.issuedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Capstone" icon={FolderCheck} iconColor="text-admin-success">
        {user.achievements.capstone ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-admin-fg capitalize truncate">
                {user.achievements.capstone.moduleTitle.replace(/-/g, ' ')}
              </p>
              <AdminStatusBadge status={user.achievements.capstone.status} />
            </div>
            <p className="text-[11px] text-admin-fg-muted">Submitted {formatDateShort(user.achievements.capstone.submittedAt)}</p>
          </div>
        ) : (
          <AdminEmptyState icon={FolderCheck} title="No capstone submitted" className="py-8" />
        )}
      </AdminSection>
    </div>
  )
}

/* ─── Communications ───────────────────────────────────────────────────── */

function CommunicationsTab({ user }: { user: AdminUserDetail }) {
  return (
    <div className="space-y-4">
      <AdminSection title="Emails" icon={Mail} iconColor="text-admin-info" meta={`${user.communications.emails.length} sent`}>
        {user.communications.emails.length === 0 ? (
          <AdminEmptyState icon={Mail} title="No emails sent" className="py-8" />
        ) : (
          <div className="space-y-2">
            {user.communications.emails.map((email) => (
              <div key={email.id} className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-admin-fg font-mono truncate">{email.templateKey}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <AdminStatusBadge status={email.status} />
                  <span className="text-[10px] font-mono text-admin-fg-subtle">{formatDateShort(email.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Notifications" icon={Bell} iconColor="text-admin-accent" meta={`${user.communications.notifications.length} total`}>
        {user.communications.notifications.length === 0 ? (
          <AdminEmptyState icon={Bell} title="No notifications" className="py-8" />
        ) : (
          <div className="space-y-2">
            {user.communications.notifications.map((notif) => (
              <div key={notif.id} className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-admin-fg truncate">{notif.title}</p>
                  <p className="text-[10px] text-admin-fg-muted capitalize">{notif.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {notif.isRead ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-admin-fg-subtle">
                      <CheckCircle2 className="w-3 h-3" /> Read
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-admin-info">
                      <XCircle className="w-3 h-3" /> Unread
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-admin-fg-subtle">{formatDateShort(notif.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Contact Interactions" icon={LifeBuoy} iconColor="text-admin-success" meta={`${user.communications.contacts.length} messages`}>
        {user.communications.contacts.length === 0 ? (
          <AdminEmptyState icon={LifeBuoy} title="No contact messages" className="py-8" />
        ) : (
          <div className="space-y-2">
            {user.communications.contacts.map((contact) => (
              <div key={contact.id} className="p-3 rounded-lg bg-admin-surface-raised border border-admin-border flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-admin-fg truncate">{contact.subject}</p>
                  <p className="text-[10px] text-admin-fg-muted capitalize">{contact.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <AdminStatusBadge status={contact.status} />
                  <span className="text-[10px] font-mono text-admin-fg-subtle">{formatDateShort(contact.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>
    </div>
  )
}

/* ─── Account ──────────────────────────────────────────────────────────── */

function AccountTab({ user }: { user: AdminUserDetail }) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Email', value: <span className="font-mono select-all">{user.account.email}</span> },
    {
      label: 'Verification',
      value: (
        <AdminStatusBadge
          status={user.account.verified ? 'published' : 'archived'}
          label={user.account.verified ? 'Verified' : 'Unverified'}
        />
      ),
    },
    { label: 'Signup date', value: <span className="font-mono">{formatDate(user.account.createdAt)}</span> },
    { label: 'Last active', value: <span className="font-mono">{formatDate(user.account.lastActiveAt)}</span> },
    {
      label: 'Account status',
      value: (
        <AdminStatusBadge
          status={user.account.isAdmin ? 'admin' : 'learner'}
          label={user.account.isAdmin ? 'Admin' : 'Learner'}
        />
      ),
    },
    { label: 'Auth provider', value: <span className="capitalize">{user.account.authProvider || '—'}</span> },
    { label: 'Timezone', value: <span className="font-mono">{user.account.timezone || '—'}</span> },
    { label: 'User ID', value: <span className="font-mono text-[11px] select-all">{user.id}</span> },
  ]

  return (
    <AdminSection title="Account Profile & Metadata" icon={UserCog} iconColor="text-admin-info">
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              'p-2.5 rounded-lg bg-admin-surface-raised border border-admin-border flex justify-between items-center gap-3',
              row.label === 'User ID' && 'bg-admin-bg/60'
            )}
          >
            <span className="text-xs text-admin-fg-muted">{row.label}</span>
            <span className="text-xs text-admin-fg text-right">{row.value}</span>
          </div>
        ))}
      </div>
    </AdminSection>
  )
}

/* ─── Tab host ─────────────────────────────────────────────────────────── */

export const USER_DETAIL_TABS = [
  { key: 'overview', label: 'Overview', icon: Target },
  { key: 'learning', label: 'Learning', icon: BookOpen },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'achievements', label: 'Achievements', icon: Award },
  { key: 'communications', label: 'Communications', icon: MessageSquare },
  { key: 'account', label: 'Account', icon: UserCog },
] as const

export type UserDetailTabKey = (typeof USER_DETAIL_TABS)[number]['key']

export function UserTabPanels({ user, activeTab }: { user: AdminUserDetail; activeTab: UserDetailTabKey }) {
  switch (activeTab) {
    case 'overview':
      return <OverviewTab user={user} />
    case 'learning':
      return <LearningTab user={user} />
    case 'activity':
      return <ActivityTab user={user} />
    case 'achievements':
      return <AchievementsTab user={user} />
    case 'communications':
      return <CommunicationsTab user={user} />
    case 'account':
      return <AccountTab user={user} />
    default:
      return <OverviewTab user={user} />
  }
}