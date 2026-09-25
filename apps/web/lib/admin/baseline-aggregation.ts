/**
 * Phase 0.B — Baseline measurement aggregation.
 *
 * Pure functions that turn raw row arrays into the baseline numbers defined in
 * `docs/IMPLEMENTATION_PLAN.md` §"Phase 0.B". There is NO database access here, for the
 * same reason `analytics-aggregation.ts` has none: the arithmetic is the part that has
 * to be trustworthy, and it is only trustworthy if it can be unit-tested against
 * fixtures rather than against production.
 *
 * ## Why this exists at all
 *
 * The plan's correction C2: `ConsentGatedAnalytics` loads GA4 and GTM only after the
 * visitor accepts optional cookies, and `lib/analytics.ts:trackEvent` returns early when
 * `window.gtag` is absent. Every GA4 number therefore describes consenting visitors
 * only, by an unknown factor. Phases 1–8 are judged on activation and retention, so the
 * baseline they are judged against cannot come from GA4. It comes from here: rows the
 * application already writes on the server.
 *
 * ## What these functions deliberately do NOT do
 *
 * They never estimate, extrapolate, or fill a gap. Where the existing schema cannot
 * answer a question (see `BASELINE_UNMEASURABLE` below), the answer is the absence, not
 * a proxy dressed up as a measurement. A fabricated baseline is worse than no baseline,
 * because every later phase would be measured against it.
 */

// ─── Row shapes ──────────────────────────────────────────────────────────────
//
// Structural rather than imported from `types/database.ts` so fixtures satisfy them
// without constructing a full generated Row, and so a column added upstream cannot
// silently change what these functions read.

export interface BaselineUserRow {
  id: string
  created_at: string
  onboarding_completed: boolean
  terms_accepted_at: string | null
  auth_provider?: string | null
}

export interface BaselineProgressRow {
  user_id: string
  lesson_id: string
  status: string
  theory_read_at: string | null
  completed_at: string | null
  quiz_attempts: number
}

export interface BaselineXpEventRow {
  user_id: string | null
  source_type: string
  created_at: string
}

export interface BaselineQuizAttemptRow {
  user_id: string | null
  lesson_id: string
  question_id: string
  is_correct: boolean
}

export interface BaselineCapstoneRow {
  user_id: string | null
  module_slug: string
  status: string
}

export interface BaselineEmailQueueRow {
  template_key: string
  status: string
  skipped_reason: string | null
}

export interface BaselineNotificationEventRow {
  event_type: string
  skipped_reason: string | null
}

// ─── Small shared helpers ────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** Rounds to one decimal so a percentage never renders as `19.230769230769234`. */
function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

/**
 * Median of a numeric array, or null for an empty one.
 *
 * Null rather than 0 on purpose: "no data" and "a median of zero" are different
 * statements, and the report prints them differently.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

/** Nearest-rank percentile (p ∈ [0,1]). Same null contract as `median`. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1))
  return sorted[rank]
}

/** `YYYY-MM-DD` in UTC. Used to count distinct active days, never to display a date. */
function utcDayKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toISOString().slice(0, 10)
}

// ─── 0.B.3 — The activation funnel ───────────────────────────────────────────

export interface BaselineActivationFunnel {
  registered: number
  onboardingCompleted: number
  /** A `user_lesson_progress` row exists — i.e. the learner opened at least one lesson. */
  everOpenedLesson: number
  /** At least one lesson with a non-null `theory_read_at`. */
  everReadTheory: number
  everCompletedLesson: number
  /** Registered but no progress row at all. The "entrance problem" segment. */
  neverOpenedLesson: number
  /** Has a progress row but no completion. The "lesson-length problem" segment. */
  openedButNeverCompleted: number
  pctOnboardingCompleted: number
  pctEverOpened: number
  pctEverCompleted: number
}

/**
 * The single most decision-relevant function in this file.
 *
 * `IMPLEMENTATION_PLAN.md` §Phase 0.B.3 makes the phase order depend on this split:
 * if the non-activators are mostly `neverOpenedLesson`, the barrier is the entrance and
 * Phase 5 moves ahead of Phase 4; if they are mostly `openedButNeverCompleted`, the
 * barrier is the lesson itself and Phase 4 is confirmed.
 *
 * "Opened" is the existence of a `user_lesson_progress` row, because that is what the
 * lesson shell writes via `markInProgress()` on first open. The table has no
 * `created_at`, so the row's existence is the only available signal — which is why this
 * counts learners, not timestamps.
 */
export function computeActivationFunnel(
  users: BaselineUserRow[],
  progress: BaselineProgressRow[]
): BaselineActivationFunnel {
  const opened = new Set<string>()
  const readTheory = new Set<string>()
  const completed = new Set<string>()

  for (const row of progress) {
    if (!row.user_id) continue
    opened.add(row.user_id)
    if (row.theory_read_at) readTheory.add(row.user_id)
    if (row.status === 'completed') completed.add(row.user_id)
  }

  const known = new Set(users.map((u) => u.id))
  // Progress rows for users no longer in `users` (deleted accounts) must not inflate
  // the numerators past the denominator.
  const countIn = (s: Set<string>) => [...s].filter((id) => known.has(id)).length

  const registered = users.length
  const everOpenedLesson = countIn(opened)
  const everCompletedLesson = countIn(completed)
  const onboardingCompleted = users.filter((u) => u.onboarding_completed).length

  return {
    registered,
    onboardingCompleted,
    everOpenedLesson,
    everReadTheory: countIn(readTheory),
    everCompletedLesson,
    neverOpenedLesson: registered - everOpenedLesson,
    openedButNeverCompleted: everOpenedLesson - everCompletedLesson,
    pctOnboardingCompleted: pct(onboardingCompleted, registered),
    pctEverOpened: pct(everOpenedLesson, registered),
    pctEverCompleted: pct(everCompletedLesson, registered),
  }
}

// ─── 0.B.4 — Theory-gate stalls ──────────────────────────────────────────────

export interface BaselineTheoryGateStalls {
  /** Rows opened, theory never recorded, quiz never attempted. */
  stalledRows: number
  stalledUsers: number
  /** Of learners who ever opened a lesson, the share with at least one such row. */
  pctOfOpeners: number
}

/**
 * Sizes the silent failure documented in the audit: `verifyTheoryReadEngagement`
 * requires ≥45 s active and ≥80 % scroll, and `handleTheoryComplete` catches the
 * resulting 400 and advances the tab anyway, so the learner is never told the read did
 * not count. A learner in this state has opened a lesson and produced nothing.
 *
 * This is a **ceiling**, not a diagnosis: a row also lands here if the learner simply
 * closed the tab. Phase 3.4 is what makes the two distinguishable.
 */
export function computeTheoryGateStalls(
  progress: BaselineProgressRow[]
): BaselineTheoryGateStalls {
  const stalledUsers = new Set<string>()
  const openers = new Set<string>()
  let stalledRows = 0

  for (const row of progress) {
    if (!row.user_id) continue
    openers.add(row.user_id)
    const stalled =
      row.status !== 'completed' && row.theory_read_at === null && row.quiz_attempts === 0
    if (stalled) {
      stalledRows++
      stalledUsers.add(row.user_id)
    }
  }

  return {
    stalledRows,
    stalledUsers: stalledUsers.size,
    pctOfOpeners: pct(stalledUsers.size, openers.size),
  }
}

// ─── 0.B.5 — Signup → first completion ───────────────────────────────────────

export interface BaselineTimeToFirstCompletion {
  sampleSize: number
  medianHours: number | null
  p25Hours: number | null
  p75Hours: number | null
  /** Completed on the same UTC day as signup. The "activated in one sitting" cohort. */
  sameDayCount: number
  withinSevenDaysCount: number
}

/**
 * Elapsed time from `users.created_at` to that learner's earliest `completed_at`.
 *
 * This measures signup → **completion**, not signup → first *open*: the progress table
 * has no creation timestamp, so the open moment is not recorded anywhere. That gap is
 * listed in `BASELINE_UNMEASURABLE` rather than approximated.
 *
 * Negative intervals (a completion timestamped before the account) are dropped rather
 * than clamped — they indicate clock skew or a migrated row, and averaging them in
 * would quietly bias the median.
 */
export function computeTimeToFirstCompletion(
  users: BaselineUserRow[],
  progress: BaselineProgressRow[]
): BaselineTimeToFirstCompletion {
  const earliest = new Map<string, number>()
  for (const row of progress) {
    if (!row.user_id || row.status !== 'completed' || !row.completed_at) continue
    const t = new Date(row.completed_at).getTime()
    if (!Number.isFinite(t)) continue
    const prev = earliest.get(row.user_id)
    if (prev === undefined || t < prev) earliest.set(row.user_id, t)
  }

  const hours: number[] = []
  let sameDayCount = 0
  let withinSevenDaysCount = 0

  for (const user of users) {
    const completedAt = earliest.get(user.id)
    if (completedAt === undefined) continue
    const createdAt = new Date(user.created_at).getTime()
    if (!Number.isFinite(createdAt)) continue
    const deltaMs = completedAt - createdAt
    if (deltaMs < 0) continue

    hours.push(Math.round((deltaMs / (60 * 60 * 1000)) * 10) / 10)
    if (utcDayKey(user.created_at) === utcDayKey(new Date(completedAt))) sameDayCount++
    if (deltaMs <= 7 * DAY_MS) withinSevenDaysCount++
  }

  return {
    sampleSize: hours.length,
    medianHours: median(hours),
    p25Hours: percentile(hours, 0.25),
    p75Hours: percentile(hours, 0.75),
    sameDayCount,
    withinSevenDaysCount,
  }
}

// ─── 0.B.6 — Review / flashcard usage ────────────────────────────────────────

export interface BaselineReviewUsage {
  usersEverReviewed: number
  usersReviewedLast30Days: number
  usersReviewedLast7Days: number
  totalReviewEvents: number
  /** Of learners with any XP at all, the share who have ever reviewed a card. */
  pctOfActiveLearners: number
}

/**
 * Tests the premise behind Phase 3.5.
 *
 * The audit's correction C2-adjacent finding: `srs.ts:getDueCards` returns any card with
 * no SRS record as due immediately, `flashcards-service.ts` unlocks cards for
 * `in_progress` lessons, and `recordFlashcardReview` updates the streak — so a complete
 * ~3-minute daily loop already exists the moment a learner opens one lesson.
 *
 * If this returns near zero, the loop is hidden (promote it — Phase 3.5). If it returns
 * a healthy number and those learners churn anyway, the loop is not the retention
 * mechanism the plan assumes, and Phase 3.5 should be dropped.
 *
 * `source_type === 'flashcard'` is the marker `recordFlashcardReview` writes.
 */
export function computeReviewUsage(
  xpEvents: BaselineXpEventRow[],
  now: Date = new Date()
): BaselineReviewUsage {
  const ever = new Set<string>()
  const last30 = new Set<string>()
  const last7 = new Set<string>()
  const anyXp = new Set<string>()
  let totalReviewEvents = 0

  const cutoff30 = now.getTime() - 30 * DAY_MS
  const cutoff7 = now.getTime() - 7 * DAY_MS

  for (const event of xpEvents) {
    if (!event.user_id) continue
    anyXp.add(event.user_id)
    if (event.source_type !== 'flashcard') continue
    totalReviewEvents++
    ever.add(event.user_id)
    const t = new Date(event.created_at).getTime()
    if (t >= cutoff30) last30.add(event.user_id)
    if (t >= cutoff7) last7.add(event.user_id)
  }

  return {
    usersEverReviewed: ever.size,
    usersReviewedLast30Days: last30.size,
    usersReviewedLast7Days: last7.size,
    totalReviewEvents,
    pctOfActiveLearners: pct(ever.size, anyXp.size),
  }
}

// ─── Return behaviour ────────────────────────────────────────────────────────

export interface BaselineReturnCohorts {
  cohortSize: number
  returnedDay1: number
  returnedDay7: number
  pctReturnedDay1: number
  pctReturnedDay7: number
  medianActiveDays: number | null
}

/**
 * D1 / D7 return, defined as XP activity on a distinct UTC day after signup day.
 *
 * XP events are the only durable server-side record of "the learner did something" —
 * there is no session table. A learner who logged in and read without earning XP is
 * therefore invisible here, which makes this a **floor** on return, not an exact rate.
 * Stated as such in the report.
 *
 * The cohort excludes accounts younger than the window so a user who signed up
 * yesterday is not counted as a D7 non-returner.
 */
export function computeReturnCohorts(
  users: BaselineUserRow[],
  xpEvents: BaselineXpEventRow[],
  now: Date = new Date()
): BaselineReturnCohorts {
  const daysByUser = new Map<string, Set<string>>()
  for (const event of xpEvents) {
    if (!event.user_id) continue
    let set = daysByUser.get(event.user_id)
    if (!set) {
      set = new Set<string>()
      daysByUser.set(event.user_id, set)
    }
    set.add(utcDayKey(event.created_at))
  }

  const eligible = users.filter(
    (u) => now.getTime() - new Date(u.created_at).getTime() >= 7 * DAY_MS
  )

  let returnedDay1 = 0
  let returnedDay7 = 0
  const activeDayCounts: number[] = []

  for (const user of eligible) {
    const created = new Date(user.created_at).getTime()
    const signupDay = utcDayKey(user.created_at)
    const days = daysByUser.get(user.id)
    activeDayCounts.push(days ? days.size : 0)
    if (!days) continue

    // Per learner, not per active day — one returning learner is one return.
    let day1 = false
    let day7 = false
    for (const day of days) {
      if (day === signupDay) continue
      const delta = new Date(`${day}T00:00:00Z`).getTime() - created
      if (delta <= 0) continue
      if (delta <= 2 * DAY_MS) day1 = true
      if (delta <= 8 * DAY_MS) day7 = true
    }
    if (day1) returnedDay1++
    if (day7) returnedDay7++
  }

  return {
    cohortSize: eligible.length,
    returnedDay1,
    returnedDay7,
    pctReturnedDay1: pct(returnedDay1, eligible.length),
    pctReturnedDay7: pct(returnedDay7, eligible.length),
    medianActiveDays: median(activeDayCounts),
  }
}

// ─── 0.B.7 — Lesson 1 quiz score distribution ────────────────────────────────

export interface BaselineQuizDistribution {
  lessonId: string
  learnersWithAttempts: number
  totalAttemptRows: number
  medianScorePct: number | null
  /** Buckets of first-pass accuracy, in 20-point bands. */
  buckets: { label: string; learners: number }[]
}

/**
 * Per-learner accuracy on one lesson's quiz, from `quiz_attempts`.
 *
 * This is the **guardrail baseline for Phase 4 (E2)**. If the Core/Deep-dive split
 * raises activation but accuracy on the same 15-question bank falls against this
 * number, Core is too thin and the experiment's guardrail has fired.
 *
 * Accuracy is computed per distinct `question_id` so a retried question is counted once,
 * using the learner's best result — matching how `completeLesson` keeps
 * `Math.max(prevScore, quizScore)`.
 */
export function computeQuizDistribution(
  attempts: BaselineQuizAttemptRow[],
  lessonId: string
): BaselineQuizDistribution {
  const byUser = new Map<string, Map<string, boolean>>()

  for (const row of attempts) {
    if (!row.user_id || row.lesson_id !== lessonId) continue
    let questions = byUser.get(row.user_id)
    if (!questions) {
      questions = new Map<string, boolean>()
      byUser.set(row.user_id, questions)
    }
    questions.set(row.question_id, (questions.get(row.question_id) ?? false) || row.is_correct)
  }

  const scores: number[] = []
  for (const questions of byUser.values()) {
    const total = questions.size
    if (total === 0) continue
    const correct = [...questions.values()].filter(Boolean).length
    scores.push(Math.round((correct / total) * 100))
  }

  const bands: { label: string; min: number; max: number }[] = [
    { label: '0–19%', min: 0, max: 19 },
    { label: '20–39%', min: 20, max: 39 },
    { label: '40–59%', min: 40, max: 59 },
    { label: '60–79%', min: 60, max: 79 },
    { label: '80–100%', min: 80, max: 100 },
  ]

  return {
    lessonId,
    learnersWithAttempts: byUser.size,
    totalAttemptRows: attempts.filter((a) => a.lesson_id === lessonId).length,
    medianScorePct: median(scores),
    buckets: bands.map((b) => ({
      label: b.label,
      learners: scores.filter((s) => s >= b.min && s <= b.max).length,
    })),
  }
}

// ─── 0.B.8 — Capstone reality ────────────────────────────────────────────────

export interface BaselineCapstoneReality {
  totalRows: number
  distinctLearners: number
  byStatus: Record<string, number>
  submittedOrReviewed: number
  /** Submissions still waiting on the manual admin review described in the plan. */
  awaitingReview: number
}

/**
 * Capstones are the product's differentiator and require 8 of 10 module lessons, so this
 * is expected to be close to zero. It is measured rather than assumed because Phase 7's
 * target (10 % of activated learners) needs a real starting point, and because
 * `awaitingReview` is the number that decides whether the Phase 7.2 review SLA is a
 * promise the team can currently keep.
 */
export function computeCapstoneReality(rows: BaselineCapstoneRow[]): BaselineCapstoneReality {
  const byStatus: Record<string, number> = {}
  const learners = new Set<string>()

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
    if (row.user_id) learners.add(row.user_id)
  }

  return {
    totalRows: rows.length,
    distinctLearners: learners.size,
    byStatus,
    submittedOrReviewed: (byStatus.submitted ?? 0) + (byStatus.reviewed ?? 0),
    awaitingReview: byStatus.submitted ?? 0,
  }
}

// ─── 0.B.9 — Consent capture (signup legal consent, NOT cookie consent) ──────

export interface BaselineConsentCapture {
  totalUsers: number
  withRecordedTermsConsent: number
  predatingConsentCapture: number
  pctWithRecordedConsent: number
}

/**
 * Coverage of the consent record added by `20260923000001_signup_legal_consent.sql`.
 *
 * **This is not the cookie-consent acceptance rate.** The plan's 0.B.9 asked for the
 * latter to quantify how unrepresentative GA4 is; that number does not exist in the
 * database. `lib/legal/cookie-consent.ts` stores the decision in the client-readable
 * `prodily_cookie_consent` cookie and nowhere else, so no server-side row records it.
 * See `BASELINE_UNMEASURABLE`.
 *
 * What this does answer is the compliance question the migration was written for: how
 * many accounts carry a real consent record, and how many predate capture. A NULL here
 * means "created before 2026-09-23", never "refused" — the migration says so explicitly
 * and this function must not reinterpret it.
 */
export function computeConsentCapture(users: BaselineUserRow[]): BaselineConsentCapture {
  const withConsent = users.filter((u) => u.terms_accepted_at !== null).length
  return {
    totalUsers: users.length,
    withRecordedTermsConsent: withConsent,
    predatingConsentCapture: users.length - withConsent,
    pctWithRecordedConsent: pct(withConsent, users.length),
  }
}

// ─── 0.B.1 / 0.B.2 — Email delivery reality ──────────────────────────────────

/**
 * The five templates the audit identified as dropped before send, plus the two auth
 * templates that are expected to send, as a control. If the learning templates show
 * sends and the `user_preference_disabled` skips are absent, finding F1 is wrong and
 * `IMPLEMENTATION_PLAN.md` §"Contingency if 0.B kills F1" applies.
 */
export const LIFECYCLE_TEMPLATE_KEYS = [
  'learning.daily_reminder',
  'learning.weekly_recap',
  'learning.module_complete',
  'achievement.badge_earned',
  'achievement.level_up',
] as const

export const CONTROL_TEMPLATE_KEYS = ['auth.welcome', 'auth.verify_email'] as const

export interface BaselineEmailReality {
  /** Per template: how many queue rows exist, and how many actually reached `sent`. */
  byTemplate: { templateKey: string; total: number; sent: number; failed: number }[]
  lifecycleSent: number
  controlSent: number
  /** Histogram of `notification_events.skipped_reason`, most frequent first. */
  skippedReasons: { reason: string; count: number }[]
  preferenceDisabledSkips: number
  /**
   * True when no lifecycle template has ever reached `sent` AND at least one
   * preference-disabled skip was recorded. This is the machine-checkable form of F1.
   */
  confirmsInboxChannelDead: boolean
}

export function computeEmailReality(
  queueRows: BaselineEmailQueueRow[],
  notificationEvents: BaselineNotificationEventRow[]
): BaselineEmailReality {
  const templates = new Map<string, { total: number; sent: number; failed: number }>()

  for (const row of queueRows) {
    let entry = templates.get(row.template_key)
    if (!entry) {
      entry = { total: 0, sent: 0, failed: 0 }
      templates.set(row.template_key, entry)
    }
    entry.total++
    if (row.status === 'sent') entry.sent++
    if (row.status === 'failed' || row.status === 'dead_letter') entry.failed++
  }

  const byTemplate = [...templates.entries()]
    .map(([templateKey, v]) => ({ templateKey, ...v }))
    .sort((a, b) => b.total - a.total)

  const sentFor = (keys: readonly string[]) =>
    keys.reduce((sum, k) => sum + (templates.get(k)?.sent ?? 0), 0)

  const reasonCounts = new Map<string, number>()
  for (const event of notificationEvents) {
    if (!event.skipped_reason) continue
    reasonCounts.set(event.skipped_reason, (reasonCounts.get(event.skipped_reason) ?? 0) + 1)
  }

  const skippedReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  const preferenceDisabledSkips = skippedReasons
    .filter((r) => r.reason.startsWith('user_preference_disabled'))
    .reduce((sum, r) => sum + r.count, 0)

  const lifecycleSent = sentFor(LIFECYCLE_TEMPLATE_KEYS)

  return {
    byTemplate,
    lifecycleSent,
    controlSent: sentFor(CONTROL_TEMPLATE_KEYS),
    skippedReasons,
    preferenceDisabledSkips,
    confirmsInboxChannelDead: lifecycleSent === 0 && preferenceDisabledSkips > 0,
  }
}

// ─── Questions the current schema cannot answer ──────────────────────────────

/**
 * The honest gaps.
 *
 * `IMPLEMENTATION_PLAN.md` forbids inventing metrics, so each of these is recorded as
 * an absence with the reason and the smallest change that would close it. None of those
 * changes is made here: Phase 0.B is read-only by design, and instrumentation belongs to
 * Phase 2 where it can be decided on evidence rather than added in passing.
 */
export const BASELINE_UNMEASURABLE: {
  question: string
  why: string
  wouldRequire: string
}[] = [
  {
    question: 'Cookie-consent acceptance rate (how unrepresentative is GA4?)',
    why:
      'lib/legal/cookie-consent.ts stores the decision only in the client-readable ' +
      '`prodily_cookie_consent` cookie. No server-side row records it, so there is ' +
      'nothing to count.',
    wouldRequire:
      'A counter incremented where the proxy already reads the cookie, or a cookieless ' +
      'aggregate from Vercel Analytics. A Phase 2 decision, not a Phase 0.B one.',
  },
  {
    question: 'Signup → first lesson OPEN (as opposed to first completion)',
    why:
      '`user_lesson_progress` has no creation timestamp — only `theory_read_at` and ' +
      '`completed_at`. The moment a lesson was first opened is not stored anywhere.',
    wouldRequire:
      'A `started_at` column written by markInProgress(). Additive and cheap, but it ' +
      'belongs with the Phase 2 funnel so the whole funnel is instrumented once.',
  },
  {
    question: 'Email verification rate (signup → verified)',
    why:
      '`email_confirmed_at` lives in the Supabase `auth.users` schema, not in ' +
      '`public.users`, so it is not reachable from a PostgREST table read. The baseline ' +
      'script reads it through the auth admin API instead, and reports it separately.',
    wouldRequire: 'Nothing — it is measurable, just not from the same source as the rest.',
  },
  {
    question: 'Per-onboarding-step drop-off',
    why:
      'The wizard is a client component that writes only the final ' +
      '`onboarding_completed` flag. Intermediate steps leave no server trace.',
    wouldRequire:
      'The step marker specified in IMPLEMENTATION_PLAN.md §Phase 2, item 3. Phase 5 ' +
      'depends on it; Phase 0.B does not.',
  },
  {
    question: 'Sessions, page views and time-on-page for logged-in learners',
    why:
      'There is no session table. XP events are the only durable record of activity, so ' +
      'a learner who read without earning XP is invisible.',
    wouldRequire:
      'Nothing in scope. Return metrics in this report are therefore a floor, and are ' +
      'labelled as such.',
  },
]
