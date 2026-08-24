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
// __dirname = apps/web/scripts/local-campaigns/reengagement_did_you_become_pm_aug_2026 → ../../../ = apps/web/
loadEnvFile(path.resolve(__dirname, '../../../.env.local'))
loadEnvFile(path.resolve(__dirname, '../../../.env'))

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { BRAND } from '@/lib/brand'

// ── Campaign Configuration ───────────────────────────────────────────────────

const CAMPAIGN_ID = 'reengagement_did_you_become_pm_aug_2026'
const LOG_DIR = path.resolve(__dirname, 'logs')
const LOG_FILE = path.resolve(LOG_DIR, `campaign_sent_${CAMPAIGN_ID}.json`)

/** Explicitly excluded internal/admin email addresses for production sends. */
const EXCLUDED_EMAILS = new Set<string>([
  'adityagangwaniexam@gmail.com',
  'pmacademyapp@gmail.com',
  'ryangomez9965@gmail.com',
])

/** Number of recipients processed per sub-batch before a delay pause. */
const SEND_BATCH_SIZE = 5
/** Delay in ms between sub-batches to avoid overwhelming Resend API. */
const DELAY_BETWEEN_BATCHES_MS = 1000

// ── Types ────────────────────────────────────────────────────────────────────

interface CampaignLogRecord {
  userId: string
  email: string
  status: 'success' | 'failed'
  sentAt: string
  error?: string
}

interface Candidate {
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

function loadLogRecords(): Map<string, CampaignLogRecord> {
  ensureLogDirExists()
  if (!fs.existsSync(LOG_FILE)) return new Map()
  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf-8')
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

function saveLogRecord(record: CampaignLogRecord) {
  ensureLogDirExists()
  const map = loadLogRecords()
  map.set(record.userId, record)
  fs.writeFileSync(LOG_FILE, JSON.stringify(Array.from(map.values()), null, 2), 'utf-8')
}

// ── Utility Helpers ──────────────────────────────────────────────────────────

function deriveFirstName(
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
    return false // On error, default to allowing (safe)
  }
}

// ── Email Template Builder ───────────────────────────────────────────────────

function buildEmailContent(firstName: string, ctaUrl: string, siteUrl: string) {
  const subject = 'You signed up. But did you actually become a PM?'
  const previewText = 'Did you actually start becoming a better Product Manager? Start your first lesson today.'
  const greeting = `Hi ${firstName},`

  const text = `${greeting}

You signed up for Prodily.

But here's the uncomfortable question:

Did you actually start becoming a better Product Manager?

If the answer is no — that's okay.

Most people don't need another 50-hour course sitting on their to-do list.

They just need to start.

Prodily is built to help you learn Product Management one practical lesson at a time, without overwhelming you.

No deadlines.
No 3-hour lectures.
No complicated learning path.

Just open Prodily, pick a lesson, and start.

Your first step can take just a few minutes.

→ Start Learning: ${ctaUrl}

Maybe this time, don't just sign up.

Actually start.

— Team Prodily

${BRAND.fullName} · ${BRAND.positioning}
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

      <!-- Header -->
      <tr>
        <td style="padding-bottom:24px; text-align:left;">
          <table role="presentation" border="0" cellPadding="0" cellSpacing="0">
            <tr>
              <td style="vertical-align:middle; padding-right:12px;">
                <img src="${siteUrl}${BRAND.assets.logoMarkPng}" alt="${BRAND.company}" height="36" style="display:block; border:none; border-radius:6px; width:auto;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:18px; font-weight:bold; color:#1F6B4E; letter-spacing:-0.02em; display:block; line-height:1.2;">${BRAND.company}</span>
                <span style="font-size:11px; font-weight:600; color:#70685A; text-transform:uppercase; letter-spacing:0.05em; display:block;">${BRAND.product}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body Card -->
      <tr>
        <td style="background-color:#FFFFFF; border-radius:16px; padding:36px 32px; border:1px solid #DED8CB; box-shadow:0 2px 8px rgba(31, 107, 78, 0.04);">
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">${greeting}</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You signed up for Prodily.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">But here's the uncomfortable question:</p>
          <p style="margin:0 0 16px 0; font-size:16px; font-weight:700; color:#171A17; line-height:1.5;">Did you actually start becoming a better Product Manager?</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">If the answer is no — that's okay.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Most people don't need another 50-hour course sitting on their to-do list.</p>
          <p style="margin:0 0 20px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">They just need to start.</p>
          <p style="margin:0 0 20px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Prodily is built to help you learn Product Management <strong>one practical lesson at a time</strong>, without overwhelming you.</p>

          <p style="margin:0 0 20px 0; font-size:14px; color:#50574F; line-height:1.8; background-color:#F5F3ED; padding:12px 16px; border-radius:8px;">
            No deadlines.<br />
            No 3-hour lectures.<br />
            No complicated learning path.
          </p>

          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Just open Prodily, pick a lesson, and start.</p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;"><strong>Your first step can take just a few minutes.</strong></p>

          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">→ Start Learning</a>
          </div>

          <p style="margin:0 0 8px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Maybe this time, don't just sign up.</p>
          <p style="margin:0 0 20px 0; font-size:15px; font-weight:700; color:#171A17; line-height:1.6;">Actually start.</p>
          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding-top:28px; text-align:center; font-size:12px; color:#70685A; line-height:1.5;">
          <p style="margin:0 0 8px 0; font-weight:600; color:#171A17;">${BRAND.fullName} · ${BRAND.positioning}</p>
          <p style="margin:0 0 8px 0;">
            <a href="${siteUrl}/settings?tab=notifications" style="color:#1F6B4E; text-decoration:none; font-weight:600; margin-right:10px;">Manage Preferences</a>
            ·
            <a href="${siteUrl}/settings?tab=notifications" style="color:#70685A; text-decoration:underline; margin-left:10px;">Unsubscribe</a>
          </p>
          <p style="margin:12px 0 0 0; color:#9EA59D; font-size:11px;">© ${new Date().getFullYear()} ${BRAND.fullName}. All rights reserved.</p>
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

  // Mode detection
  const isTestMode = args.some((a) => a.startsWith('--test-email=') || a.startsWith('--test='))
  const isConfirmSend = args.includes('--confirm-send')
  const isDryRun = !isConfirmSend && !isTestMode

  const testEmailArg = args.find((a) => a.startsWith('--test-email=') || a.startsWith('--test='))
  const testEmail = testEmailArg ? testEmailArg.split('=')[1]?.trim() : null

  // ── Header ───────────────────────────────────────────────────────────────

  console.log('\n=================================================================')
  console.log(`🚀 PRODILY CAMPAIGN 3: PROVOCATIVE RE-ENGAGEMENT (${CAMPAIGN_ID})`)
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

    console.log(`Sending Campaign 3 sample email to ${testEmail} (greeting: "Hi ${testFirstName},")...`)
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
    console.log(`     npx tsx scripts/local-campaigns/reengagement_did_you_become_pm_aug_2026/send-reengagement-did-you-become-pm.ts --test-email=your@email.com`)
    console.log()
    console.log('   To execute a production send:')
    console.log(`     npx tsx scripts/local-campaigns/reengagement_did_you_become_pm_aug_2026/send-reengagement-did-you-become-pm.ts --confirm-send`)
    console.log('─────────────────────────────────────────────────────────────────\n')
    return
  }

  // ── Production Confirmation Gate ─────────────────────────────────────────

  if (isConfirmSend) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('⚠️  PRODUCTION SEND CONFIRMATION REQUIRED')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`   Campaign  : ${CAMPAIGN_ID}`)
    console.log(`   Recipients: ${candidates.length} users`)
    console.log(`   Subject   : "${emailSubjectPreview}"`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log()

    const answer = await prompt('Type "yes" to confirm and start sending, or anything else to abort: ')
    if (answer.toLowerCase() !== 'yes') {
      console.log('\n🛑 Aborted by user. No emails were sent.\n')
      process.exit(0)
    }

    console.log()
  }

  // ── Production Dispatch ───────────────────────────────────────────────────

  if (candidates.length === 0) {
    console.log('✅ No pending candidates for this campaign.\n')
    return
  }

  console.log(`🚀 Starting production send to ${candidates.length} candidates...`)
  console.log('   (Opt-out status will be re-verified from Supabase before each send)\n')

  let successCount = 0
  let failCount = 0
  let skippedFreshOptOut = 0
  let skippedFreshIdempotent = 0
  let skippedFreshExcluded = 0

  for (let i = 0; i < candidates.length; i += SEND_BATCH_SIZE) {
    const chunk = candidates.slice(i, i + SEND_BATCH_SIZE)
    console.log(`Processing sub-batch ${Math.floor(i / SEND_BATCH_SIZE) + 1} (${chunk.length} candidates)...`)

    for (const candidate of chunk) {
      try {
        // Step 0: Check explicit exclusion list
        if (EXCLUDED_EMAILS.has(candidate.email)) {
          console.log(`  🚫 Explicitly excluded — skipping ${candidate.email}`)
          skippedFreshExcluded++
          continue
        }

        // Step 1: Re-check idempotency log
        const freshLog = loadLogRecords()
        if (freshLog.has(candidate.userId) && freshLog.get(candidate.userId)?.status === 'success') {
          console.log(`  ⏭️  Already sent — skipping ${candidate.email}`)
          skippedFreshIdempotent++
          continue
        }

        // Step 2: Fresh opt-out check
        const optedOut = await isFreshOptOut(supabase, candidate.userId)
        if (optedOut) {
          console.log(`  🚫 Opted out (fresh check) — skipping ${candidate.email}`)
          skippedFreshOptOut++
          continue
        }

        // Step 3: Build email
        const mailContent = buildEmailContent(candidate.firstName, ctaUrl, siteUrl)

        // Step 4: Send email
        const res = await sendEmail({
          to: candidate.email,
          subject: mailContent.subject,
          html: mailContent.html,
          text: mailContent.text,
        })

        // Step 5: Write idempotency log only on success
        if (res.success) {
          successCount++
          console.log(`  ✅ Sent to ${candidate.email}`)
          saveLogRecord({
            userId: candidate.userId,
            email: candidate.email,
            status: 'success',
            sentAt: new Date().toISOString(),
          })
        } else {
          failCount++
          console.error(`  ❌ Failed for ${candidate.email}: ${res.error}`)
          saveLogRecord({
            userId: candidate.userId,
            email: candidate.email,
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
          status: 'failed',
          sentAt: new Date().toISOString(),
          error: errStr,
        })
      }
    }

    // Rate limiting: pause between sub-batches
    if (i + SEND_BATCH_SIZE < candidates.length) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  // ── Final Summary ─────────────────────────────────────────────────────────

  console.log('\n=================================================================')
  console.log(`🎉 CAMPAIGN DISPATCH COMPLETE (${CAMPAIGN_ID})`)
  console.log('=================================================================')
  console.log(`  Initial candidates evaluated     : ${candidates.length}`)
  console.log(`  Skipped — fresh opt-out          : ${skippedFreshOptOut}`)
  console.log(`  Skipped — already sent           : ${skippedFreshIdempotent}`)
  console.log(`-----------------------------------------------------------------`)
  console.log(`  ✅ Successful sends              : ${successCount}`)
  console.log(`  ❌ Failed sends                  : ${failCount}`)
  console.log(`  📁 Log saved to                  : ${LOG_FILE}`)
  console.log('=================================================================\n')
}

runCampaign().catch((err) => {
  console.error('Fatal campaign script error:', err)
  process.exit(1)
})
