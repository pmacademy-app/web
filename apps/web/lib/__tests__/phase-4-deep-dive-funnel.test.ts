/**
 * Phase 4 (§4.4) — Deep-dive engagement aggregation.
 *
 * The pure funnel function that turns persisted `deep_dive_opened_at` markers into the
 * server-side, consent-independent guardrail: how many lesson-openers engage with the
 * optional depth. Mirrors the discipline of the other funnel aggregations — orphan rows
 * (users no longer present) are ignored so a deleted account cannot inflate the count.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDeepDiveEngagement,
  type DeepDiveProgressRow,
} from '@/lib/admin/funnel-aggregation'

const row = (
  user_id: string | null,
  deep_dive_opened_at: string | null,
  status = 'in_progress'
): DeepDiveProgressRow => ({ user_id, status, deep_dive_opened_at })

describe('computeDeepDiveEngagement', () => {
  const known = new Set(['u1', 'u2', 'u3'])

  it('counts distinct learners who opened a Deep-dive and the share of openers', () => {
    const progress = [
      row('u1', '2026-09-28T00:00:00Z'), // opened deep dive
      row('u1', null), // same learner, another lesson without deep dive
      row('u2', '2026-09-28T01:00:00Z'), // opened deep dive
      row('u3', null), // opened lesson, never deep dive
    ]
    const r = computeDeepDiveEngagement(progress, known)
    expect(r.learnersWhoOpenedLesson).toBe(3)
    expect(r.learnersWhoOpenedDeepDive).toBe(2)
    expect(r.lessonsWithDeepDiveOpened).toBe(2)
    expect(r.pctOfOpeners).toBe(66.7) // 2/3
  })

  it('ignores rows for users no longer present (no inflation from deleted accounts)', () => {
    const progress = [
      row('u1', '2026-09-28T00:00:00Z'),
      row('ghost', '2026-09-28T00:00:00Z'), // not in known set
      row(null, '2026-09-28T00:00:00Z'), // null user id
    ]
    const r = computeDeepDiveEngagement(progress, known)
    expect(r.learnersWhoOpenedLesson).toBe(1)
    expect(r.learnersWhoOpenedDeepDive).toBe(1)
    expect(r.lessonsWithDeepDiveOpened).toBe(1)
  })

  it('returns zeroes (not NaN) when nobody has opened a lesson', () => {
    const r = computeDeepDiveEngagement([], known)
    expect(r).toEqual({
      learnersWhoOpenedLesson: 0,
      learnersWhoOpenedDeepDive: 0,
      pctOfOpeners: 0,
      lessonsWithDeepDiveOpened: 0,
    })
  })

  it('counts a learner once even if they opened Deep-dive on multiple lessons', () => {
    const progress = [
      row('u1', '2026-09-28T00:00:00Z'),
      row('u1', '2026-09-28T02:00:00Z'),
    ]
    const r = computeDeepDiveEngagement(progress, known)
    expect(r.learnersWhoOpenedDeepDive).toBe(1)
    expect(r.lessonsWithDeepDiveOpened).toBe(2)
  })
})
