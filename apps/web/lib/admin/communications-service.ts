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
import {
  TEMPLATE_SAMPLE_VARIABLES,
  TEMPLATE_VARIABLE_CATALOG,
  type AdminTemplateVariable,
} from './template-variables'

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
  /** True for admin-created HTML email templates that exist only in the database (no static component). */
  isCustom?: boolean
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
  /** True for admin-created HTML email templates that exist only in the database (no static component). */
  isCustom?: boolean
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
// TEMPLATE_SAMPLE_VARIABLES / TEMPLATE_VARIABLE_CATALOG / AdminTemplateVariable
// live in ./template-variables (isomorphic — no server-only imports) so the
// client-side template editor can share the exact same catalog instead of
// keeping its own copy. Re-exported here for existing importers.
export {
  TEMPLATE_SAMPLE_VARIABLES,
  TEMPLATE_VARIABLE_CATALOG,
  type AdminTemplateVariable,
} from './template-variables'

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
   * Template list derived from the static template registry + automation metadata,
   * merged with admin-created custom HTML templates that exist only in the
   * `notification_templates` table (no static component in EMAIL_TEMPLATE_MAP).
   * Without this merge, a newly-created custom template would be invisible in
   * the admin UI despite having been saved successfully.
   */
  public static async getTemplateList(): Promise<AdminTemplateListItem[]> {
    const automationByKey = new Map<string, (typeof AUTOMATION_METADATA)[number]>(
      AUTOMATION_METADATA.map((a) => [a.key, a])
    )

    const staticItems: AdminTemplateListItem[] = Object.entries(EMAIL_TEMPLATE_MAP).map(([key, entry]) => {
      const meta = automationByKey.get(key)
      return {
        key,
        name: meta?.name || templateDisplayName(key),
        category: meta?.category || 'System',
        trigger: meta?.description || 'Manual / Hook',
        isCritical: Boolean(meta?.isCritical),
        isDeferred: meta?.isDeferred,
        subjectLine: entry.subjectLine,
        isCustom: false,
      }
    })

    const staticKeys = new Set(Object.keys(EMAIL_TEMPLATE_MAP))

    try {
      const supabase = createServiceRoleClient()
      const { data: customTemplates } = await supabase
        .from('notification_templates')
        .select('id, template_key, category')
        .order('created_at', { ascending: false })

      const rows = (customTemplates || []) as unknown as Array<{ id: string; template_key: string; category: string | null }>
      const customOnlyRows = rows.filter((r) => !staticKeys.has(r.template_key))

      if (customOnlyRows.length > 0) {
        const templateIds = customOnlyRows.map((r) => r.id)
        const { data: versions } = await supabase
          .from('notification_template_versions')
          .select('template_id, subject_line, status, version')
          .in('template_id', templateIds)
          .order('version', { ascending: false })

        const latestSubjectByTemplateId = new Map<string, string>()
        for (const v of (versions || []) as unknown as Array<{ template_id: string; subject_line: string }>) {
          if (!latestSubjectByTemplateId.has(v.template_id)) {
            latestSubjectByTemplateId.set(v.template_id, v.subject_line)
          }
        }

        const customItems: AdminTemplateListItem[] = customOnlyRows.map((r) => ({
          key: r.template_key,
          name: templateDisplayName(r.template_key),
          category: r.category || 'Custom',
          trigger: 'Admin-created (manual broadcasts)',
          isCritical: false,
          isDeferred: false,
          subjectLine: latestSubjectByTemplateId.get(r.id) || '',
          isCustom: true,
        }))

        return [...customItems, ...staticItems]
      }
    } catch (err) {
      console.warn('[CommunicationsService] Failed to load custom templates:', err)
    }

    return staticItems
  }

  /**
   * Full template detail for the editor: metadata + rendered body with sample data and database version history.
   * Falls back to a database-only lookup for admin-created custom templates
   * that have no static component in EMAIL_TEMPLATE_MAP.
   */
  public static async getTemplateDetail(templateKey: string): Promise<AdminTemplateDetail | null> {
    const entry = EMAIL_TEMPLATE_MAP[templateKey]

    if (!entry) {
      return CommunicationsService.getCustomTemplateDetail(templateKey)
    }

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
   * Loads an admin-created custom HTML template directly from the database.
   * Used when a template key has no static component in EMAIL_TEMPLATE_MAP —
   * there is no React component to render, so the DB version's HTML is the
   * entire template (no static fallback).
   */
  private static async getCustomTemplateDetail(templateKey: string): Promise<AdminTemplateDetail | null> {
    const supabase = createServiceRoleClient()

    const { data: tpl } = await supabase
      .from('notification_templates')
      .select('id, category, current_version')
      .eq('template_key', templateKey)
      .maybeSingle()

    if (!tpl?.id) return null

    const { data: latestVersion } = await supabase
      .from('notification_template_versions')
      .select('version, subject_line, body_html, body_text, status')
      .eq('template_id', tpl.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const version = latestVersion as unknown as {
      version: number
      subject_line: string
      body_html: string
      body_text: string
      status: string
    } | null

    return {
      key: templateKey,
      name: templateDisplayName(templateKey),
      category: tpl.category || 'Custom',
      trigger: 'Admin-created (manual broadcasts)',
      isCritical: false,
      isDeferred: false,
      isPaused: version?.status === 'paused',
      subjectLine: version?.subject_line || '',
      variables: TEMPLATE_VARIABLE_CATALOG,
      bodyHtml: version?.body_html || '',
      bodyText: version?.body_text || '',
      currentVersion: version?.version || 1,
      versionStatus: version?.status === 'draft' ? 'draft' : 'published',
      hasCustomVersion: true,
      isCustom: true,
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