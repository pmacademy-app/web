/**
 * Prodily PM Academy — Portfolio Activation Campaign Runner & Scheduler Service
 *
 * Campaign ID: portfolio_activation_sep_2026
 *
 * Provides:
 * 1. Timezone-aware date parsing (Asia/Kolkata IST -> UTC ISO).
 * 2. Supabase-backed persistent scheduling in `email_broadcasts`.
 * 3. Server-side cron execution engine called by /api/cron/process-broadcasts.
 * 4. Full idempotency, real-time opt-out checks, rate limiting, and email_queue auditing.
 */

import path from 'path'
import fs from 'fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, maskEmail } from '@/lib/email'
import { BRAND } from '@/lib/brand'

export const CAMPAIGN_ID = 'portfolio_activation_sep_2026'
export const CAMPAIGN_TITLE = 'Prodily Public Portfolio & First Capstone Campaign'
export const DEFAULT_SUBJECT = 'Your Prodily portfolio is ready'
export const DEFAULT_PREVIEW_TEXT = "I wanted to point out something that's already available on your Prodily account."
export const DEFAULT_FROM_EMAIL = 'Aditya from Prodily <aditya@prodily.adityagangwani.me>'
export const DEFAULT_REPLY_TO = 'prodilypm@gmail.com'

export const EXCLUDED_EMAILS = new Set<string>([
  'adityagangwaniexam@gmail.com',
  'pmacademyapp@gmail.com',
  'ryangomez9965@gmail.com',
])

const SEND_SUB_BATCH_SIZE = 5
const DELAY_BETWEEN_SUB_BATCHES_MS = 1000

// ── Types ────────────────────────────────────────────────────────────────────

export interface CandidateUser {
  userId: string
  email: string
  fullName: string
  firstName: string
  username: string
  portfolioUrl: string
  completedLessons: number
  submittedCapstones: number
  totalXp: number
  createdAt: string
}

export interface CampaignLogRecord {
  userId: string
  email: string
  status: 'success' | 'failed'
  provider?: 'brevo' | 'resend' | 'simulated'
  providerMessageId?: string
  resendId?: string
  sentAt: string
  error?: string
}

export interface ParsedScheduleTime {
  isValid: boolean
  utcIso: string | null
  istFormatted: string | null
  error?: string
}

export interface CampaignScheduleStatus {
  exists: boolean
  id: string
  campaignId: string
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled' | 'none'
  scheduledAtUtc: string | null
  scheduledAtIst: string | null
  startedAt: string | null
  completedAt: string | null
  sentCount: number
  failedCount: number
  skippedCount: number
  totalRecipients: number | null
  isDue: boolean
}

// ── IST Timezone & Date Parser ───────────────────────────────────────────────

/**
 * Parses a date/time string specified in IST (Asia/Kolkata, UTC+5:30)
 * and returns the exact UTC ISO string.
 *
 * Supported formats:
 * - "2026-09-08 10:00 AM IST" / "2026-09-08 10:00 AM"
 * - "2026-09-08 10:00:00 IST" / "2026-09-08 10:00"
 * - "2026-09-08T10:00:00+05:30"
 * - Standard ISO strings with explicit offset
 */
export function parseIstDateTime(input: string): ParsedScheduleTime {
  if (!input || typeof input !== 'string') {
    return { isValid: false, utcIso: null, istFormatted: null, error: 'Input string is required.' }
  }

  const cleaned = input.trim()

  // Format 1: Explicit ISO with timezone offset e.g. 2026-09-08T10:00:00+05:30
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:?\d{2}|Z)$/i.test(cleaned)) {
    const d = new Date(cleaned)
    if (isNaN(d.getTime())) {
      return { isValid: false, utcIso: null, istFormatted: null, error: 'Invalid ISO date string.' }
    }
    return formatParsedDate(d)
  }

  // Format 2: "YYYY-MM-DD HH:MM (AM/PM)? (IST)?"
  const match = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?(?:\s+ist)?$/i
  )

  if (!match) {
    return {
      isValid: false,
      utcIso: null,
      istFormatted: null,
      error: 'Invalid format. Expected format: "YYYY-MM-DD HH:MM AM IST" (e.g. "2026-09-08 10:00 AM IST")',
    }
  }

  const [, yStr, mStr, dStr, hourStr, minStr, secStr, meridiem] = match
  const year = parseInt(yStr, 10)
  const month = parseInt(mStr, 10) - 1 // 0-indexed
  const day = parseInt(dStr, 10)
  let hour = parseInt(hourStr, 10)
  const minute = parseInt(minStr, 10)
  const second = secStr ? parseInt(secStr, 10) : 0

  if (meridiem) {
    const isPm = meridiem.toLowerCase() === 'pm'
    if (isPm && hour < 12) hour += 12
    if (!isPm && hour === 12) hour = 0
  }

  // Construct UTC time by subtracting 5 hours and 30 minutes from IST local time
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
  const utcMillis = Date.UTC(year, month, day, hour, minute, second) - IST_OFFSET_MS
  const dateObj = new Date(utcMillis)

  if (isNaN(dateObj.getTime())) {
    return { isValid: false, utcIso: null, istFormatted: null, error: 'Calculated timestamp is invalid.' }
  }

  return formatParsedDate(dateObj)
}

function formatParsedDate(date: Date): ParsedScheduleTime {
  const utcIso = date.toISOString()
  // Format IST display representation
  const istFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const istFormatted = `${istFormatter.format(date)} IST`

  return {
    isValid: true,
    utcIso,
    istFormatted,
  }
}

// ── Personalization & Template Helpers ───────────────────────────────────────

export function deriveFirstName(fullName?: string | null, username?: string | null): string {
  if (fullName && typeof fullName === 'string') {
    const trimmed = fullName.trim()
    if (trimmed.length > 0) {
      const firstToken = trimmed.split(/\s+/)[0]
      if (firstToken && firstToken.length > 0) {
        if (firstToken.length > 1 && firstToken === firstToken.toUpperCase()) {
          return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase()
        }
        return firstToken
      }
    }
  }

  if (username && typeof username === 'string') {
    const trimmed = username.trim()
    if (trimmed.length > 0 && !/^[0-9a-f]{8}$/i.test(trimmed) && !trimmed.includes('@')) {
      if (trimmed.length > 1 && trimmed === trimmed.toUpperCase()) {
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
      }
      return trimmed
    }
  }

  return 'there'
}

export function formatUserPortfolioUrl(siteUrl: string, usernameOrId: string): string {
  const cleanBase = siteUrl.replace(/\/$/, '')
  return `${cleanBase}/p/${encodeURIComponent(usernameOrId)}`
}

export function buildPortfolioActivationEmail({
  firstName,
  portfolioUrl,
  siteUrl,
  subject = DEFAULT_SUBJECT,
  previewText = DEFAULT_PREVIEW_TEXT,
}: {
  firstName: string
  portfolioUrl: string
  siteUrl: string
  subject?: string
  previewText?: string
}) {
  const appUrl = siteUrl.replace(/\/$/, '')
  const ctaUrl = `${appUrl}/capstones`
  const unsubscribeUrl = `${appUrl}/settings?tab=notifications`
  const greeting = `Hey ${firstName},`

  const text = `${greeting}

I wanted to point out something that's already available on your Prodily account.

You have a public portfolio page that you can use on LinkedIn, your resume, or share directly with a recruiter:

${portfolioUrl}

At the moment, your portfolio is still empty because you haven't added a capstone yet.

Once you add your first capstone, your portfolio can start showing the work you've done on Prodily, along with your skill breakdown and skill radar.

You don't need to complete the entire curriculum before you can start building it. Your first capstone is enough to get things started.

If you'd like to set it up, you can add your first capstone here:

Add your first capstone: ${ctaUrl}

Your portfolio is already there. It just needs something to show.

— Aditya
Prodily

${BRAND.positioning}

Manage Preferences / Unsubscribe: ${unsubscribeUrl}`

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
    <div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
      ${previewText}
    </div>
  </head>
  <body style="margin:0; padding:24px 16px; background-color:#FFFFFF; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; font-size:15px; line-height:1.6;">
    <div style="max-width:580px; margin:0 auto;">
      <p style="margin:0 0 16px 0;">${greeting}</p>
      
      <p style="margin:0 0 16px 0;">
        I wanted to point out something that's already available on your Prodily account.
      </p>
      
      <p style="margin:0 0 16px 0;">
        You have a public portfolio page that you can use on LinkedIn, your resume, or share directly with a recruiter:<br>
        <a href="${portfolioUrl}" style="color:#1F6B4E; text-decoration:underline; word-break:break-all;">${portfolioUrl}</a>
      </p>
      
      <p style="margin:0 0 16px 0;">
        At the moment, your portfolio is still empty because you haven't added a capstone yet.
      </p>
      
      <p style="margin:0 0 16px 0;">
        Once you add your first capstone, your portfolio can start showing the work you've done on Prodily, along with your skill breakdown and skill radar.
      </p>
      
      <p style="margin:0 0 16px 0;">
        You don't need to complete the entire curriculum before you can start building it. Your first capstone is enough to get things started.
      </p>
      
      <p style="margin:0 0 16px 0;">
        If you'd like to set it up, you can add your first capstone here:<br>
        <a href="${ctaUrl}" style="color:#1F6B4E; font-weight:600; text-decoration:underline;">Add your first capstone</a>
      </p>
      
      <p style="margin:0 0 20px 0;">
        Your portfolio is already there. It just needs something to show.
      </p>
      
      <p style="margin:0 0 24px 0; line-height:1.4;">
        &mdash; Aditya<br>
        <span style="color:#70685A;">Prodily</span>
      </p>

      <div style="margin-top:32px; padding-top:16px; border-top:1px solid #E5E0D8; font-size:12px; color:#70685A; line-height:1.5;">
        <p style="margin:0 0 8px 0;">${BRAND.positioning}</p>
        <p style="margin:0;">
          <a href="${unsubscribeUrl}" style="color:#70685A; text-decoration:underline;">Manage Preferences</a>
          &nbsp;&middot;&nbsp;
          <a href="${unsubscribeUrl}" style="color:#70685A; text-decoration:underline;">Unsubscribe</a>
        </p>
      </div>
    </div>
  </body>
</html>`

  return { subject, previewText, text, html, portfolioUrl, ctaUrl, siteUrl: appUrl }
}

// ── Audience Resolution Engine ───────────────────────────────────────────────

export async function fetchAudienceAndCandidates(supabase: SupabaseClient): Promise<{
  totalRegistered: number
  countInvalidEmail: number
  countExcludedAdmin: number
  countOptedOut: number
  countSuppressed: number
  alreadySentCount: number
  targetCandidates: CandidateUser[]
  existingCapstoneCount: number
}> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl

  // 1. Fetch all registered users in deterministic order
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRows, error: userErr } = await (supabase.from('users' as any) as any)
    .select('id, email, name, username, created_at')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (userErr) {
    throw new Error(`Failed to query users from Supabase: ${userErr.message}`)
  }

  const totalRegistered = userRows ? userRows.length : 0

  // 2. Fetch completed lesson counts per user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows } = await (supabase.from('user_lesson_progress' as any) as any)
    .select('user_id, status')
    .eq('status', 'completed')

  const lessonCountMap = new Map<string, number>()
  for (const row of progressRows || []) {
    const uid = String(row.user_id)
    lessonCountMap.set(uid, (lessonCountMap.get(uid) || 0) + 1)
  }

  // 3. Fetch XP totals per user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: xpRows } = await (supabase.from('xp_events' as any) as any)
    .select('user_id, xp_amount')

  const xpMap = new Map<string, number>()
  for (const row of xpRows || []) {
    const uid = String(row.user_id)
    xpMap.set(uid, (xpMap.get(uid) || 0) + (Number(row.xp_amount) || 0))
  }

  // 4. Fetch submitted capstone counts per user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: capstoneRows } = await (supabase.from('capstone_submissions' as any) as any)
    .select('user_id, status')
    .in('status', ['submitted', 'reviewed'])

  const capstoneCountMap = new Map<string, number>()
  for (const row of capstoneRows || []) {
    const uid = String(row.user_id)
    capstoneCountMap.set(uid, (capstoneCountMap.get(uid) || 0) + 1)
  }

  // 5. Fetch email suppressions (bounces, spam complaints, manual suppressions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: suppressionRows } = await (supabase.from('email_suppressions' as any) as any)
    .select('email')

  const suppressedEmails = new Set<string>(
    (suppressionRows || []).map((s: { email: string }) => s.email?.trim().toLowerCase())
  )

  // 6. Fetch notification preferences for marketing opt-outs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prefRows } = await (supabase.from('user_notification_preferences' as any) as any)
    .select('user_id, all_notifications, all_email, marketing_email')

  const optOutUserIds = new Set<string>()
  for (const p of prefRows || []) {
    if (p.all_notifications === false || p.all_email === false || p.marketing_email === false) {
      optOutUserIds.add(String(p.user_id))
    }
  }

  // 7. Check auth metadata opt-outs
  try {
    const { data: authData } = await supabase.auth.admin.listUsers()
    if (authData?.users) {
      for (const au of authData.users) {
        if (au.user_metadata?.marketing_opt_out === true || au.user_metadata?.unsubscribed === true) {
          optOutUserIds.add(au.id)
        }
      }
    }
  } catch {
    // Non-fatal if admin API listUsers is restricted
  }

  // 8. Fetch previously delivered records from email_queue for campaign deduplication
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: deliveredQueueRows } = await (supabase.from('email_queue' as any) as any)
    .select('user_id')
    .eq('event_type', 'marketing.portfolio_activation')
    .eq('status', 'delivered')

  const deliveredUserIds = new Set<string>((deliveredQueueRows || []).map((r: { user_id: string }) => r.user_id))

  let countInvalidEmail = 0
  let countExcludedAdmin = 0
  let countOptedOut = 0
  let countSuppressed = 0
  let alreadySentCount = 0
  let existingCapstoneCount = 0

  const targetCandidates: CandidateUser[] = []
  const seenEmails = new Set<string>()

  for (const u of userRows || []) {
    const userId = String(u.id)
    const rawEmail = String(u.email || '').trim().toLowerCase()

    if (!rawEmail || !rawEmail.includes('@') || !rawEmail.includes('.')) {
      countInvalidEmail++
      continue
    }

    if (seenEmails.has(rawEmail)) {
      continue
    }
    seenEmails.add(rawEmail)

    if (EXCLUDED_EMAILS.has(rawEmail)) {
      countExcludedAdmin++
      continue
    }

    if (suppressedEmails.has(rawEmail)) {
      countSuppressed++
      continue
    }

    if (optOutUserIds.has(userId)) {
      countOptedOut++
      continue
    }

    if (deliveredUserIds.has(userId)) {
      alreadySentCount++
      continue
    }

    const submittedCapstones = capstoneCountMap.get(userId) || 0
    if (submittedCapstones > 0) {
      existingCapstoneCount++
      continue
    }

    const completedCount = lessonCountMap.get(userId) || 0
    const totalXp = xpMap.get(userId) || 0
    const rawName = (u.name || u.username || '').trim()
    const firstName = deriveFirstName(u.name, u.username)
    const username = (u.username || u.id.slice(0, 8)).trim()
    const portfolioUrl = formatUserPortfolioUrl(siteUrl, username)

    const candidate: CandidateUser = {
      userId,
      email: rawEmail,
      fullName: rawName || 'Prodily Learner',
      firstName,
      username,
      portfolioUrl,
      completedLessons: completedCount,
      submittedCapstones,
      totalXp,
      createdAt: u.created_at,
    }

    targetCandidates.push(candidate)
  }

  return {
    totalRegistered,
    countInvalidEmail,
    countExcludedAdmin,
    countOptedOut,
    countSuppressed,
    alreadySentCount,
    targetCandidates,
    existingCapstoneCount,
  }
}

// ── Persistent Schedule State Management (Supabase email_broadcasts) ────────

/**
 * Registers or updates a scheduled campaign run in Supabase `email_broadcasts`.
 *
 * Keeps the database record UUID (primary key) separated from the logical campaign identifier (`portfolio_activation_sep_2026`).
 * Prevents duplicate campaign records by updating existing schedule in place.
 */
export async function schedulePortfolioCampaign(
  supabase: SupabaseClient,
  scheduledAtUtc: string
): Promise<{ success: boolean; error?: string; scheduleStatus?: CampaignScheduleStatus }> {
  try {
    const dateObj = new Date(scheduledAtUtc)
    if (isNaN(dateObj.getTime()) || dateObj.getTime() <= Date.now()) {
      return { success: false, error: 'Scheduled time must be a valid timestamp in the future.' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRows, error: findError } = await (supabase.from('email_broadcasts' as any) as any)
      .select('id, status')
      .or(`template_key.eq.marketing.portfolio_activation,name.eq.${CAMPAIGN_ID},name.eq.${CAMPAIGN_TITLE}`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (findError) {
      return { success: false, error: `Database query failed: ${findError.message}` }
    }

    const existingRecord = existingRows && existingRows.length > 0 ? existingRows[0] : null
    const recordId = existingRecord ? existingRecord.id : crypto.randomUUID()

    const payload = {
      id: recordId,
      name: CAMPAIGN_TITLE,
      description: 'Scheduled re-engagement portfolio activation broadcast.',
      template_key: 'marketing.portfolio_activation',
      subject_override: DEFAULT_SUBJECT,
      batch_size: 100,
      recipient_filters: {
        cohort: 'empty_capstones',
        campaignId: CAMPAIGN_ID,
        target: CAMPAIGN_ID,
      },
      scheduled_at: scheduledAtUtc,
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    }

    if (existingRecord) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase.from('email_broadcasts' as any) as any)
        .update(payload)
        .eq('id', existingRecord.id)

      if (updateError) {
        return { success: false, error: updateError.message }
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase.from('email_broadcasts' as any) as any)
        .insert({
          ...payload,
          created_at: new Date().toISOString(),
        })

      if (insertError) {
        return { success: false, error: insertError.message }
      }
    }

    const status = await getPortfolioCampaignStatus(supabase)
    return { success: true, scheduleStatus: status }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to schedule campaign.' }
  }
}

/**
 * Cancels any pending scheduled run for this campaign.
 */
export async function cancelPortfolioCampaign(
  supabase: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRows, error: findError } = await (supabase.from('email_broadcasts' as any) as any)
      .select('id, status')
      .or(`template_key.eq.marketing.portfolio_activation,name.eq.${CAMPAIGN_ID},name.eq.${CAMPAIGN_TITLE}`)
      .order('created_at', { ascending: false })

    if (findError) return { success: false, error: findError.message }
    if (!existingRows || existingRows.length === 0) return { success: true }

    const ids = existingRows.map((r: { id: string }) => r.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('email_broadcasts' as any) as any)
      .update({
        status: 'cancelled',
        scheduled_at: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .neq('status', 'completed')

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to cancel schedule.' }
  }
}

/**
 * Retrieves the current persistent schedule status from Supabase.
 */
export async function getPortfolioCampaignStatus(
  supabase: SupabaseClient
): Promise<CampaignScheduleStatus> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase.from('email_broadcasts' as any) as any)
      .select('*')
      .or(`template_key.eq.marketing.portfolio_activation,name.eq.${CAMPAIGN_ID},name.eq.${CAMPAIGN_TITLE}`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !rows || rows.length === 0) {
      return {
        exists: false,
        id: 'none',
        campaignId: CAMPAIGN_ID,
        status: 'none',
        scheduledAtUtc: null,
        scheduledAtIst: null,
        startedAt: null,
        completedAt: null,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        totalRecipients: null,
        isDue: false,
      }
    }

    const data = rows[0]
    let istFormatted: string | null = null
    let isDue = false

    if (data.scheduled_at) {
      const dt = new Date(data.scheduled_at)
      if (!isNaN(dt.getTime())) {
        const istFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        istFormatted = `${istFormatter.format(dt)} IST`
        isDue = data.status === 'scheduled' && dt.getTime() <= Date.now()
      }
    }

    return {
      exists: true,
      id: data.id,
      campaignId: CAMPAIGN_ID,
      status: data.status,
      scheduledAtUtc: data.scheduled_at,
      scheduledAtIst: istFormatted,
      startedAt: data.started_at,
      completedAt: data.completed_at,
      sentCount: data.sent_count || 0,
      failedCount: data.failed_count || 0,
      skippedCount: data.skipped_count || 0,
      totalRecipients: data.total_recipients || null,
      isDue,
    }
  } catch {
    return {
      exists: false,
      id: 'none',
      campaignId: CAMPAIGN_ID,
      status: 'none',
      scheduledAtUtc: null,
      scheduledAtIst: null,
      startedAt: null,
      completedAt: null,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalRecipients: null,
      isDue: false,
    }
  }
}

// ── Server-Side Scheduled Execution Engine ───────────────────────────────────

/**
 * Executes the scheduled campaign.
 * Called automatically by the cron endpoint (/api/cron/process-broadcasts) or manual trigger.
 */
export async function executePortfolioActivationCampaign(
  supabase: SupabaseClient,
  broadcastRecordId?: string
): Promise<{
  success: boolean
  sentCount: number
  failedCount: number
  skippedCount: number
  totalRecipients: number
  error?: string
}> {
  // Step 1: Resolve target broadcast record to claim
  let targetId = broadcastRecordId
  if (!targetId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: found } = await (supabase.from('email_broadcasts' as any) as any)
      .select('id, status')
      .or(`template_key.eq.marketing.portfolio_activation,name.eq.${CAMPAIGN_ID},name.eq.${CAMPAIGN_TITLE}`)
      .in('status', ['scheduled', 'draft', 'sending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    targetId = found?.id
  }

  if (!targetId) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalRecipients: 0,
      error: 'No matching broadcast record found to execute.',
    }
  }

  // Step 2: Atomic Claim to prevent duplicate concurrent runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: claimed, error: claimError } = await (supabase.from('email_broadcasts' as any) as any)
    .update({
      status: 'sending',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId)
    .in('status', ['scheduled', 'draft'])
    .select('id')
    .maybeSingle()

  if (claimError || !claimed) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalRecipients: 0,
      error: 'Campaign was not in scheduled state or was claimed concurrently.',
    }
  }

  // Step 3: Resolve audience
  const audience = await fetchAudienceAndCandidates(supabase)
  const targetCandidates = audience.targetCandidates

  const senderEmail = process.env.CAMPAIGN_FROM_EMAIL || DEFAULT_FROM_EMAIL
  const replyToEmail = process.env.CAMPAIGN_REPLY_TO_EMAIL || DEFAULT_REPLY_TO
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')

  let successCount = 0
  let failCount = 0
  let skippedCount = 0

  for (let i = 0; i < targetCandidates.length; i += SEND_SUB_BATCH_SIZE) {
    const subBatch = targetCandidates.slice(i, i + SEND_SUB_BATCH_SIZE)

    for (const candidate of subBatch) {
      // Re-verify opt-out in real-time
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pref } = await (supabase.from('user_notification_preferences' as any) as any)
        .select('all_notifications, all_email, marketing_email')
        .eq('user_id', candidate.userId)
        .maybeSingle()

      if (pref && (pref.all_notifications === false || pref.all_email === false || pref.marketing_email === false)) {
        skippedCount++
        continue
      }

      // Re-verify fresh capstone count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: freshCaps } = await (supabase.from('capstone_submissions' as any) as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', candidate.userId)
        .in('status', ['submitted', 'reviewed'])

      if (typeof freshCaps === 'number' && freshCaps > 0) {
        skippedCount++
        continue
      }

      const mail = buildPortfolioActivationEmail({
        firstName: candidate.firstName,
        portfolioUrl: candidate.portfolioUrl,
        siteUrl,
        subject: DEFAULT_SUBJECT,
        previewText: DEFAULT_PREVIEW_TEXT,
      })

      try {
        const res = await sendEmail({
          to: candidate.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          fromEmail: senderEmail,
          replyTo: replyToEmail,
        })

        if (res.success) {
          successCount++
          // Record in public.email_queue for admin panel visibility & deduplication
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('email_queue' as any) as any).insert({
            user_id: candidate.userId,
            to_email: candidate.email,
            to_name: candidate.fullName,
            template_key: 'admin.direct_message',
            event_type: 'marketing.portfolio_activation',
            broadcast_id: targetId,
            template_variables: {
              userName: candidate.firstName,
              subject: mail.subject,
              campaign: CAMPAIGN_ID,
              portfolioUrl: candidate.portfolioUrl,
              provider: res.provider || 'brevo',
            },
            priority: 2,
            status: 'delivered',
            attempt_count: 1,
            max_attempts: 3,
            scheduled_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
            resend_id: res.id || null,
          })
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    if (i + SEND_SUB_BATCH_SIZE < targetCandidates.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_SUB_BATCHES_MS))
    }
  }

  // Step 4: Update final status in email_broadcasts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('email_broadcasts' as any) as any)
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      sent_count: successCount,
      failed_count: failCount,
      skipped_count: skippedCount,
      total_recipients: targetCandidates.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId)

  return {
    success: true,
    sentCount: successCount,
    failedCount: failCount,
    skippedCount: skippedCount,
    totalRecipients: targetCandidates.length,
  }
}
