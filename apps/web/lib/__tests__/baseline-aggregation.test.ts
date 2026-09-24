import { describe, it, expect } from 'vitest'

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
  median,
  percentile,
  BASELINE_UNMEASURABLE,
  LIFECYCLE_TEMPLATE_KEYS,
  type BaselineUserRow,
  type BaselineProgressRow,
  type BaselineXpEventRow,
} from '@/lib/admin/baseline-aggregation'

/**
 * Phase 0.B aggregation tests.
 *
 * The baseline decides the phase order of the whole implementation plan, so the
 * arithmetic is tested against fixtures rather than trusted. The cases below are chosen
 * for the ways a baseline goes quietly wrong: orphaned rows inflating a numerator past
 * its denominator, a per-day loop double-counting a returning learner, a retried quiz
 * question counted twice, and an empty input reported as a confident zero.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-24T12:00:00.000Z')
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString()

function user(id: string, overrides: Partial<BaselineUserRow> = {}): BaselineUserRow {
  return {
    id,
    created_at: iso(-30),
    onboarding_completed: true,
    terms_accepted_at: null,
    ...overrides,
  }
}

function progress(
  user_id: string,
  lesson_id: string,
  overrides: Partial<BaselineProgressRow> = {}
): BaselineProgressRow {
  return {
    user_id,
    lesson_id,
    status: 'in_progress',
    theory_read_at: null,
    completed_at: null,
    quiz_attempts: 0,
    ...overrides,
  }
}

describe('median / percentile', () => {
  it('returns null for an empty set rather than a misleading zero', () => {
    expect(median([])).toBeNull()
    expect(percentile([], 0.5)).toBeNull()
  })

  it('averages the middle pair for an even-length set', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('uses nearest rank and does not mutate the caller array', () => {
    const values = [10, 1, 5]
    expect(percentile(values, 0.5)).toBe(5)
    expect(values).toEqual([10, 1, 5])
  })
})

describe('computeActivationFunnel', () => {
  it('splits non-activators into never-opened and opened-but-never-completed', () => {
    const users = [user('a'), user('b'), user('c'), user('d')]
    const rows = [
      progress('a', 'les_1', { status: 'completed', completed_at: iso(-20), theory_read_at: iso(-20) }),
      progress('b', 'les_1', { theory_read_at: iso(-10) }),
      progress('c', 'les_1'),
    ]

    const funnel = computeActivationFunnel(users, rows)

    expect(funnel.registered).toBe(4)
    expect(funnel.everOpenedLesson).toBe(3)
    expect(funnel.everCompletedLesson).toBe(1)
    expect(funnel.neverOpenedLesson).toBe(1)
    expect(funnel.openedButNeverCompleted).toBe(2)
    expect(funnel.everReadTheory).toBe(2)
    expect(funnel.pctEverCompleted).toBe(25)
  })

  it('ignores progress rows belonging to deleted accounts', () => {
    // Otherwise a numerator can exceed its denominator and every percentage is wrong.
    const funnel = computeActivationFunnel(
      [user('a')],
      [
        progress('a', 'les_1', { status: 'completed', completed_at: iso(-1) }),
        progress('ghost', 'les_1', { status: 'completed', completed_at: iso(-1) }),
      ]
    )

    expect(funnel.everOpenedLesson).toBe(1)
    expect(funnel.everCompletedLesson).toBe(1)
    expect(funnel.neverOpenedLesson).toBe(0)
    expect(funnel.pctEverCompleted).toBe(100)
  })

  it('reports zeroes rather than dividing by zero on an empty database', () => {
    const funnel = computeActivationFunnel([], [])
    expect(funnel.registered).toBe(0)
    expect(funnel.pctEverCompleted).toBe(0)
  })
})

describe('computeTheoryGateStalls', () => {
  it('counts only rows with no theory read and no quiz attempt', () => {
    const stalls = computeTheoryGateStalls([
      progress('a', 'les_1'),
      progress('a', 'les_2', { quiz_attempts: 2 }),
      progress('b', 'les_1', { theory_read_at: iso(-1) }),
      progress('c', 'les_1', { status: 'completed', completed_at: iso(-1) }),
    ])

    expect(stalls.stalledRows).toBe(1)
    expect(stalls.stalledUsers).toBe(1)
    expect(stalls.pctOfOpeners).toBe(33.3)
  })

  it('never counts a completed lesson as a stall', () => {
    const stalls = computeTheoryGateStalls([
      progress('a', 'les_1', { status: 'completed', completed_at: iso(-1) }),
    ])
    expect(stalls.stalledRows).toBe(0)
  })
})

describe('computeTimeToFirstCompletion', () => {
  it('uses the earliest completion per learner', () => {
    const timing = computeTimeToFirstCompletion(
      [user('a', { created_at: iso(-10) })],
      [
        progress('a', 'les_2', { status: 'completed', completed_at: iso(-5) }),
        progress('a', 'les_1', { status: 'completed', completed_at: iso(-9) }),
      ]
    )

    expect(timing.sampleSize).toBe(1)
    expect(timing.medianHours).toBe(24)
  })

  it('drops negative intervals instead of clamping them', () => {
    // A completion stamped before the account indicates clock skew or a migrated row;
    // clamping to zero would bias the median toward "instant activation".
    const timing = computeTimeToFirstCompletion(
      [user('a', { created_at: iso(-1) })],
      [progress('a', 'les_1', { status: 'completed', completed_at: iso(-5) })]
    )

    expect(timing.sampleSize).toBe(0)
    expect(timing.medianHours).toBeNull()
  })

  it('counts same-day and within-seven-day completions', () => {
    const created = '2026-09-01T02:00:00.000Z'
    const timing = computeTimeToFirstCompletion(
      [user('a', { created_at: created }), user('b', { created_at: created })],
      [
        progress('a', 'les_1', { status: 'completed', completed_at: '2026-09-01T20:00:00.000Z' }),
        progress('b', 'les_1', { status: 'completed', completed_at: '2026-09-20T20:00:00.000Z' }),
      ]
    )

    expect(timing.sameDayCount).toBe(1)
    expect(timing.withinSevenDaysCount).toBe(1)
    expect(timing.sampleSize).toBe(2)
  })
})

describe('computeReviewUsage', () => {
  const events: BaselineXpEventRow[] = [
    { user_id: 'a', source_type: 'flashcard', created_at: iso(-2) },
    { user_id: 'a', source_type: 'flashcard', created_at: iso(-20) },
    { user_id: 'b', source_type: 'flashcard', created_at: iso(-45) },
    { user_id: 'c', source_type: 'quiz_correct', created_at: iso(-1) },
    { user_id: null, source_type: 'flashcard', created_at: iso(-1) },
  ]

  it('windows review usage and ignores null user ids', () => {
    const review = computeReviewUsage(events, NOW)

    expect(review.usersEverReviewed).toBe(2)
    expect(review.usersReviewedLast30Days).toBe(1)
    expect(review.usersReviewedLast7Days).toBe(1)
    expect(review.totalReviewEvents).toBe(3)
  })

  it('expresses adoption against learners with any XP, not all users', () => {
    const review = computeReviewUsage(events, NOW)
    // a, b, c have XP; a and b reviewed.
    expect(review.pctOfActiveLearners).toBe(66.7)
  })
})

describe('computeReturnCohorts', () => {
  it('counts a returning learner once regardless of how many days they were active', () => {
    const returns = computeReturnCohorts(
      [user('a', { created_at: iso(-20) })],
      [
        { user_id: 'a', source_type: 'quiz_correct', created_at: iso(-20) },
        { user_id: 'a', source_type: 'quiz_correct', created_at: iso(-19) },
        { user_id: 'a', source_type: 'quiz_correct', created_at: iso(-18) },
      ],
      NOW
    )

    expect(returns.returnedDay1).toBe(1)
    expect(returns.returnedDay7).toBe(1)
    expect(returns.pctReturnedDay1).toBe(100)
  })

  it('excludes accounts younger than the observation window', () => {
    const returns = computeReturnCohorts([user('new', { created_at: iso(-2) })], [], NOW)
    expect(returns.cohortSize).toBe(0)
    expect(returns.pctReturnedDay7).toBe(0)
  })

  it('does not count signup-day activity as a return', () => {
    const created = '2026-09-01T09:00:00.000Z'
    const returns = computeReturnCohorts(
      [user('a', { created_at: created })],
      [{ user_id: 'a', source_type: 'theory_read', created_at: '2026-09-01T23:00:00.000Z' }],
      NOW
    )

    expect(returns.returnedDay1).toBe(0)
    expect(returns.medianActiveDays).toBe(1)
  })
})

describe('computeQuizDistribution', () => {
  it('scores a retried question once, using the best result', () => {
    const quiz = computeQuizDistribution(
      [
        { user_id: 'a', lesson_id: 'les_1', question_id: 'q1', is_correct: false },
        { user_id: 'a', lesson_id: 'les_1', question_id: 'q1', is_correct: true },
        { user_id: 'a', lesson_id: 'les_1', question_id: 'q2', is_correct: true },
      ],
      'les_1'
    )

    expect(quiz.learnersWithAttempts).toBe(1)
    expect(quiz.medianScorePct).toBe(100)
    expect(quiz.buckets.find((b) => b.label === '80–100%')?.learners).toBe(1)
  })

  it('ignores attempts from other lessons', () => {
    const quiz = computeQuizDistribution(
      [
        { user_id: 'a', lesson_id: 'les_1', question_id: 'q1', is_correct: true },
        { user_id: 'b', lesson_id: 'les_2', question_id: 'q1', is_correct: false },
      ],
      'les_1'
    )

    expect(quiz.learnersWithAttempts).toBe(1)
    expect(quiz.totalAttemptRows).toBe(1)
  })
})

describe('computeCapstoneReality', () => {
  it('separates submitted from reviewed and surfaces the review backlog', () => {
    const capstone = computeCapstoneReality([
      { user_id: 'a', module_slug: 'foundations', status: 'submitted' },
      { user_id: 'b', module_slug: 'foundations', status: 'reviewed' },
      { user_id: 'a', module_slug: 'discovery', status: 'draft' },
    ])

    expect(capstone.totalRows).toBe(3)
    expect(capstone.distinctLearners).toBe(2)
    expect(capstone.submittedOrReviewed).toBe(2)
    expect(capstone.awaitingReview).toBe(1)
  })
})

describe('computeConsentCapture', () => {
  it('treats a null consent timestamp as predating capture, never as a refusal', () => {
    const consent = computeConsentCapture([
      user('a', { terms_accepted_at: iso(-1) }),
      user('b'),
      user('c'),
    ])

    expect(consent.withRecordedTermsConsent).toBe(1)
    expect(consent.predatingConsentCapture).toBe(2)
    expect(consent.pctWithRecordedConsent).toBe(33.3)
  })
})

describe('computeEmailReality', () => {
  it('confirms the dead inbox channel only when sends are zero AND skips exist', () => {
    const email = computeEmailReality(
      [
        { template_key: 'learning.daily_reminder', status: 'skipped', skipped_reason: null },
        { template_key: 'auth.welcome', status: 'sent', skipped_reason: null },
      ],
      [
        { event_type: 'learning.daily_reminder', skipped_reason: 'user_preference_disabled:learning' },
        { event_type: 'xp.level_up', skipped_reason: 'user_preference_disabled:achievements' },
      ]
    )

    expect(email.lifecycleSent).toBe(0)
    expect(email.controlSent).toBe(1)
    expect(email.preferenceDisabledSkips).toBe(2)
    expect(email.confirmsInboxChannelDead).toBe(true)
  })

  it('does not confirm the finding when a lifecycle template has actually sent', () => {
    // This is the contingency branch in IMPLEMENTATION_PLAN.md: if F1 is wrong, Phase 1
    // must be re-scoped rather than implemented as written.
    const email = computeEmailReality(
      [{ template_key: 'learning.weekly_recap', status: 'sent', skipped_reason: null }],
      [{ event_type: 'learning.weekly_recap', skipped_reason: 'user_preference_disabled:learning' }]
    )

    expect(email.lifecycleSent).toBe(1)
    expect(email.confirmsInboxChannelDead).toBe(false)
  })

  it('does not confirm the finding when no skips were recorded at all', () => {
    const email = computeEmailReality([], [])
    expect(email.confirmsInboxChannelDead).toBe(false)
  })

  it('covers every lifecycle template named in the audit', () => {
    expect(LIFECYCLE_TEMPLATE_KEYS).toContain('learning.daily_reminder')
    expect(LIFECYCLE_TEMPLATE_KEYS).toContain('learning.weekly_recap')
    expect(LIFECYCLE_TEMPLATE_KEYS).toContain('learning.module_complete')
    expect(LIFECYCLE_TEMPLATE_KEYS).toContain('achievement.badge_earned')
    expect(LIFECYCLE_TEMPLATE_KEYS).toContain('achievement.level_up')
  })
})

describe('BASELINE_UNMEASURABLE', () => {
  it('records the cookie-consent gap rather than substituting a proxy for it', () => {
    const entry = BASELINE_UNMEASURABLE.find((g) => g.question.includes('Cookie-consent'))
    expect(entry).toBeDefined()
    expect(entry?.why).toMatch(/cookie/i)
  })

  it('gives every gap a reason and a remedy so none reads as an oversight', () => {
    expect(BASELINE_UNMEASURABLE.length).toBeGreaterThan(0)
    for (const gap of BASELINE_UNMEASURABLE) {
      expect(gap.question.length).toBeGreaterThan(0)
      expect(gap.why.length).toBeGreaterThan(0)
      expect(gap.wouldRequire.length).toBeGreaterThan(0)
    }
  })
})
