import path from 'path'
import fs from 'fs'
import readline from 'readline'

// ── Environment Loading ──────────────────────────────────────────────────────
// Mirrors the same loader used in send-reengagement-campaign.ts.
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
// __dirname = apps/web/scripts/local-campaigns/marketing_aug_2026 → ../../../ = apps/web/
loadEnvFile(path.resolve(__dirname, '../../../.env.local'))
loadEnvFile(path.resolve(__dirname, '../../../.env'))

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { BRAND } from '@/lib/brand'

// ── Campaign Configuration ───────────────────────────────────────────────────

const CAMPAIGN_ID = 'marketing_aug_2026'
const LOG_DIR = path.resolve(__dirname, 'logs')
const LOG_FILE = path.resolve(LOG_DIR, `campaign_sent_${CAMPAIGN_ID}.json`)

/** Number of recipients processed per sub-batch before a delay pause. */
const SEND_BATCH_SIZE = 5
/** Delay in ms between sub-batches to avoid overwhelming Resend. */
const DELAY_BETWEEN_BATCHES_MS = 1000

// ── Types ────────────────────────────────────────────────────────────────────

type BatchNumber = 1 | 2 | 3

interface CampaignLogRecord {
  userId: string
  email: string
  batch: BatchNumber
  status: 'success' | 'failed'
  sentAt: string
  error?: string
}

/**
 * A candidate is a user selected during initial evaluation.
 * Their batch membership is re-verified from Supabase before each send.
 */
interface Candidate {
  userId: string
  email: string
  firstName: string
  /** Total XP at evaluation time — used only for initial batch assignment estimate. */
  initialXp: number
  /** Batch assigned during initial evaluation — NOT used for production send logic. */
  initialBatch: BatchNumber
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

// ── Supabase Helpers ─────────────────────────────────────────────────────────

/**
 * Fetch fresh total XP for a single user by summing xp_events.xp_amount.
 * Returns null if the query fails (caller should skip the user safely).
 */
async function fetchFreshTotalXp(supabase: SupabaseClient, userId: string): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('xp_events' as any) as any)
      .select('xp_amount')
      .eq('user_id', userId)
    if (error) return null
    if (!data || data.length === 0) return 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).reduce((sum: number, row: any) => sum + (Number(row.xp_amount) || 0), 0)
  } catch {
    return null
  }
}

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

// ── Batch Assignment ─────────────────────────────────────────────────────────

/**
 * Assign a fresh batch number based on total XP and the pre-sorted zero-XP user IDs.
 *
 * @param totalXp       Fresh total XP for the user.
 * @param userId        The user's ID.
 * @param zeroXpIds     Sorted (ascending) list of all zero-XP user IDs (used for deterministic split).
 * @returns 1 | 2 | 3, or 'SKIP' if the XP state changed such that the user no longer belongs to
 *          the selected batch's category.
 */
function assignFreshBatch(
  totalXp: number,
  userId: string,
  zeroXpIds: string[]
): BatchNumber | 'SKIP' {
  if (totalXp > 0) return 1

  // XP = 0 — determine which half
  const idx = zeroXpIds.indexOf(userId)
  if (idx === -1) return 'SKIP' // Not in zero-XP list (state changed — now has XP)
  const midpoint = Math.floor(zeroXpIds.length / 2)
  return idx < midpoint ? 2 : 3
}

// ── Email Templates ──────────────────────────────────────────────────────────
// Inline HTML matching the existing send-reengagement-campaign.ts layout exactly:
// same background (#FBFAF6), header (logo mark + Prodily / PM Academy), white body card
// (16px radius, #DED8CB border, subtle green box-shadow), centered footer with
// Manage Preferences + Unsubscribe links. Fonts and colours are identical.

function buildEmailBatch1(firstName: string, ctaUrl: string, siteUrl: string) {
  const subject = 'Your Prodily journey is already underway 🚀'
  const previewText = 'You have already earned XP on Prodily — keep the momentum going.'
  const greeting = `Hi ${firstName},`

  const text = `${greeting}

You've already started your Product Management journey with Prodily — and you've earned XP along the way. 🚀

Now's a great time to keep that momentum going.

Prodily's PM Academy is designed to help you build practical Product Management skills through structured lessons, quizzes, XP, streaks, badges, and more.

Your progress is already there. Pick up where you left off and keep building.

Continue learning on Prodily: ${ctaUrl}

Keep learning. Keep building. Keep growing.

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
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You've already started your Product Management journey with Prodily — and you've earned XP along the way. 🚀</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Now's a great time to keep that momentum going.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Prodily's PM Academy is designed to help you build practical Product Management skills through structured lessons, quizzes, XP, streaks, badges, and more.</p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Your progress is already there. <strong>Pick up where you left off and keep building.</strong></p>

          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Continue Learning →</a>
          </div>

          <p style="margin:0; font-size:15px; color:#2B2F2B; line-height:1.6;">Keep learning. Keep building. Keep growing.</p>
          <p style="margin:16px 0 0 0; font-size:15px; color:#2B2F2B; line-height:1.6;">— Team Prodily</p>
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

// Batch 2 and Batch 3 receive the same email content.
function buildEmailBatch2or3(firstName: string, ctaUrl: string, siteUrl: string) {
  const subject = 'Ready to start your Product Management journey? 🚀'
  const previewText = 'Your first PM lesson is waiting — and the core course is completely free.'
  const greeting = `Hi ${firstName},`

  const text = `${greeting}

You signed up for Prodily — now it's time to take the first step. 🚀

Prodily's PM Academy gives you a structured way to learn Product Management from the fundamentals, with practical lessons, quizzes, XP, streaks, badges, and more.

And the best part? The core Product Management course is completely free.

You can start learning today and build your PM knowledge one lesson at a time.

Start learning on Prodily: ${ctaUrl}

Your Product Management journey starts with the first lesson.

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
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You signed up for Prodily — now it's time to take the first step. 🚀</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Prodily's PM Academy gives you a structured way to learn Product Management from the fundamentals, with practical lessons, quizzes, XP, streaks, badges, and more.</p>
          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">And the best part? <strong>The core Product Management course is completely free.</strong></p>
          <p style="margin:0 0 24px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">You can start learning today and build your PM knowledge one lesson at a time.</p>

          <!-- CTA Button -->
          <div style="margin:28px 0;">
            <a href="${ctaUrl}" target="_blank" style="display:inline-block; background-color:#1F6B4E; color:#ffffff !important; font-weight:700; font-size:15px; padding:12px 24px; border-radius:8px; text-decoration:none; text-align:center;">Start Learning →</a>
          </div>

          <p style="margin:0 0 16px 0; font-size:15px; color:#2B2F2B; line-height:1.6;">Your Product Management journey starts with the first lesson.</p>
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

  // ── Parse CLI arguments ──────────────────────────────────────────────────

  // Batch selection: --batch=N or BATCH=N env var
  const batchArg = args.find((a) => a.startsWith('--batch='))
  const batchRaw = batchArg
    ? batchArg.split('=')[1]?.trim()
    : (process.env.BATCH ?? '').trim()

  const selectedBatch = Number(batchRaw) as BatchNumber
  if (![1, 2, 3].includes(selectedBatch)) {
    console.error('\n❌ Error: You must specify which batch to send.')
    console.error('   Usage: npx tsx scripts/local-campaigns/marketing_aug_2026/send-marketing-campaign.ts --batch=1')
    console.error('   Valid values: --batch=1, --batch=2, --batch=3\n')
    console.error('   Batch 1 = users with XP > 0')
    console.error('   Batch 2 = users with XP = 0, first half (sorted by user ID)')
    console.error('   Batch 3 = users with XP = 0, second half (sorted by user ID)\n')
    process.exit(1)
  }

  // Mode detection
  const isTestMode = args.some((a) => a.startsWith('--test-email=') || a.startsWith('--test='))
  const isConfirmSend = args.includes('--confirm-send')
  const isDryRun = !isConfirmSend && !isTestMode

  const testEmailArg = args.find((a) => a.startsWith('--test-email=') || a.startsWith('--test='))
  const testEmail = testEmailArg ? testEmailArg.split('=')[1]?.trim() : null

  // ── Header ───────────────────────────────────────────────────────────────

  console.log('\n=================================================================')
  console.log(`🚀 PRODILY MARKETING EMAIL CAMPAIGN (${CAMPAIGN_ID})`)
  console.log(`   Selected Batch: ${selectedBatch}`)
  console.log('=================================================================\n')

  if (isDryRun) {
    console.log('⚠️  MODE: DRY-RUN (No emails will be sent)\n')
  } else if (isTestMode) {
    console.log(`🧪 MODE: TEST-SEND (Sending sample emails to: ${testEmail})\n`)
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

  // For test/dry-run modes allow anon key as fallback (no real user emails in those modes)
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

    if (selectedBatch === 1) {
      console.log(`Sending Batch 1 sample email to ${testEmail} (greeting: "Hi ${testFirstName},")...`)
      const t1 = buildEmailBatch1(testFirstName, ctaUrl, siteUrl)
      const r1 = await sendEmail({ to: testEmail, subject: `[TEST Batch 1] ${t1.subject}`, html: t1.html, text: t1.text })
      console.log(`Result: ${r1.success ? '✅ SUCCESS' : `❌ FAILED (${r1.error})`}`)
    } else {
      console.log(`Sending Batch ${selectedBatch} sample email to ${testEmail} (greeting: "Hi ${testFirstName},")...`)
      const t2 = buildEmailBatch2or3(testFirstName, ctaUrl, siteUrl)
      const r2 = await sendEmail({ to: testEmail, subject: `[TEST Batch ${selectedBatch}] ${t2.subject}`, html: t2.html, text: t2.text })
      console.log(`Result: ${r2.success ? '✅ SUCCESS' : `❌ FAILED (${r2.error})`}`)
    }

    console.log('\n✨ Test send completed!\n')
    return
  }

  // ── Initial Evaluation ───────────────────────────────────────────────────
  //
  // Phase 1: build the full candidate list for the dry-run summary and the
  // initial production candidate pool.
  //
  // IMPORTANT: For production sends, audience/batch is re-verified per user
  // immediately before each send (see "Production Dispatch Flow" below).

  // 1. Fetch all registered users
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRows, error: userErr } = await (supabase.from('users' as any) as any)
    .select('id, email, name, username')

  if (userErr) {
    console.error('❌ Failed to fetch users from Supabase:', userErr)
    process.exit(1)
  }

  const totalRegisteredUsers: number = userRows ? userRows.length : 0

  // 2. Fetch bulk XP totals for all users from xp_events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: xpRows, error: xpErr } = await (supabase.from('xp_events' as any) as any)
    .select('user_id, xp_amount')

  if (xpErr) {
    console.error('⚠️  Warning: Failed to fetch xp_events:', xpErr)
  }

  // Aggregate XP per user
  const xpTotals = new Map<string, number>()
  if (xpRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of xpRows as any[]) {
      const uid = String(row.user_id)
      xpTotals.set(uid, (xpTotals.get(uid) || 0) + (Number(row.xp_amount) || 0))
    }
  }

  // 3. Fetch notification preferences for opt-out (bulk snapshot for evaluation only)
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

  // 4. Fetch auth metadata opt-outs
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

  // Load existing log for idempotency
  const sentLog = loadLogRecords()

  // ── Build deterministic zero-XP user ID list for Batch 2/3 split ────────
  //
  // Collect ALL zero-XP users (regardless of opt-out/invalid email status) and
  // sort by user ID so the midpoint split is stable across repeated runs.
  // This list is shared between Batch 2 and Batch 3 so they always see the
  // same ordered slice.

  const allZeroXpUserIds: string[] = []
  if (userRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of userRows as any[]) {
      const uid = String(u.id)
      const xp = xpTotals.get(uid) || 0
      if (xp === 0) allZeroXpUserIds.push(uid)
    }
    allZeroXpUserIds.sort() // lexicographic sort — stable, deterministic
  }

  const zeroXpMidpoint = Math.floor(allZeroXpUserIds.length / 2)

  // ── Build Candidate List ─────────────────────────────────────────────────

  let countInvalidEmail = 0
  let countOptedOut = 0
  let countAlreadySent = 0
  let countWrongBatch = 0 // Eligible but assigned to a different batch

  // Population counts (all eligible, ignoring which batch they belong to)
  let totalBatch1Eligible = 0
  let totalBatch2Eligible = 0
  let totalBatch3Eligible = 0

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

      if (optOutSet.has(userId) || authOptOutSet.has(userId)) {
        countOptedOut++
        continue
      }

      const xp = xpTotals.get(userId) || 0

      // Determine which batch this user belongs to
      let userBatch: BatchNumber
      if (xp > 0) {
        userBatch = 1
        totalBatch1Eligible++
      } else {
        const idx = allZeroXpUserIds.indexOf(userId)
        if (idx < zeroXpMidpoint) {
          userBatch = 2
          totalBatch2Eligible++
        } else {
          userBatch = 3
          totalBatch3Eligible++
        }
      }

      // Only include candidates for the selected batch
      if (userBatch !== selectedBatch) {
        countWrongBatch++
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
        initialXp: xp,
        initialBatch: userBatch,
      })
    }
  }

  // ── Evaluation Summary ───────────────────────────────────────────────────

  const batchLabel =
    selectedBatch === 1
      ? 'Batch 1 — XP > 0'
      : selectedBatch === 2
        ? 'Batch 2 — XP = 0, first half'
        : 'Batch 3 — XP = 0, second half'

  const emailSubjectPreview =
    selectedBatch === 1
      ? buildEmailBatch1('(recipient)', ctaUrl, siteUrl).subject
      : buildEmailBatch2or3('(recipient)', ctaUrl, siteUrl).subject

  console.log('─────────────────────────────────────────────────────────────────')
  console.log('📊 FULL POPULATION SNAPSHOT (all eligible users, all batches):')
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`  Total registered users                       : ${totalRegisteredUsers}`)
  console.log(`  Invalid / missing emails                     : ${countInvalidEmail}`)
  console.log(`  Opted-out / unsubscribed                     : ${countOptedOut}`)
  console.log(`  ─────────────────────────────────────────────`)
  console.log(`  Batch 1 eligible (XP > 0)                   : ${totalBatch1Eligible}`)
  console.log(`  Batch 2 eligible (XP = 0, first half)       : ${totalBatch2Eligible}`)
  console.log(`  Batch 3 eligible (XP = 0, second half)      : ${totalBatch3Eligible}`)
  console.log(`  Total zero-XP users for split               : ${allZeroXpUserIds.length}  (midpoint: ${zeroXpMidpoint})`)
  console.log('─────────────────────────────────────────────────────────────────\n')

  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`🎯 SELECTED BATCH: ${batchLabel}`)
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`  Email subject                                : "${emailSubjectPreview}"`)
  console.log(`  Already sent (idempotent skip)              : ${countAlreadySent}`)
  console.log(`  PENDING CANDIDATES (will send)               : ${candidates.length}`)
  console.log('─────────────────────────────────────────────────────────────────')
  console.log('  ℹ️  Note: XP and opt-out status are re-verified from Supabase')
  console.log('     immediately before each production send. Counts above are estimates.')
  console.log('─────────────────────────────────────────────────────────────────\n')

  // Sample recipients
  const sampleSize = Math.min(5, candidates.length)
  console.log(`📋 SAMPLE CANDIDATES (first ${sampleSize}):`)
  if (candidates.length === 0) {
    console.log('   (None found for this batch)\n')
  } else {
    candidates.slice(0, sampleSize).forEach((c, i) => {
      const xpLabel = c.initialXp > 0 ? `XP: ${c.initialXp}` : 'XP: 0'
      console.log(`  ${i + 1}. ${c.firstName} <${c.email}>  [${xpLabel}]  (ID: ${c.userId})`)
    })
    console.log()
  }

  if (isDryRun) {
    console.log('─────────────────────────────────────────────────────────────────')
    console.log('💡 Dry-run complete. No emails were sent.')
    console.log()
    console.log('   To test the email template:')
    console.log(`     npx tsx scripts/local-campaigns/marketing_aug_2026/send-marketing-campaign.ts --batch=${selectedBatch} --test-email=your@email.com`)
    console.log()
    console.log('   To execute a production send:')
    console.log(`     npx tsx scripts/local-campaigns/marketing_aug_2026/send-marketing-campaign.ts --batch=${selectedBatch} --confirm-send`)
    console.log('─────────────────────────────────────────────────────────────────\n')
    return
  }

  // ── Production Confirmation Gate ─────────────────────────────────────────
  // Requirement 6: require an explicit "yes" before sending to real users.

  if (isConfirmSend) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('⚠️  PRODUCTION SEND CONFIRMATION REQUIRED')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`   Campaign  : ${CAMPAIGN_ID}`)
    console.log(`   Batch     : ${selectedBatch} (${batchLabel})`)
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
  //
  // For each candidate:
  //   1. Re-check idempotency log
  //   2. Fetch FRESH opt-out status from Supabase
  //   3. Fetch FRESH total XP from Supabase
  //   4. Confirm batch membership from fresh XP
  //   5. Build email template
  //   6. Send the email
  //   7. Write idempotency log only after confirmed success

  if (candidates.length === 0) {
    console.log('✅ No pending candidates for this batch.\n')
    return
  }

  console.log(`🚀 Starting production send: ${candidates.length} candidates in Batch ${selectedBatch}...`)
  console.log('   (XP and opt-out will be re-verified from Supabase before each send)\n')

  let successCount = 0
  let failCount = 0
  let skippedFreshOptOut = 0
  let skippedFreshBatchMismatch = 0  // State changed — user moved to a different batch
  let skippedFreshXpError = 0        // Could not fetch fresh XP
  let skippedFreshIdempotent = 0

  for (let i = 0; i < candidates.length; i += SEND_BATCH_SIZE) {
    const chunk = candidates.slice(i, i + SEND_BATCH_SIZE)
    console.log(`Processing sub-batch ${Math.floor(i / SEND_BATCH_SIZE) + 1} (${chunk.length} candidates)...`)

    for (const candidate of chunk) {
      try {
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

        // Step 3: Fresh total XP
        const freshXp = await fetchFreshTotalXp(supabase, candidate.userId)
        if (freshXp === null) {
          console.error(`  ⚠️  Could not fetch fresh XP for ${candidate.email} — skipping`)
          skippedFreshXpError++
          continue
        }

        // Step 4: Confirm batch from fresh XP
        const freshBatch = assignFreshBatch(freshXp, candidate.userId, allZeroXpUserIds)

        if (freshBatch === 'SKIP' || freshBatch !== selectedBatch) {
          const reason =
            freshBatch === 'SKIP'
              ? 'state changed (no longer in any eligible batch)'
              : `now belongs to Batch ${freshBatch} (fresh XP: ${freshXp})`
          console.log(`  🔄 Batch mismatch — skipping ${candidate.email} (${reason})`)
          skippedFreshBatchMismatch++
          continue
        }

        // Step 5: Build the email
        const mailContent =
          freshBatch === 1
            ? buildEmailBatch1(candidate.firstName, ctaUrl, siteUrl)
            : buildEmailBatch2or3(candidate.firstName, ctaUrl, siteUrl)

        // Step 6: Send the email
        const res = await sendEmail({
          to: candidate.email,
          subject: mailContent.subject,
          html: mailContent.html,
          text: mailContent.text,
        })

        // Step 7: Write idempotency log only on success
        if (res.success) {
          successCount++
          console.log(`  ✅ [Batch ${freshBatch}] Sent to ${candidate.email} (fresh XP: ${freshXp})`)
          saveLogRecord({
            userId: candidate.userId,
            email: candidate.email,
            batch: freshBatch,
            status: 'success',
            sentAt: new Date().toISOString(),
          })
        } else {
          failCount++
          console.error(`  ❌ [Batch ${freshBatch}] Failed for ${candidate.email}: ${res.error}`)
          saveLogRecord({
            userId: candidate.userId,
            email: candidate.email,
            batch: freshBatch,
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
          batch: candidate.initialBatch,
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
  console.log(`  Batch sent                       : ${selectedBatch} (${batchLabel})`)
  console.log(`  Initial candidates               : ${candidates.length}`)
  console.log(`  Skipped — fresh opt-out          : ${skippedFreshOptOut}`)
  console.log(`  Skipped — XP fetch error         : ${skippedFreshXpError}`)
  console.log(`  Skipped — batch mismatch (fresh) : ${skippedFreshBatchMismatch}`)
  console.log(`  Skipped — already sent           : ${skippedFreshIdempotent}`)
  console.log(`-----------------------------------------------------------------`)
  console.log(`  ✅ Successful sends              : ${successCount}`)
  console.log(`  ❌ Failed sends                  : ${failCount}`)
  console.log(`  📁 Log saved to                  : ${LOG_FILE}`)
  console.log('  ℹ️  XP counts above reflect FRESH Supabase data at time of send')
  console.log('=================================================================\n')
}

runCampaign().catch((err) => {
  console.error('Fatal campaign script error:', err)
  process.exit(1)
})
