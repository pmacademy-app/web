import path from 'path'
import fs from 'fs'

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  }
}

// Load environment variables from apps/web/.env.local and .env
loadEnvFile(path.resolve(__dirname, '../.env.local'))
loadEnvFile(path.resolve(__dirname, '../.env'))

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { BRAND } from '@/lib/brand'

const CAMPAIGN_ID = 'reengagement_aug_2026'
const LOG_DIR = path.resolve(__dirname, 'logs')
const LOG_FILE = path.resolve(LOG_DIR, `campaign_sent_${CAMPAIGN_ID}.json`)
const BATCH_SIZE = 5
const DELAY_BETWEEN_BATCHES_MS = 1000

interface CampaignLogRecord {
  userId: string
  email: string
  audience: 'A' | 'B'
  status: 'success' | 'failed'
  sentAt: string
  error?: string
}

/**
 * Candidate: a user identified during initial evaluation as potentially eligible.
 * Audience membership is NOT confirmed here — it is re-verified from Supabase
 * immediately before each production send.
 */
interface Candidate {
  userId: string
  email: string
  firstName: string
  /** Initial audience estimate based on evaluation snapshot — NOT used for production send logic */
  initialAudience: 'A' | 'B'
  /** Initial lesson count — NOT used for production email content in production mode */
  initialCompletedCount: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureLogDirExists() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

function loadLogRecords(): Map<string, CampaignLogRecord> {
  ensureLogDirExists()
  if (!fs.existsSync(LOG_FILE)) {
    return new Map()
  }
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf-8')
    const list: CampaignLogRecord[] = JSON.parse(raw)
    const map = new Map<string, CampaignLogRecord>()
    for (const item of list) {
      if (item.userId) {
        map.set(item.userId, item)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

function saveLogRecord(record: CampaignLogRecord) {
  ensureLogDirExists()
  const map = loadLogRecords()
  map.set(record.userId, record)
  const list = Array.from(map.values())
  fs.writeFileSync(LOG_FILE, JSON.stringify(list, null, 2), 'utf-8')
}

function deriveFirstName(fullName: string | null | undefined): string {
  if (fullName && fullName.trim().length > 0) {
    const first = fullName.trim().split(/\s+/)[0]
    if (first && first.length > 0) return first
  }
  return 'there'
}

/**
 * Fetch the fresh completed lesson count using a count query.
 * Supabase count queries return the count in the response metadata.
 */
async function fetchFreshCompletedCountViaCount(supabase: SupabaseClient, userId: string): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (supabase.from('user_lesson_progress' as any) as any)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed')
    if (error) return null
    return typeof count === 'number' ? count : 0
  } catch {
    return null
  }
}

/**
 * Check whether a user is currently opted out of marketing emails.
 * Re-checks user_notification_preferences immediately before send.
 * Returns true if opted out (should skip), false if eligible to receive.
 */
async function isFreshOptOut(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('user_notification_preferences' as any) as any)
      .select('all_notifications, all_email, marketing_email')
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return false // No preference row = default allow
    return data.all_notifications === false || data.all_email === false || data.marketing_email === false
  } catch {
    return false // On error, default to allowing (safe — will not silence a legitimate opt-out)
  }
}

// ── Email Templates ─────────────────────────────────────────────────────────

function buildEmailAudienceA(firstName: string, ctaUrl: string, siteUrl: string) {
  const subject = "You signed up. Now let's get started 🚀"
  const previewText = "Your first Product Management lesson is waiting for you."
  const greeting = `Hey ${firstName},`

  const text = `${greeting}

You signed up for Prodily, but you haven't started your first lesson yet.

No worries — getting started is usually the hardest part.

PM Academy is built to help you learn Product Management step by step, without having to piece everything together from random videos, articles, and courses.

Take a few minutes today and start your first lesson.

Start Learning: ${ctaUrl}

And if you're not sure where to begin or there's something stopping you from getting started, just reply to this email. We'd love to hear from you.

We're still building Prodily, and your feedback genuinely helps us make it better.

— Team Prodily

Learn Product Management. Build your career.

Prodily PM Academy · 90 lessons. 9 modules. Free forever.
Manage Preferences / Unsubscribe: ${siteUrl}/settings?tab=notifications`

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
  <body style="margin:0; padding:32px 16px; background-color:#FBFAF6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellPadding="0" cellSpacing="0" style="width:100%; max-width:560px; margin:0 auto;">
      <!-- Header (matching Confirm Email Address design) -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}/brand/logo-mark.png" alt="Prodily" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">Prodily</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">PM Academy</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You signed up for Prodily, but you haven't started your first lesson yet.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">No worries — getting started is usually the hardest part.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">PM Academy is built to help you learn Product Management step by step, without having to piece everything together from random videos, articles, and courses.</p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Take a few minutes today and start your first lesson.</p>
          
          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Start Learning →</a>
          </div>

          <p style="margin:24px 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">And if you're not sure where to begin or there's something stopping you from getting started, just reply to this email. We'd love to hear from you.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">We're still building Prodily, and your feedback genuinely helps us make it better.</p>
          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
        </td>
      </tr>

      <!-- Footer (matching Confirm Email Address design) -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">Prodily PM Academy · 90 lessons. 9 modules. Free forever.</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} Prodily PM Academy. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, text, html }
}

function buildEmailAudienceB(firstName: string, completedCount: number, ctaUrl: string, siteUrl: string) {
  const subject = "You're already started. Keep going 💪"
  const previewText = "Pick up where you left off in PM Academy."
  const greeting = `Hey ${firstName},`
  const lessonNoun = completedCount === 1 ? 'lesson' : 'lessons'

  const text = `${greeting}

You've already started your journey on Prodily — now let's keep it going.

You've completed ${completedCount} ${lessonNoun} so far, and there's a lot more waiting for you in PM Academy.

Each lesson builds on the previous one, so even a little progress every day can take you a long way.

Continue Learning: ${ctaUrl}

Got feedback, found something confusing, or have a topic you'd like us to cover?

Just reply to this email. We're building Prodily with learners, and we'd love to hear from you.

— Team Prodily

Learn Product Management. Build your career.

Prodily PM Academy · 90 lessons. 9 modules. Free forever.
Manage Preferences / Unsubscribe: ${siteUrl}/settings?tab=notifications`

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
  <body style="margin:0; padding:32px 16px; background-color:#FBFAF6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#171A17; line-height:1.6;">
    <table role="presentation" width="100%" border="0" cellPadding="0" cellSpacing="0" style="width:100%; max-width:560px; margin:0 auto;">
      <!-- Header (matching Confirm Email Address design) -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}/brand/logo-mark.png" alt="Prodily" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">Prodily</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">PM Academy</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You've already started your journey on Prodily — now let's keep it going.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You've completed <strong>${completedCount} ${lessonNoun}</strong> so far, and there's a lot more waiting for you in PM Academy.</p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Each lesson builds on the previous one, so even a little progress every day can take you a long way.</p>
          
          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Continue Learning →</a>
          </div>

          <p style="margin:24px 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Got feedback, found something confusing, or have a topic you'd like us to cover?</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Just reply to this email. We're building Prodily with learners, and we'd love to hear from you.</p>
          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
        </td>
      </tr>

      <!-- Footer (matching Confirm Email Address design) -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">Prodily PM Academy · 90 lessons. 9 modules. Free forever.</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} Prodily PM Academy. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, text, html }
}

// ── Main Execution ────────────────────────────────────────────────────────────

async function runCampaign() {
  const args = process.argv.slice(2)
  const isTestMode = args.some((a) => a.startsWith('--test-email=') || a.startsWith('--test='))
  const isConfirmSend = args.includes('--confirm-send')
  const isDryRun = !isConfirmSend && !isTestMode

  const testEmailArg = args.find((a) => a.startsWith('--test-email=') || a.startsWith('--test='))
  const testEmail = testEmailArg ? testEmailArg.split('=')[1]?.trim() : null

  console.log('\n=================================================================')
  console.log(`🚀 PRODILY RE-ENGAGEMENT EMAIL CAMPAIGN (${CAMPAIGN_ID})`)
  console.log('=================================================================\n')

  if (isDryRun) {
    console.log('⚠️  MODE: DRY-RUN (No emails will be sent)\n')
  } else if (isTestMode) {
    console.log(`🧪 MODE: TEST-SEND (Sending sample emails to: ${testEmail})\n`)
  } else if (isConfirmSend) {
    console.log('🔥 MODE: PRODUCTION SEND (--confirm-send specified)\n')
  }

  // Requirement 4: Require SUPABASE_SERVICE_ROLE_KEY for production sends.
  // Never fall back silently to the anon key for a server-side campaign.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL is missing from environment.')
    process.exit(1)
  }

  if (isConfirmSend && !serviceRoleKey) {
    console.error(
      '❌ Error: SUPABASE_SERVICE_ROLE_KEY is required for production sends.\n' +
      '   This script will NOT fall back to the anon key during production.\n' +
      '   Set SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local and retry.'
    )
    process.exit(1)
  }

  // For test/dry-run modes we allow anon key as fallback (no emails to real users in those modes)
  const supabaseKey = serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseKey) {
    console.error('❌ Error: No Supabase key found. Set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')
  const ctaUrl = `${siteUrl}/academy`

  // ── Test Mode ───────────────────────────────────────────────────────────────
  // Test mode uses a fixed fake recipient for demonstration only.
  // Audience A/B counts are hardcoded for the test send — this is acceptable only
  // because no production users receive these emails.
  if (isTestMode && testEmail) {
    console.log(`Sending Audience A test email to ${testEmail}...`)
    const tA = buildEmailAudienceA('Alex', ctaUrl, siteUrl)
    const resA = await sendEmail({ to: testEmail, subject: `[TEST A] ${tA.subject}`, html: tA.html, text: tA.text })
    console.log(`Result A: ${resA.success ? '✅ SUCCESS' : `❌ FAILED (${resA.error})`}`)

    console.log(`Sending Audience B test email (3 completed lessons) to ${testEmail}...`)
    const tB = buildEmailAudienceB('Alex', 3, ctaUrl, siteUrl)
    const resB = await sendEmail({ to: testEmail, subject: `[TEST B] ${tB.subject}`, html: tB.html, text: tB.text })
    console.log(`Result B: ${resB.success ? '✅ SUCCESS' : `❌ FAILED (${resB.error})`}`)

    console.log('\n✨ Test send completed!\n')
    return
  }

  // ── Initial Evaluation (Candidate List) ─────────────────────────────────────
  // This phase builds the CANDIDATE list for the dry-run summary and the
  // initial production candidate pool.
  //
  // IMPORTANT: For production, this list is ONLY used to identify who to visit.
  // Audience assignment and lesson count are re-verified per user from Supabase
  // immediately before each send (see "Production Dispatch Flow" below).

  // 1. Fetch all registered users from public.users
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRows, error: userErr } = await (supabase.from('users' as any) as any)
    .select('id, email, name, created_at')

  if (userErr) {
    console.error('❌ Failed to fetch users from Supabase:', userErr)
    process.exit(1)
  }

  const totalRegisteredUsers = userRows ? userRows.length : 0

  // 2. Fetch completed lesson progress (bulk snapshot for evaluation summary only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows, error: progErr } = await (supabase.from('user_lesson_progress' as any) as any)
    .select('user_id, status')
    .eq('status', 'completed')

  if (progErr) {
    console.error('⚠️ Warning: Failed to fetch user_lesson_progress:', progErr)
  }

  const completionCounts = new Map<string, number>()
  if (progressRows) {
    for (const row of progressRows) {
      const uid = String(row.user_id)
      completionCounts.set(uid, (completionCounts.get(uid) || 0) + 1)
    }
  }

  // 3. Fetch notification preferences for opt-outs (bulk snapshot for evaluation only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prefRows } = await (supabase.from('user_notification_preferences' as any) as any)
    .select('user_id, all_notifications, all_email, marketing_email')

  const optOutSet = new Set<string>()
  if (prefRows) {
    for (const p of prefRows) {
      if (p.all_notifications === false || p.all_email === false || p.marketing_email === false) {
        optOutSet.add(String(p.user_id))
      }
    }
  }

  // 4. Fetch auth metadata for additional opt-out flags
  const authOptOutSet = new Set<string>()
  try {
    const { data: authData } = await supabase.auth.admin.listUsers()
    if (authData?.users) {
      for (const au of authData.users) {
        if (au.user_metadata?.marketing_opt_out === true || au.user_metadata?.unsubscribed === true) {
          authOptOutSet.add(au.id)
        }
      }
    }
  } catch {
    // Non-fatal if admin API listUsers is restricted
  }

  // Load existing log for idempotency check
  const sentLog = loadLogRecords()

  let countInvalidEmail = 0
  let countOptedOut = 0
  let countAlreadySent = 0
  let countExcludedOther = 0

  // Candidate list — audience is an initial estimate only, re-verified before each production send
  const candidates: Candidate[] = []
  let initialAudienceACount = 0
  let initialAudienceBCount = 0

  for (const u of userRows || []) {
    const userId = String(u.id)
    const email = String(u.email || '').trim().toLowerCase()

    if (!email || !email.includes('@')) {
      countInvalidEmail++
      continue
    }

    if (optOutSet.has(userId) || authOptOutSet.has(userId)) {
      countOptedOut++
      continue
    }

    if (sentLog.has(userId) && sentLog.get(userId)?.status === 'success') {
      countAlreadySent++
      continue
    }

    const completed = completionCounts.get(userId) || 0
    const firstName = deriveFirstName(u.name)

    if (completed === 0) {
      candidates.push({ userId, email, firstName, initialAudience: 'A', initialCompletedCount: 0 })
      initialAudienceACount++
    } else if (completed >= 1 && completed <= 5) {
      candidates.push({ userId, email, firstName, initialAudience: 'B', initialCompletedCount: completed })
      initialAudienceBCount++
    } else {
      countExcludedOther++ // 6+ completed lessons — excluded
    }
  }

  // 5. Display Evaluation Summary
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`📊 INITIAL EVALUATION SUMMARY (snapshot from Supabase):`)
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`  Total registered users evaluated : ${totalRegisteredUsers}`)
  console.log(`  Invalid / missing emails         : ${countInvalidEmail}`)
  console.log(`  Opted-out / unsubscribed         : ${countOptedOut}`)
  console.log(`  Already sent (idempotent skip)   : ${countAlreadySent}`)
  console.log(`  Excluded (6+ completed lessons)  : ${countExcludedOther}`)
  console.log(`-----------------------------------------------------------------`)
  console.log(`  🎯 Initial Audience A candidates (0 completed lessons): ${initialAudienceACount}`)
  console.log(`  🎯 Initial Audience B candidates (1-5 completed lessons): ${initialAudienceBCount}`)
  console.log(`  TOTAL CANDIDATES                 : ${candidates.length}`)
  console.log('─────────────────────────────────────────────────────────────────\n')
  console.log('  ℹ️  Note: For production, audience is re-verified from Supabase')
  console.log('     immediately before each send. The above counts are estimates only.')
  console.log('─────────────────────────────────────────────────────────────────\n')

  // Sample Recipients
  const sampleA = candidates.filter((c) => c.initialAudience === 'A').slice(0, 3)
  const sampleB = candidates.filter((c) => c.initialAudience === 'B').slice(0, 3)

  console.log('📋 SAMPLE CANDIDATES:')
  console.log('  [Audience A Sample (initially 0 lessons)]:')
  if (sampleA.length === 0) {
    console.log('    (None found)')
  } else {
    sampleA.forEach((r, i) => {
      console.log(`    ${i + 1}. ${r.firstName} <${r.email}> (ID: ${r.userId})`)
    })
  }

  console.log('\n  [Audience B Sample (initially 1-5 lessons)]:')
  if (sampleB.length === 0) {
    console.log('    (None found)')
  } else {
    sampleB.forEach((r, i) => {
      const noun = r.initialCompletedCount === 1 ? 'lesson' : 'lessons'
      console.log(`    ${i + 1}. ${r.firstName} <${r.email}> — ${r.initialCompletedCount} ${noun} (ID: ${r.userId})`)
    })
  }

  console.log('\n─────────────────────────────────────────────────────────────────\n')

  if (isDryRun) {
    console.log('💡 Dry-run evaluation complete. No emails were sent.')
    console.log('   To test send:     npx tsx scripts/send-reengagement-campaign.ts --test-email=your-email@example.com')
    console.log('   To execute send:  npx tsx scripts/send-reengagement-campaign.ts --confirm-send\n')
    return
  }

  // ── Production Dispatch Flow ──────────────────────────────────────────────────
  //
  // For each candidate in the list:
  //
  //   1. Re-check idempotency log (in case a previous batch already sent to this user)
  //   2. Fetch FRESH opt-out status from Supabase (user_notification_preferences)
  //   3. Fetch FRESH completed lesson count from Supabase (user_lesson_progress)
  //   4. Determine audience from fresh count:
  //        0 → Audience A
  //        1–5 → Audience B
  //        6+ → skip (no longer eligible)
  //   5. Build the email using the fresh lesson count (for Audience B: shows real current count)
  //   6. Send the email
  //   7. Only after a successful send, write the idempotency log record

  if (candidates.length === 0) {
    console.log('✅ No pending candidates to email.')
    return
  }

  console.log(`🚀 Starting production send to ${candidates.length} candidates...`)
  console.log('   (Audience A/B will be confirmed fresh from Supabase before each send)\n')

  let successCountA = 0
  let successCountB = 0
  let failCount = 0
  let skippedFreshOptOut = 0
  let skippedFresh6Plus = 0
  let skippedFreshStateChange = 0 // e.g. user was A but is now B, or B but now 6+

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} candidates)...`)

    for (const candidate of batch) {
      try {
        // Step 1: Re-check idempotency log before touching Supabase
        const freshLog = loadLogRecords()
        if (freshLog.has(candidate.userId) && freshLog.get(candidate.userId)?.status === 'success') {
          console.log(`  ⏭️  Already sent — skipping ${candidate.email}`)
          countAlreadySent++
          continue
        }

        // Step 2: Fresh opt-out check from Supabase
        const optedOut = await isFreshOptOut(supabase, candidate.userId)
        if (optedOut) {
          console.log(`  🚫 Opted out (fresh check) — skipping ${candidate.email}`)
          skippedFreshOptOut++
          continue
        }

        // Step 3: Fresh lesson count from Supabase
        const freshCount = await fetchFreshCompletedCountViaCount(supabase, candidate.userId)
        if (freshCount === null) {
          // Supabase query failed — skip to avoid sending wrong template
          console.error(`  ⚠️  Could not fetch fresh lesson count for ${candidate.email} — skipping`)
          skippedFreshStateChange++
          continue
        }

        // Step 4: Determine audience from fresh count
        let freshAudience: 'A' | 'B' | 'SKIP'
        if (freshCount === 0) {
          freshAudience = 'A'
        } else if (freshCount >= 1 && freshCount <= 5) {
          freshAudience = 'B'
        } else {
          // 6+ completed lessons — no longer eligible
          freshAudience = 'SKIP'
        }

        if (freshAudience === 'SKIP') {
          const reason = freshCount >= 6
            ? `now has ${freshCount} completed lessons (6+ threshold)`
            : 'state changed'
          console.log(`  ⏭️  Excluded — ${candidate.email} (${reason})`)
          skippedFresh6Plus++
          continue
        }

        // Log state changes (initial vs fresh) for audit — does NOT affect send logic
        if (freshAudience !== candidate.initialAudience) {
          console.log(
            `  🔄 State change: ${candidate.email} was initially Audience ${candidate.initialAudience}` +
            ` but is now Audience ${freshAudience} (fresh count: ${freshCount} lessons)`
          )
          skippedFreshStateChange++
          // We still send — just to the correct fresh audience
        }

        // Step 5: Build email template using fresh data
        const mailContent =
          freshAudience === 'A'
            ? buildEmailAudienceA(candidate.firstName, ctaUrl, siteUrl)
            : buildEmailAudienceB(candidate.firstName, freshCount, ctaUrl, siteUrl)

        // Step 6: Send the email
        const res = await sendEmail({
          to: candidate.email,
          subject: mailContent.subject,
          html: mailContent.html,
          text: mailContent.text,
        })

        // Step 7: Write idempotency log ONLY after a confirmed successful send
        if (res.success) {
          if (freshAudience === 'A') { successCountA++ } else { successCountB++ }
          console.log(`  ✅ [Audience ${freshAudience}] Sent to ${candidate.email} (fresh count: ${freshCount} lessons)`)
          saveLogRecord({
            userId: candidate.userId,
            email: candidate.email,
            audience: freshAudience,
            status: 'success',
            sentAt: new Date().toISOString(),
          })
        } else {
          failCount++
          console.error(`  ❌ [Audience ${freshAudience}] Failed for ${candidate.email}: ${res.error}`)
          saveLogRecord({
            userId: candidate.userId,
            email: candidate.email,
            audience: freshAudience,
            status: 'failed',
            sentAt: new Date().toISOString(),
            error: res.error,
          })
        }
      } catch (err) {
        failCount++
        const errStr = err instanceof Error ? err.message : 'Unknown exception'
        console.error(`  ❌ Exception sending to ${candidate.email}: ${errStr}`)
        saveLogRecord({
          userId: candidate.userId,
          email: candidate.email,
          audience: candidate.initialAudience,
          status: 'failed',
          sentAt: new Date().toISOString(),
          error: errStr,
        })
      }
    }

    if (i + BATCH_SIZE < candidates.length) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  // Production Confirmation Summary (Requirement 6)
  const totalSuccess = successCountA + successCountB
  console.log('\n=================================================================')
  console.log(`🎉 CAMPAIGN DISPATCH COMPLETE (${CAMPAIGN_ID})`)
  console.log('=================================================================')
  console.log(`  Initial candidates evaluated     : ${candidates.length}`)
  console.log(`  Skipped — fresh opt-out          : ${skippedFreshOptOut}`)
  console.log(`  Skipped — fresh 6+ lessons       : ${skippedFresh6Plus}`)
  console.log(`  State changed (sent to correct)  : ${skippedFreshStateChange}`)
  console.log(`-----------------------------------------------------------------`)
  console.log(`  ✅ Sent as Audience A (0 lessons): ${successCountA}`)
  console.log(`  ✅ Sent as Audience B (1-5 lessons): ${successCountB}`)
  console.log(`  ✅ Total successful sends        : ${totalSuccess}`)
  console.log(`  ❌ Failed sends                  : ${failCount}`)
  console.log(`  📁 Log saved to                  : ${LOG_FILE}`)
  console.log('  ℹ️  A/B counts above reflect FRESH Supabase data at time of send')
  console.log('=================================================================\n')
}

runCampaign().catch((err) => {
  console.error('Fatal campaign script error:', err)
  process.exit(1)
})
