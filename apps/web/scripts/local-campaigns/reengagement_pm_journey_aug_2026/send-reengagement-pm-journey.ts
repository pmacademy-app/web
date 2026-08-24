import path from 'path'
import fs from 'fs'
import readline from 'readline'

// ── Environment Loading ──────────────────────────────────────────────────────
// Mirrors the loader used in previous campaign scripts.
// Must happen before any @/ imports so env vars are available to BRAND etc.

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

// Load from apps/web/.env.local and apps/web/.env
// __dirname = apps/web/scripts/local-campaigns/reengagement_pm_journey_aug_2026 → ../../../ = apps/web/
loadEnvFile(path.resolve(__dirname, '../../../.env.local'))
loadEnvFile(path.resolve(__dirname, '../../../.env'))

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { BRAND } from '@/lib/brand'

// ── Campaign Configuration ───────────────────────────────────────────────────

export const CAMPAIGN_ID = 'reengagement_pm_journey_aug_2026'
const LOG_DIR = path.resolve(__dirname, 'logs')
const LOG_FILE = path.resolve(LOG_DIR, `campaign_sent_${CAMPAIGN_ID}.json`)

/** Explicitly excluded internal/admin email addresses for production sends. */
export const EXCLUDED_EMAILS = new Set<string>([
  'adityagangwaniexam@gmail.com',
  'pmacademyapp@gmail.com',
  'ryangomez9965@gmail.com',
])

/** Number of recipients processed per sub-batch before a delay pause. */
const SEND_BATCH_SIZE = 5
/** Delay in ms between sub-batches to avoid overwhelming Resend API. */
const DELAY_BETWEEN_BATCHES_MS = 1000

// ── Types ────────────────────────────────────────────────────────────────────

export interface CampaignLogRecord {
  userId: string
  email: string
  status: 'success' | 'failed'
  sentAt: string
  error?: string
}

export interface Candidate {
  userId: string
  email: string
  firstName: string
  totalXp: number
}

// ── Log Helpers ──────────────────────────────────────────────────────────────

function ensureLogDirExists() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

export function loadLogRecords(logFilePath: string = LOG_FILE): Map<string, CampaignLogRecord> {
  if (!fs.existsSync(logFilePath)) return new Map()
  try {
    const raw = fs.readFileSync(logFilePath, 'utf-8')
    const list: CampaignLogRecord[] = JSON.parse(raw)
    const map = new Map<string, CampaignLogRecord>()
    for (const item of list) {
      if (item.userId) map.set(item.userId, item)
    }
    return map
  } catch {
    return new Map()
  }
}

export function saveLogRecord(record: CampaignLogRecord, logFilePath: string = LOG_FILE) {
  const dir = path.dirname(logFilePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const map = loadLogRecords(logFilePath)
  map.set(record.userId, record)
  fs.writeFileSync(logFilePath, JSON.stringify(Array.from(map.values()), null, 2), 'utf-8')
}

// ── Utility Helpers ──────────────────────────────────────────────────────────

export function deriveFirstName(
  fullName?: string | null,
  username?: string | null,
  email?: string | null
): string {
  if (fullName && fullName.trim().length > 0) {
    const first = fullName.trim().split(/\s+/)[0]
    if (first && first.length > 0) return first
  }
  if (username && username.trim().length > 0) {
    return username.trim()
  }
  if (email && email.includes('@')) {
    const localPart = email.split('@')[0].split('+')[0].replace(/[._-]/g, ' ').trim()
    const firstWord = localPart.split(/\s+/)[0]
    if (firstWord && firstWord.length > 0) {
      return firstWord.charAt(0).toUpperCase() + firstWord.slice(1)
    }
  }
  return 'there'
}

/** Prompt for a line of stdin input and resolve with the trimmed string. */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// ── Supabase Opt-Out Helper ──────────────────────────────────────────────────

/**
 * Check whether a user has opted out of marketing emails.
 * Re-checks user_notification_preferences immediately before send.
 * Returns true if opted out (should skip), false if eligible.
 */
export async function isFreshOptOut(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('user_notification_preferences' as any) as any)
      .select('all_notifications, all_email, marketing_email')
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return false // No preference row = default allow
    return data.all_notifications === false || data.all_email === false || data.marketing_email === false
  } catch {
    return false // On error, default to allowing (safe)
  }
}

// ── Email Template Builder ───────────────────────────────────────────────────

export function buildEmailContent(firstName: string, ctaUrl: string, siteUrl: string) {
  const subject = 'You left something unfinished'
  const previewText = 'Your progress is still there. If you’ve got 10 minutes today, come back and pick up where you left off.'
  const greeting = `Hey ${firstName},`

  const text = `${greeting}

You started learning PM with Prodily — and I noticed you haven’t been back in a while.

Your progress is still there.

If you’ve got 10 minutes today, come back and pick up where you left off. There’s always one more concept, lesson, or idea that can make you a better product manager.

Continue where you left off → ${ctaUrl}

No big commitment. Just 10 minutes.

— Aditya
Founder, Prodily

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
  <body style="margin:0; padding:24px 16px; background-color:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:15px; color:#171A17; line-height:1.6;">
    <div style="max-width:560px; margin:0 auto;">
      <p style="margin:0 0 16px 0; font-size:15px; color:#171A17; line-height:1.6;">${greeting}</p>
      <p style="margin:0 0 16px 0; font-size:15px; color:#171A17; line-height:1.6;">You started learning PM with Prodily — and I noticed you haven’t been back in a while.</p>
      <p style="margin:0 0 16px 0; font-size:15px; color:#171A17; line-height:1.6;">Your progress is still there.</p>
      <p style="margin:0 0 16px 0; font-size:15px; color:#171A17; line-height:1.6;">If you’ve got 10 minutes today, come back and pick up where you left off. There’s always one more concept, lesson, or idea that can make you a better product manager.</p>
      <p style="margin:24px 0; font-size:15px; line-height:1.6;">
        <a href="${ctaUrl}" style="color:#1F6B4E; font-weight:600; text-decoration:underline;">Continue where you left off →</a>
      </p>
      <p style="margin:0 0 24px 0; font-size:15px; color:#171A17; line-height:1.6;">No big commitment. Just 10 minutes.</p>
      <p style="margin:0 0 4px 0; font-size:15px; color:#171A17; line-height:1.6;">— Aditya<br /><span style="color:#70685A; font-size:14px;">Founder, Prodily</span></p>

      <div style="margin-top:36px; padding-top:16px; border-top:1px solid #EAE6DF; font-size:12px; color:#8C8578; line-height:1.5;">
        <a href="${siteUrl}/settings?tab=notifications" style="color:#8C8578; text-decoration:underline;">Manage Preferences</a> · <a href="${siteUrl}/settings?tab=notifications" style="color:#8C8578; text-decoration:underline;">Unsubscribe</a>
      </div>
    </div>
  </body>
</html>`

  return { subject, text, html }
}

// ── Main Execution ────────────────────────────────────────────────────────────

async function runCampaign() {
  const args = process.argv.slice(2)

  // Mode detection
  const isTestMode = args.some((a) => a.startsWith('--test-email=') || a.startsWith('--test='))
  const isConfirmSend = args.includes('--confirm-send')
  const isDryRun = !isConfirmSend && !isTestMode

  const testEmailArg = args.find((a) => a.startsWith('--test-email=') || a.startsWith('--test='))
  const testEmail = testEmailArg ? testEmailArg.split('=')[1]?.trim() : null

  // ── Header ───────────────────────────────────────────────────────────────

  console.log('\n=================================================================')
  console.log(`🚀 PRODILY RE-ENGAGEMENT CAMPAIGN (${CAMPAIGN_ID})`)
  console.log('=================================================================\n')

  if (isDryRun) {
    console.log('⚠️  MODE: DRY-RUN (No emails will be sent)\n')
  } else if (isTestMode) {
    console.log(`🧪 MODE: TEST-SEND (Sending sample email to: ${testEmail})\n`)
  } else if (isConfirmSend) {
    console.log('🔥 MODE: PRODUCTION SEND (--confirm-send specified)\n')
  }

  // ── Supabase client ──────────────────────────────────────────────────────

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

  // For test/dry-run modes allow anon key as fallback
  const supabaseKey = serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseKey) {
    console.error('❌ Error: No Supabase key found. Set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, '')
  const ctaUrl = `${siteUrl}/academy`

  // ── Test Mode ────────────────────────────────────────────────────────────

  if (isTestMode && testEmail) {
    let testFirstName = deriveFirstName(null, null, testEmail)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: testUser } = await (supabase.from('users' as any) as any)
        .select('name, username, email')
        .eq('email', testEmail)
        .maybeSingle()
      if (testUser) {
        testFirstName = deriveFirstName(testUser.name, testUser.username, testUser.email)
      }
    } catch {
      // ignore lookup error, fallback to derived name from test email
    }

    console.log(`Sending re-engagement sample email to ${testEmail} (greeting: "Hey ${testFirstName},")...`)
    const content = buildEmailContent(testFirstName, ctaUrl, siteUrl)
    const res = await sendEmail({ to: testEmail, subject: `[TEST] ${content.subject}`, html: content.html, text: content.text })
    console.log(`Result: ${res.success ? '✅ SUCCESS' : `❌ FAILED (${res.error})`}`)

    console.log('\n✨ Test send completed!\n')
    return
  }

  // ── Initial Evaluation ───────────────────────────────────────────────────

  // 1. Fetch all registered users
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRows, error: userErr } = await (supabase.from('users' as any) as any)
    .select('id, email, name, username, total_xp')

  if (userErr) {
    console.error('❌ Failed to fetch users from Supabase:', userErr)
    process.exit(1)
  }

  const totalRegisteredUsers: number = userRows ? userRows.length : 0

  // 2. Fetch notification preferences for opt-out (bulk snapshot for evaluation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prefRows } = await (supabase.from('user_notification_preferences' as any) as any)
    .select('user_id, all_notifications, all_email, marketing_email')

  const optOutSet = new Set<string>()
  if (prefRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of prefRows as any[]) {
      if (p.all_notifications === false || p.all_email === false || p.marketing_email === false) {
        optOutSet.add(String(p.user_id))
      }
    }
  }

  // 3. Fetch auth metadata opt-outs
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
    // Non-fatal if admin listUsers is restricted
  }

  // 4. Load existing log for idempotency
  const sentLog = loadLogRecords()

  // ── Build Candidate List ─────────────────────────────────────────────────

  let countInvalidEmail = 0
  let countOptedOut = 0
  let countAlreadySent = 0
  let countExplicitlyExcluded = 0

  const candidates: Candidate[] = []

  if (userRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of userRows as any[]) {
      const userId = String(u.id)
      const email = String(u.email || '').trim().toLowerCase()

      if (!email || !email.includes('@')) {
        countInvalidEmail++
        continue
      }

      if (EXCLUDED_EMAILS.has(email)) {
        countExplicitlyExcluded++
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

      candidates.push({
        userId,
        email,
        firstName: deriveFirstName(u.name, u.username, u.email),
        totalXp: u.total_xp || 0,
      })
    }
  }

  // ── Evaluation Summary ───────────────────────────────────────────────────

  const emailSubjectPreview = buildEmailContent('(recipient)', ctaUrl, siteUrl).subject

  console.log('─────────────────────────────────────────────────────────────────')
  console.log('📊 AUDIENCE EVALUATION SUMMARY:')
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`  Total registered users evaluated             : ${totalRegisteredUsers}`)
  console.log(`  Invalid / missing emails                     : ${countInvalidEmail}`)
  console.log(`  Explicitly excluded (internal/admin)         : ${countExplicitlyExcluded}`)
  console.log(`  Opted-out / unsubscribed                     : ${countOptedOut}`)
  console.log(`  Already sent this campaign (idempotent skip) : ${countAlreadySent}`)
  console.log(`  ─────────────────────────────────────────────`)
  console.log(`  🎯 PENDING CANDIDATES (will receive campaign): ${candidates.length}`)
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`  Email Subject                                : "${emailSubjectPreview}"`)
  console.log(`  CTA Destination                              : ${ctaUrl}`)
  console.log('─────────────────────────────────────────────────────────────────')
  console.log('  ℹ️  Note: Opt-out status is re-verified from Supabase')
  console.log('     immediately before each production send.')
  console.log('─────────────────────────────────────────────────────────────────\n')

  // Sample recipients
  const sampleSize = Math.min(5, candidates.length)
  console.log(`📋 SAMPLE CANDIDATES (first ${sampleSize}):`)
  if (candidates.length === 0) {
    console.log('   (None found — all eligible users have already been sent)\n')
  } else {
    candidates.slice(0, sampleSize).forEach((c, i) => {
      const xpLabel = c.totalXp > 0 ? `XP: ${c.totalXp}` : 'XP: 0'
      console.log(`  ${i + 1}. ${c.firstName} <${c.email}>  [${xpLabel}]  (ID: ${c.userId})`)
    })
    console.log()
  }

  if (isDryRun) {
    console.log('─────────────────────────────────────────────────────────────────')
    console.log('💡 Dry-run complete. No emails were sent.')
    console.log()
    console.log('   To test the email template:')
    console.log(`     npx tsx scripts/local-campaigns/reengagement_pm_journey_aug_2026/send-reengagement-pm-journey.ts --test-email=your@email.com`)
    console.log()
    console.log('   To execute a production send:')
    console.log(`     npx tsx scripts/local-campaigns/reengagement_pm_journey_aug_2026/send-reengagement-pm-journey.ts --confirm-send`)
    console.log('─────────────────────────────────────────────────────────────────\n')
    return
  }

  // ── Production Confirmation ──────────────────────────────────────────────

  if (candidates.length === 0) {
    console.log('✅ Nothing to send. All eligible candidates have already received this campaign.')
    return
  }

  console.log('⚠️  PRODUCTION SEND CONFIRMATION')
  console.log(`   You are about to send real emails to ${candidates.length} users.`)
  console.log('   This cannot be undone.')

  const answer = await prompt(`\n   Type "YES" to confirm and begin sending: `)
  if (answer !== 'YES') {
    console.log('\n❌ Send aborted by user. No emails were sent.\n')
    return
  }

  console.log('\n🚀 Starting production campaign send...\n')

  // ── Production Send Loop ─────────────────────────────────────────────────

  let sentCount = 0
  let skippedOptOutCount = 0
  let failedCount = 0

  ensureLogDirExists()

  for (let i = 0; i < candidates.length; i += SEND_BATCH_SIZE) {
    const batch = candidates.slice(i, i + SEND_BATCH_SIZE)
    const batchNum = Math.floor(i / SEND_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(candidates.length / SEND_BATCH_SIZE)

    console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} recipients):`)

    for (const candidate of batch) {
      // 1. Double check idempotency against log file
      const currentLog = loadLogRecords()
      if (currentLog.has(candidate.userId) && currentLog.get(candidate.userId)?.status === 'success') {
        console.log(`   ⏩ [SKIP] ${candidate.email} - Already sent (logged)`)
        continue
      }

      // 2. Re-verify opt-out in real-time from Supabase
      const optedOutNow = await isFreshOptOut(supabase, candidate.userId)
      if (optedOutNow) {
        console.log(`   🚫 [OPT-OUT] ${candidate.email} - Opted out in fresh check`)
        skippedOptOutCount++
        continue
      }

      // 3. Build personalized content
      const content = buildEmailContent(candidate.firstName, ctaUrl, siteUrl)

      // 4. Send email
      try {
        const result = await sendEmail({
          to: candidate.email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        })

        if (result.success) {
          saveLogRecord({
            userId: candidate.userId,
            email: candidate.email,
            status: 'success',
            sentAt: new Date().toISOString(),
          })
          console.log(`   ✅ [SENT] ${candidate.firstName} <${candidate.email}> (ID: ${candidate.userId})`)
          sentCount++
        } else {
          saveLogRecord({
            userId: candidate.userId,
            email: candidate.email,
            status: 'failed',
            sentAt: new Date().toISOString(),
            error: result.error || 'Unknown send error',
          })
          console.error(`   ❌ [FAIL] ${candidate.email} - ${result.error}`)
          failedCount++
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        saveLogRecord({
          userId: candidate.userId,
          email: candidate.email,
          status: 'failed',
          sentAt: new Date().toISOString(),
          error: errorMsg,
        })
        console.error(`   ❌ [EXCEPT] ${candidate.email} - ${errorMsg}`)
        failedCount++
      }
    }

    // Delay between sub-batches
    if (i + SEND_BATCH_SIZE < candidates.length) {
      console.log(`   ⏳ Pausing ${DELAY_BETWEEN_BATCHES_MS / 1000}s before next batch...`)
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  // ── Final Summary ────────────────────────────────────────────────────────

  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log('🎉 CAMPAIGN SEND COMPLETE')
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`  Successfully sent : ${sentCount}`)
  console.log(`  Skipped (opt-outs): ${skippedOptOutCount}`)
  console.log(`  Failed sends      : ${failedCount}`)
  console.log(`  Audit log saved to: ${LOG_FILE}`)
  console.log('─────────────────────────────────────────────────────────────────\n')
}

// Auto-run if invoked directly
if (require.main === module) {
  runCampaign().catch((err) => {
    console.error('Fatal campaign execution error:', err)
    process.exit(1)
  })
}
