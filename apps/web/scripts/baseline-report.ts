/**
 * Prodily — Phase 0.B Baseline Report
 *
 * Produces the one-page baseline that `docs/IMPLEMENTATION_PLAN.md` §Phase 0.B makes a
 * precondition for every behavioural phase that follows. Read-only: this script issues
 * SELECTs and writes a Markdown file. It never inserts, updates or deletes.
 *
 * ## Why a script rather than an admin page
 *
 * The baseline is a point-in-time artifact that has to be committed and cited, not a
 * live dashboard — the live funnel is Phase 2's job. Running it as a script also keeps
 * Phase 0.B's promise that nothing user-facing changes.
 *
 * ## Why not GA4
 *
 * `ConsentGatedAnalytics` injects GA4 only after the visitor accepts optional cookies,
 * and `trackEvent` returns early without `window.gtag`, so GA4 describes consenting
 * visitors only. Every number here comes from rows the server already writes.
 *
 * Usage:
 *   npm run baseline:report              # writes docs/reports/baseline-<date>.md
 *   npm run baseline:report -- --stdout  # prints instead of writing
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from
 * apps/web/.env.local when present, as the other scripts in this directory do).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

import {
  computeActivationFunnel,
  computeTheoryGateStalls,
  computeTimeToFirstCompletion,
  computeReviewUsage,
  computeReturnCohorts,
  computeQuizDistribution,
  computeCapstoneReality,
  computeConsentCapture,
  computeEmailReality,
  BASELINE_UNMEASURABLE,
  type BaselineUserRow,
  type BaselineProgressRow,
  type BaselineXpEventRow,
  type BaselineQuizAttemptRow,
  type BaselineCapstoneRow,
  type BaselineEmailQueueRow,
  type BaselineNotificationEventRow,
} from '../lib/admin/baseline-aggregation'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Lesson 1. Stable id from `content/dist/curriculum.json`; the Phase 4 (E2) guardrail baseline. */
const LESSON_ONE_ID = 'les_zoyq8a'

// ── Environment loading ──────────────────────────────────────────────────────
// Same shape as scripts/send-jolly-recovery-email.ts: real environment wins, the
// .env.local file only fills gaps.

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvFile(path.resolve(__dirname, '../.env.local'))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '[baseline-report] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Set them in the environment or apps/web/.env.local and re-run.'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Walks PostgREST's 1000-row page limit.
 *
 * Mirrors `lib/db/pagination.ts:fetchAllRows`, re-implemented here rather than imported
 * because that module is compiled for the Next.js app and this script runs under tsx
 * outside that build. The contract is identical: stop on a short page, throw on error —
 * an unbounded `.select()` is silently truncated at 1000 rows, and a truncated baseline
 * is indistinguishable from a complete one.
 */
async function fetchAll<T>(
  table: string,
  columns: string
): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  let start = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(start, start + pageSize - 1)
    if (error) throw new Error(`[${table}] ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as T[]))
    if (data.length < pageSize) break
    start += pageSize
  }
  return rows
}

/**
 * Verification state, read from the Supabase auth schema.
 *
 * `email_confirmed_at` is not a column on `public.users`, so it cannot be joined with
 * the rest. Returns null on failure rather than throwing: a missing verification number
 * should degrade one line of the report, not lose the whole baseline.
 */
async function fetchVerificationState(): Promise<{ total: number; confirmed: number } | null> {
  try {
    let page = 1
    let total = 0
    let confirmed = 0
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !data) return null
      if (data.users.length === 0) break
      for (const u of data.users) {
        total++
        if (u.email_confirmed_at) confirmed++
      }
      if (data.users.length < 1000) break
      page++
    }
    return { total, confirmed }
  } catch {
    return null
  }
}

// ── Formatting helpers ───────────────────────────────────────────────────────

const n = (v: number) => v.toLocaleString('en-US')
const orUnknown = (v: number | null, suffix = '') =>
  v === null ? '_no data_' : `${v}${suffix}`

function section(title: string): string {
  return `\n## ${title}\n`
}

async function main() {
  const toStdout = process.argv.includes('--stdout')
  const generatedAt = new Date()

  console.error('[baseline-report] Fetching rows…')

  const [
    users,
    progress,
    xpEvents,
    quizAttempts,
    capstones,
    emailQueue,
    notificationEvents,
    verification,
  ] = await Promise.all([
    fetchAll<BaselineUserRow>('users', 'id, created_at, onboarding_completed, terms_accepted_at, auth_provider'),
    fetchAll<BaselineProgressRow>(
      'user_lesson_progress',
      'user_id, lesson_id, status, theory_read_at, completed_at, quiz_attempts'
    ),
    fetchAll<BaselineXpEventRow>('xp_events', 'user_id, source_type, created_at'),
    fetchAll<BaselineQuizAttemptRow>('quiz_attempts', 'user_id, lesson_id, question_id, is_correct'),
    fetchAll<BaselineCapstoneRow>('capstone_submissions', 'user_id, module_slug, status'),
    fetchAll<BaselineEmailQueueRow>('email_queue', 'template_key, status, skipped_reason'),
    fetchAll<BaselineNotificationEventRow>('notification_events', 'event_type, skipped_reason'),
    fetchVerificationState(),
  ])

  console.error(
    `[baseline-report] users=${users.length} progress=${progress.length} xp=${xpEvents.length} ` +
      `quiz=${quizAttempts.length} capstones=${capstones.length} queue=${emailQueue.length}`
  )

  const funnel = computeActivationFunnel(users, progress)
  const stalls = computeTheoryGateStalls(progress)
  const timing = computeTimeToFirstCompletion(users, progress)
  const review = computeReviewUsage(xpEvents, generatedAt)
  const returns = computeReturnCohorts(users, xpEvents, generatedAt)
  const quiz = computeQuizDistribution(quizAttempts, LESSON_ONE_ID)
  const capstone = computeCapstoneReality(capstones)
  const consent = computeConsentCapture(users)
  const email = computeEmailReality(emailQueue, notificationEvents)

  const lines: string[] = []

  lines.push('# Prodily — Phase 0.B Baseline Report')
  lines.push('')
  lines.push(`**Generated:** ${generatedAt.toISOString()}`)
  lines.push('**Source:** production database, server-side rows only. No GA4.')
  lines.push('**Method:** `npm run baseline:report` → `lib/admin/baseline-aggregation.ts`')
  lines.push('')
  lines.push(
    '> Every number below is measured. Where the schema cannot answer a question it is ' +
      'listed under "Not measurable" rather than estimated.'
  )

  // ── Activation ──
  lines.push(section('1. Activation funnel (0.B.3)'))
  lines.push('| Step | Learners | % of registered |')
  lines.push('|---|---:|---:|')
  lines.push(`| Registered | ${n(funnel.registered)} | 100% |`)
  if (verification) {
    const vpct = verification.total > 0 ? Math.round((verification.confirmed / verification.total) * 1000) / 10 : 0
    lines.push(`| Email verified | ${n(verification.confirmed)} | ${vpct}% |`)
  } else {
    lines.push('| Email verified | _auth admin API unavailable_ | — |')
  }
  lines.push(`| Onboarding completed | ${n(funnel.onboardingCompleted)} | ${funnel.pctOnboardingCompleted}% |`)
  lines.push(`| Opened ≥1 lesson | ${n(funnel.everOpenedLesson)} | ${funnel.pctEverOpened}% |`)
  lines.push(`| Recorded theory read | ${n(funnel.everReadTheory)} | ${Math.round((funnel.everReadTheory / Math.max(1, funnel.registered)) * 1000) / 10}% |`)
  lines.push(`| **Completed ≥1 lesson** | **${n(funnel.everCompletedLesson)}** | **${funnel.pctEverCompleted}%** |`)
  lines.push('')
  lines.push('### The decision split')
  lines.push('')
  lines.push(`- **Never opened a lesson: ${n(funnel.neverOpenedLesson)}** — entrance problem.`)
  lines.push(`- **Opened but never completed: ${n(funnel.openedButNeverCompleted)}** — lesson-length problem.`)
  lines.push('')
  lines.push(
    funnel.neverOpenedLesson > funnel.openedButNeverCompleted
      ? '> **Majority never opened a lesson.** Per IMPLEMENTATION_PLAN.md §Phase 0.B.3, ' +
          'Phase 5 (reduce the entrance) should move ahead of Phase 4 (re-cut the lesson).'
      : '> **Majority opened but did not finish.** Phase 4 (re-cut the lesson) is confirmed ' +
          'as the higher priority; the phase order in the plan stands.'
  )

  // ── Theory gate ──
  lines.push(section('2. Theory-gate stalls (0.B.4)'))
  lines.push(`- Progress rows opened with no theory read and no quiz attempt: **${n(stalls.stalledRows)}**`)
  lines.push(`- Distinct learners affected: **${n(stalls.stalledUsers)}** (${stalls.pctOfOpeners}% of learners who opened anything)`)
  lines.push('')
  lines.push(
    '_Ceiling, not a diagnosis: a row lands here whether the learner failed the ≥45 s / ' +
      '≥80 % scroll gate or simply closed the tab. Phase 3.4 makes the two distinguishable._'
  )

  // ── Timing ──
  lines.push(section('3. Signup → first completion (0.B.5)'))
  lines.push(`- Learners with a first completion: **${n(timing.sampleSize)}**`)
  lines.push(`- Median: **${orUnknown(timing.medianHours, ' h')}** · p25 ${orUnknown(timing.p25Hours, ' h')} · p75 ${orUnknown(timing.p75Hours, ' h')}`)
  lines.push(`- Completed on signup day: **${n(timing.sameDayCount)}**`)
  lines.push(`- Completed within 7 days: **${n(timing.withinSevenDaysCount)}**`)
  lines.push('')
  lines.push(
    '_This is signup → **completion**. Signup → first **open** is not derivable: ' +
      '`user_lesson_progress` has no creation timestamp._'
  )

  // ── Return ──
  lines.push(section('4. Return behaviour'))
  lines.push(`- Cohort (accounts ≥7 days old): **${n(returns.cohortSize)}**`)
  lines.push(`- Returned D1: **${n(returns.returnedDay1)}** (${returns.pctReturnedDay1}%)`)
  lines.push(`- Returned D7: **${n(returns.returnedDay7)}** (${returns.pctReturnedDay7}%)`)
  lines.push(`- Median distinct active days per learner: **${orUnknown(returns.medianActiveDays)}**`)
  lines.push('')
  lines.push(
    '_A **floor**, not an exact rate: XP events are the only durable activity record, so ' +
      'a learner who returned and read without earning XP is invisible here._'
  )

  // ── Review loop ──
  lines.push(section('5. Review / flashcard loop (0.B.6)'))
  lines.push(`- Learners who have ever reviewed a card: **${n(review.usersEverReviewed)}** (${review.pctOfActiveLearners}% of learners with any XP)`)
  lines.push(`- Last 30 days: **${n(review.usersReviewedLast30Days)}** · last 7 days: **${n(review.usersReviewedLast7Days)}**`)
  lines.push(`- Total review events: **${n(review.totalReviewEvents)}**`)
  lines.push('')
  lines.push(
    review.usersEverReviewed === 0
      ? '> **Nobody has used the review loop.** The ~3-minute daily habit exists in code ' +
          '(`srs.ts` returns unreviewed cards as due immediately, and a review updates the ' +
          'streak) but has never been exercised. Phase 3.5 — promote it — is supported.'
      : '> The review loop is in use. Before promoting it in Phase 3.5, check whether these ' +
          'learners retain better than non-reviewers; if they do not, the loop is not the ' +
          'retention mechanism the plan assumes.'
  )

  // ── Quiz ──
  lines.push(section('6. Lesson 1 quiz distribution (0.B.7) — Phase 4 guardrail baseline'))
  lines.push(`- Lesson: \`${quiz.lessonId}\` ("What is Product Management?")`)
  lines.push(`- Learners with attempts: **${n(quiz.learnersWithAttempts)}** across ${n(quiz.totalAttemptRows)} attempt rows`)
  lines.push(`- Median per-learner accuracy: **${orUnknown(quiz.medianScorePct, '%')}**`)
  lines.push('')
  lines.push('| Accuracy band | Learners |')
  lines.push('|---|---:|')
  for (const b of quiz.buckets) lines.push(`| ${b.label} | ${n(b.learners)} |`)
  lines.push('')
  lines.push(
    '_Phase 4 (E2) guardrail: if the Core/Deep-dive split raises activation but median ' +
      'accuracy falls materially against this number, Core is too thin._'
  )

  // ── Capstones ──
  lines.push(section('7. Capstone reality (0.B.8)'))
  lines.push(`- Submission rows: **${n(capstone.totalRows)}** across **${n(capstone.distinctLearners)}** learners`)
  lines.push(`- Submitted or reviewed: **${n(capstone.submittedOrReviewed)}**`)
  lines.push(`- Awaiting manual review: **${n(capstone.awaitingReview)}**`)
  if (Object.keys(capstone.byStatus).length > 0) {
    lines.push('')
    lines.push('| Status | Rows |')
    lines.push('|---|---:|')
    for (const [status, count] of Object.entries(capstone.byStatus).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${status} | ${n(count)} |`)
    }
  }
  lines.push('')
  lines.push('_`awaitingReview` is the number that decides whether the Phase 7.2 review SLA is a promise the team can currently keep._')

  // ── Email ──
  lines.push(section('8. Email delivery reality (0.B.1 / 0.B.2)'))
  lines.push(`- Lifecycle templates ever sent: **${n(email.lifecycleSent)}**`)
  lines.push(`- Control (auth) templates ever sent: **${n(email.controlSent)}**`)
  lines.push(`- \`user_preference_disabled\` skips recorded: **${n(email.preferenceDisabledSkips)}**`)
  lines.push('')
  lines.push(
    email.confirmsInboxChannelDead
      ? '> **F1 CONFIRMED.** No lifecycle template has ever reached `sent`, and ' +
          'preference-disabled skips are present. Phase 1 proceeds in full (1.1–1.6).'
      : '> **F1 NOT CONFIRMED by these numbers.** Apply IMPLEMENTATION_PLAN.md ' +
          '§"Contingency if 0.B kills F1": re-scope Phase 1 to 1.3, 1.5 and 1.6 only, and ' +
          'do **not** change preference resolution — doing so risks breaking honoured opt-outs.'
  )
  if (email.byTemplate.length > 0) {
    lines.push('')
    lines.push('| Template | Queued | Sent | Failed |')
    lines.push('|---|---:|---:|---:|')
    for (const t of email.byTemplate) {
      lines.push(`| \`${t.templateKey}\` | ${n(t.total)} | ${n(t.sent)} | ${n(t.failed)} |`)
    }
  }
  if (email.skippedReasons.length > 0) {
    lines.push('')
    lines.push('| Skip reason | Count |')
    lines.push('|---|---:|')
    for (const r of email.skippedReasons.slice(0, 15)) {
      lines.push(`| \`${r.reason}\` | ${n(r.count)} |`)
    }
  }

  // ── Consent ──
  lines.push(section('9. Signup consent capture (0.B.9, partial)'))
  lines.push(`- Accounts with a recorded Terms/Privacy consent: **${n(consent.withRecordedTermsConsent)}** (${consent.pctWithRecordedConsent}%)`)
  lines.push(`- Accounts predating consent capture: **${n(consent.predatingConsentCapture)}**`)
  lines.push('')
  lines.push(
    '_A NULL is "created before 2026-09-23", never "refused" — the migration says so ' +
      'explicitly. **This is not the cookie-consent acceptance rate**, which the schema ' +
      'cannot answer; see below._'
  )

  // ── Gaps ──
  lines.push(section('10. Not measurable with the current schema'))
  lines.push('| Question | Why not | What would close it |')
  lines.push('|---|---|---|')
  for (const gap of BASELINE_UNMEASURABLE) {
    lines.push(`| ${gap.question} | ${gap.why} | ${gap.wouldRequire} |`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(
    '_No instrumentation was added to produce this report. Closing the gaps above is ' +
      'Phase 2 work, decided on this evidence rather than added in passing._'
  )

  const output = lines.join('\n') + '\n'

  if (toStdout) {
    console.log(output)
    return
  }

  const reportsDir = path.resolve(__dirname, '../../../docs/reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  const outPath = path.join(reportsDir, `baseline-${generatedAt.toISOString().slice(0, 10)}.md`)
  fs.writeFileSync(outPath, output, 'utf-8')
  console.error(`[baseline-report] Written to ${outPath}`)
}

main().catch((err) => {
  console.error('[baseline-report] Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
