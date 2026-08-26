/**
 * Phase 6 — Communications Workspace data service.
 *
 * Server-side aggregation for the Communications workspace: email history,
 * volume series, template metadata, contact messages, notification events and
 * the overview KPIs/attention rows. Follows the Phase 2–5 service pattern
 * (defensive try/catch with empty fallbacks so the UI degrades gracefully).
 */

import { createServiceRoleClient } from '@/lib/supabase'
import { EMAIL_TEMPLATE_MAP, renderEmailTemplate } from '@/emails'
import { AUTOMATION_METADATA } from '@/lib/notifications/automations/service'
import { BRAND } from '@/lib/brand'
import type { AdminAttentionItem } from './types'

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface AdminEmailHistoryItem {
  id: string
  toEmail: string
  toName: string | null
  templateKey: string
  status: string
  createdAt: string
  updatedAt: string
  attemptCount: number
  maxAttempts: number
  errorMessage: string | null
}

export interface AdminEmailHistoryResult {
  items: AdminEmailHistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AdminEmailVolumePoint {
  label: string
  date: string
  sent: number
  delivered: number
  failed: number
}

export interface AdminTemplateListItem {
  key: string
  name: string
  category: string
  trigger: string
  isCritical: boolean
  isDeferred?: boolean
  subjectLine: string
}

export interface AdminTemplateVariable {
  name: string
  description: string
  sample: string
}

export interface AdminTemplateDetail {
  key: string
  name: string
  category: string
  trigger: string
  isCritical: boolean
  isDeferred?: boolean
  isPaused?: boolean
  subjectLine: string
  variables: AdminTemplateVariable[]
  bodyHtml: string
  bodyText: string
  currentVersion?: number
  versionStatus?: 'draft' | 'published'
  hasCustomVersion?: boolean
}

export interface AdminNotificationEventItem {
  id: string
  eventType: string
  userId: string | null
  channelsNotified: string[]
  skippedReason: string | null
  createdAt: string
  payload: Record<string, unknown>
}

export interface AdminCommunicationsOverview {
  kpis: {
    emailsSent: number
    pending: number
    failed: number
    newContactMessages: number
    pendingTestimonials: number
  }
  attention: AdminAttentionItem[]
  recentActivity: Array<{
    id: string
    type: 'email' | 'contact' | 'notification'
    title: string
    detail: string
    timestamp: string
    href: string
  }>
}

/* ─── Template metadata helpers ─────────────────────────────────────────── */

/** Sample values used for preview rendering (mirrors the test-send route). */
export const TEMPLATE_SAMPLE_VARIABLES: Record<string, unknown> = {
  userName: 'Aditya',
  email: 'aditya@example.com',
  confirmationUrl: `${BRAND.siteUrl}/api/auth/callback?token_hash=test_token_hash&type=signup`,
  resetUrl: `${BRAND.siteUrl}/reset-password?token=test_reset_token`,
  verificationUrl: `${BRAND.siteUrl}/verify/PMA-2026-TEST01`,
  moduleName: 'Product Strategy & Vision',
  moduleSlug: 'product-strategy',
  badgeName: 'Visionary Strategist',
  badgeDescription: 'Completed the Product Strategy module',
  badgeIcon: '🏅',
  newLevel: 5,
  levelTitle: 'Senior Product Manager',
  totalXp: 1250,
  certificateCode: 'PMA-2026-TEST01',
  portfolioUrl: `${BRAND.siteUrl}/p/aditya`,
  weeklyXp: 450,
  lessonsCompleted: 8,
  streakDays: 12,
  currentStreak: 12,
  dueCount: 5,
  xpBonus: 200,
  daysStudiedThisWeek: 5,
  lessonsCompletedThisWeek: 8,
  xpEarnedThisWeek: 450,
  appUrl: BRAND.siteUrl,
}

/** Curated catalog of variables available to email templates. */
export const TEMPLATE_VARIABLE_CATALOG: AdminTemplateVariable[] = [
  { name: 'userName', description: 'Recipient display name', sample: 'Aditya' },
  { name: 'email', description: 'Recipient email address', sample: 'aditya@example.com' },
  { name: 'appUrl', description: 'Application base URL', sample: BRAND.siteUrl },
  { name: 'confirmationUrl', description: 'Email verification link', sample: `${BRAND.siteUrl}/api/auth/callback?token_hash=…` },
  { name: 'resetUrl', description: 'Password reset link', sample: `${BRAND.siteUrl}/reset-password?token=…` },
  { name: 'verificationUrl', description: 'Certificate verification link', sample: `${BRAND.siteUrl}/verify/PMA-2026-…` },
  { name: 'moduleName', description: 'Completed module name', sample: 'Product Strategy & Vision' },
  { name: 'moduleSlug', description: 'Module URL slug', sample: 'product-strategy' },
  { name: 'badgeName', description: 'Earned badge name', sample: 'Visionary Strategist' },
  { name: 'badgeDescription', description: 'Earned badge description', sample: 'Completed the strategy module' },
  { name: 'newLevel', description: 'New XP level reached', sample: '5' },
  { name: 'levelTitle', description: 'Level title', sample: 'Senior Product Manager' },
  { name: 'certificateCode', description: 'Certificate credential ID', sample: 'PMA-2026-TEST01' },
  { name: 'portfolioUrl', description: 'Public portfolio URL', sample: `${BRAND.siteUrl}/p/aditya` },
  { name: 'weeklyXp', description: 'XP earned this week', sample: '450' },
  { name: 'lessonsCompleted', description: 'Lessons completed this week', sample: '8' },
  { name: 'streakDays', description: 'Current streak length', sample: '12' },
  { name: 'currentStreak', description: 'Current streak length', sample: '12' },
  { name: 'dueCount', description: 'Flashcards due for review', sample: '5' },
  { name: 'xpBonus', description: 'Module completion XP bonus', sample: '200' },
  { name: 'totalXp', description: 'Cumulative XP', sample: '1250' },
  { name: 'daysStudiedThisWeek', description: 'Days studied this week', sample: '5' },
  { name: 'lessonsCompletedThisWeek', description: 'Lessons completed this week', sample: '8' },
  { name: 'xpEarnedThisWeek', description: 'XP earned this week', sample: '450' },
  { name: 'unsubscribeToken', description: 'Per-recipient unsubscribe token', sample: '…' },
]

/** Human label for a template key when no automation metadata exists. */
function templateDisplayName(key: string): string {
  const parts = key.split('.')
  const last = parts[parts.length - 1] || key
  return last
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/* ─── Service ───────────────────────────────────────────────────────────── */

export class CommunicationsService {
  /**
   * Paginated email history from `email_queue` with optional status + search.
   */
  public static async getEmailHistory(params: {
    status?: string
    search?: string
    page?: number
    pageSize?: number
  }): Promise<AdminEmailHistoryResult> {
    const supabase = createServiceRoleClient()
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(5, Number(params.pageSize) || 25))
    const status = params.status && params.status !== 'all' ? params.status : null
    const search = params.search?.trim() || null

    try {
      let query = supabase.from('email_queue').select(
        'id, to_email, to_name, template_key, status, created_at, updated_at, attempt_count, max_attempts, error_message',
        { count: 'exact' }
      )
      if (status) query = query.eq('status', status)
      if (search) {
        query = query.or(`to_email.ilike.%${search}%,template_key.ilike.%${search}%`)
      }
      query = query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)

      const { data, count, error } = await query
      if (error) throw new Error(error.message)

      const rows = (data || []) as unknown as Array<{
        id: string
        to_email: string
        to_name: string | null
        template_key: string
        status: string
        created_at: string
        updated_at: string
        attempt_count: number
        max_attempts: number
        error_message: string | null
      }>

      const total = count || 0
      return {
        items: rows.map((r) => ({
          id: r.id,
          toEmail: r.to_email,
          toName: r.to_name,
          templateKey: r.template_key,
          status: r.status,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          attemptCount: r.attempt_count,
          maxAttempts: r.max_attempts,
          errorMessage: r.error_message,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }
    } catch {
      return { items: [], total: 0, page, pageSize, totalPages: 1 }
    }
  }

  /**
   * Daily email volume for the last `days` days (sent/delivered/failed).
   * Aggregates in JS over the window — fine at launch scale.
   */
  public static async getEmailVolumeSeries(days = 14): Promise<AdminEmailVolumePoint[]> {
    const supabase = createServiceRoleClient()
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCDate(start.getUTCDate() - (days - 1))

    try {
      const { data, error } = await supabase
        .from('email_queue')
        .select('status, created_at')
        .gte('created_at', start.toISOString())

      if (error) throw new Error(error.message)

      const buckets = new Map<string, { sent: number; delivered: number; failed: number }>()
      for (let i = 0; i < days; i++) {
        const d = new Date(start)
        d.setUTCDate(start.getUTCDate() + i)
        const key = d.toISOString().slice(0, 10)
        buckets.set(key, { sent: 0, delivered: 0, failed: 0 })
      }

      for (const row of (data || []) as unknown as Array<{ status: string; created_at: string }>) {
        const key = String(row.created_at).slice(0, 10)
        const bucket = buckets.get(key)
        if (!bucket) continue
        bucket.sent += 1
        if (row.status === 'delivered') bucket.delivered += 1
        if (row.status === 'failed' || row.status === 'dead_letter') bucket.failed += 1
      }

      return Array.from(buckets.entries()).map(([date, v]) => ({
        label: new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        date,
        sent: v.sent,
        delivered: v.delivered,
        failed: v.failed,
      }))
    } catch {
      return []
    }
  }

  /**
   * Template list derived from the real template registry + automation metadata.
   */
  public static getTemplateList(): AdminTemplateListItem[] {
    const automationByKey = new Map<string, (typeof AUTOMATION_METADATA)[number]>(
      AUTOMATION_METADATA.map((a) => [a.key, a])
    )

    return Object.entries(EMAIL_TEMPLATE_MAP).map(([key, entry]) => {
      const meta = automationByKey.get(key)
      return {
        key,
        name: meta?.name || templateDisplayName(key),
        category: meta?.category || 'System',
        trigger: meta?.description || 'Manual / Hook',
        isCritical: Boolean(meta?.isCritical),
        isDeferred: meta?.isDeferred,
        subjectLine: entry.subjectLine,
      }
    })
  }

  /**
   * Full template detail for the editor: metadata + rendered body with sample data and database version history.
   */
  public static async getTemplateDetail(templateKey: string): Promise<AdminTemplateDetail | null> {
    const entry = EMAIL_TEMPLATE_MAP[templateKey]
    if (!entry) return null

    const automationByKey = new Map<string, (typeof AUTOMATION_METADATA)[number]>(
      AUTOMATION_METADATA.map((a) => [a.key, a])
    )
    const meta = automationByKey.get(templateKey)
    const isCritical = Boolean(meta?.isCritical)

    let isPaused = false
    if (!isCritical) {
      const { EmailAutomationsService } = await import('@/lib/notifications/automations/service')
      const isEnabled = await EmailAutomationsService.isAutomationEnabled(templateKey as never)
      isPaused = !isEnabled
    }

    const supabase = createServiceRoleClient()
    type DbTemplateVersion = {
      version: number
      subject_line: string
      body_html: string
      body_text: string
      status: 'draft' | 'published'
    }
    let dbVersion: DbTemplateVersion | null = null

    try {
      const { data: tpl } = await supabase
        .from('notification_templates')
        .select('id, current_version')
        .eq('template_key', templateKey)
        .maybeSingle()

      if (tpl?.id) {
        const { data: versions } = await supabase
          .from('notification_template_versions')
          .select('version, subject_line, body_html, body_text, status')
          .eq('template_id', tpl.id)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (versions) {
          dbVersion = versions as unknown as DbTemplateVersion
        }
      }
    } catch {
      // Non-fatal database lookup fallback
    }

    try {
      const rendered = await renderEmailTemplate(templateKey, TEMPLATE_SAMPLE_VARIABLES)
      return {
        key: templateKey,
        name: meta?.name || templateDisplayName(templateKey),
        category: meta?.category || 'System',
        trigger: meta?.description || 'Manual / Hook',
        isCritical,
        isDeferred: meta?.isDeferred,
        isPaused,
        subjectLine: dbVersion?.subject_line || entry.subjectLine,
        variables: TEMPLATE_VARIABLE_CATALOG,
        bodyHtml: dbVersion?.body_html || rendered.html,
        bodyText: dbVersion?.body_text || rendered.text,
        currentVersion: dbVersion?.version || 1,
        versionStatus: dbVersion?.status || 'published',
        hasCustomVersion: Boolean(dbVersion),
      }
    } catch {
      // Rendering failure — still return metadata so the editor can explain.
      return {
        key: templateKey,
        name: meta?.name || templateDisplayName(templateKey),
        category: meta?.category || 'System',
        trigger: meta?.description || 'Manual / Hook',
        isCritical,
        isDeferred: meta?.isDeferred,
        isPaused,
        subjectLine: dbVersion?.subject_line || entry.subjectLine,
        variables: TEMPLATE_VARIABLE_CATALOG,
        bodyHtml: dbVersion?.body_html || '',
        bodyText: dbVersion?.body_text || '',
        currentVersion: dbVersion?.version || 1,
        versionStatus: dbVersion?.status || 'published',
        hasCustomVersion: Boolean(dbVersion),
      }
    }
  }

  /**
   * Contact messages (bounded, newest first) for the inbox.
   */
  public static async getContactMessages(limit = 100) {
    const supabase = createServiceRoleClient()
    try {
      const { data, error } = await supabase
        .from('contact_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return (data || []) as unknown as Array<Record<string, unknown>>
    } catch {
      return []
    }
  }

  /**
   * Recent notification events for the Notifications tab.
   */
  public static async getNotificationEvents(limit = 50): Promise<AdminNotificationEventItem[]> {
    const supabase = createServiceRoleClient()
    try {
      const { data, error } = await supabase
        .from('notification_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return ((data || []) as unknown as Array<Record<string, unknown>>).map((e) => ({
        id: String(e.id),
        eventType: String(e.event_type || 'unknown'),
        userId: e.user_id ? String(e.user_id) : null,
        channelsNotified: Array.isArray(e.channels_notified) ? (e.channels_notified as string[]) : [],
        skippedReason: e.skipped_reason ? String(e.skipped_reason) : null,
        createdAt: String(e.created_at || new Date().toISOString()),
        payload: (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<string, unknown>,
      }))
    } catch {
      return []
    }
  }

  /**
   * Overview KPIs + attention rows + recent communication activity.
   */
  public static async getCommunicationsOverview(): Promise<AdminCommunicationsOverview> {
    const supabase = createServiceRoleClient()
    try {
      const [totalEmails, pending, failed, contact, testimonials, recentEmails, recentContact, recentEvents] =
        await Promise.all([
          // Full ledger count — "Emails sent" covers every status (pending,
          // processing, retrying, delivered, failed, dead_letter, suppressed,
          // skipped) so the KPI is not an undercount.
          supabase.from('email_queue').select('id', { count: 'exact', head: true }),
          supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase
            .from('email_queue')
            .select('id', { count: 'exact', head: true })
            .in('status', ['failed', 'dead_letter']),
          supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
          supabase.from('testimonials').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase
            .from('email_queue')
            .select('id, to_email, template_key, status, created_at')
            .order('created_at', { ascending: false })
            .limit(6),
          supabase
            .from('contact_messages')
            .select('id, name, subject, status, created_at')
            .order('created_at', { ascending: false })
            .limit(6),
          supabase
            .from('notification_events')
            .select('id, event_type, skipped_reason, created_at')
            .order('created_at', { ascending: false })
            .limit(6),
        ])

      const emailsSent = totalEmails.count || 0
      const failedCount = failed.count || 0
      const newContact = contact.count || 0
      const pendingTestimonials = testimonials.count || 0

      const attention: AdminAttentionItem[] = [
        {
          id: 'failed-emails',
          label: 'Failed Emails',
          count: failedCount,
          severity: failedCount > 0 ? 'critical' : 'healthy',
          href: '/admin/communications?tab=queue',
          actionLabel: 'Review',
        },
        {
          id: 'contact-messages',
          label: 'New Contact Messages',
          count: newContact,
          severity: newContact > 0 ? 'warning' : 'healthy',
          href: '/admin/communications?tab=contact',
          actionLabel: 'Open Inbox',
        },
        {
          id: 'pending-testimonials',
          label: 'Pending Testimonials',
          count: pendingTestimonials,
          severity: pendingTestimonials > 0 ? 'warning' : 'healthy',
          href: '/admin/feedback',
          actionLabel: 'Review',
        },
      ]

      const recentActivity: AdminCommunicationsOverview['recentActivity'] = []
      for (const row of (recentEmails.data || []) as unknown as Array<Record<string, unknown>>) {
        recentActivity.push({
          id: `email-${String(row.id)}`,
          type: 'email',
          title: String(row.template_key || 'Email'),
          detail: `To ${String(row.to_email || '')} · ${String(row.status || '')}`,
          timestamp: String(row.created_at || ''),
          href: '/admin/communications?tab=email',
        })
      }
      for (const row of (recentContact.data || []) as unknown as Array<Record<string, unknown>>) {
        recentActivity.push({
          id: `contact-${String(row.id)}`,
          type: 'contact',
          title: String(row.subject || 'Contact message'),
          detail: `From ${String(row.name || 'Anonymous')} · ${String(row.status || '')}`,
          timestamp: String(row.created_at || ''),
          href: '/admin/communications?tab=contact',
        })
      }
      for (const row of (recentEvents.data || []) as unknown as Array<Record<string, unknown>>) {
        recentActivity.push({
          id: `event-${String(row.id)}`,
          type: 'notification',
          title: String(row.event_type || 'Notification event'),
          detail: row.skipped_reason ? `Skipped · ${String(row.skipped_reason)}` : 'Processed',
          timestamp: String(row.created_at || ''),
          href: '/admin/communications?tab=notifications',
        })
      }
      recentActivity.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))

      return {
        kpis: {
          emailsSent,
          pending: pending.count || 0,
          failed: failedCount,
          newContactMessages: newContact,
          pendingTestimonials,
        },
        attention,
        recentActivity: recentActivity.slice(0, 12),
      }
    } catch {
      return {
        kpis: { emailsSent: 0, pending: 0, failed: 0, newContactMessages: 0, pendingTestimonials: 0 },
        attention: [],
        recentActivity: [],
      }
    }
  }
}