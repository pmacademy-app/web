import { describe, expect, it } from 'vitest'
import {
  computeNudgeReadout,
  emptyNudgeReadout,
  NUDGE_HOLDOUT_REASON,
  NUDGE_READOUT_EVENT_TYPES,
  NUDGE_RETIRE_MIN_TREATED,
  type NudgeEventRow,
} from '../admin/nudge-readout'

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.parse('2026-09-01T00:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

const sent = (key: string, user: string, at = T0): NudgeEventRow => ({
  user_id: user,
  event_type: key,
  skipped_reason: null,
  created_at: iso(at),
})
const held = (key: string, user: string, at = T0): NudgeEventRow => ({
  user_id: user,
  event_type: key,
  skipped_reason: NUDGE_HOLDOUT_REASON,
  created_at: iso(at),
})

const byKey = (r: ReturnType<typeof computeNudgeReadout>) => new Map(r.nudges.map((n) => [n.key, n]))

describe('computeNudgeReadout', () => {
  it('reads both nudge keys and their reminders', () => {
    expect(NUDGE_READOUT_EVENT_TYPES.sort()).toEqual([
      'nudge.fellow_eligible',
      'nudge.fellow_eligible.reminder',
      'nudge.portfolio_ready',
      'nudge.portfolio_ready.reminder',
    ])
  })

  it('returns zeroed rows with names when there is no data', () => {
    const r = emptyNudgeReadout({ 'nudge.portfolio_ready': 'Portfolio Ready Nudge' })
    expect(r.retireReady).toBe(false)
    expect(r.nudges).toHaveLength(2)
    const m = byKey(r)
    expect(m.get('nudge.portfolio_ready')).toMatchObject({
      name: 'Portfolio Ready Nudge',
      sent: 0,
      heldOut: 0,
      reminded: 0,
      treatedRate: 0,
      holdoutRate: 0,
      lift: 0,
      ready: false,
    })
    expect(m.get('nudge.fellow_eligible')!.name).toBe('nudge.fellow_eligible')
  })

  it('counts distinct users for sent, held out and reminded', () => {
    const k = 'nudge.portfolio_ready'
    const r = computeNudgeReadout({
      events: [
        sent(k, 'a'),
        sent(k, 'a', T0 + DAY), // duplicate row for the same user
        sent(k, 'b'),
        held(k, 'c'),
        { ...sent(`${k}.reminder`, 'a'), created_at: iso(T0 + 8 * DAY) },
        { ...sent(`${k}.reminder`, 'a'), created_at: iso(T0 + 9 * DAY) },
        sent('nudge.fellow_eligible', 'z'), // other nudge, not counted here
      ],
      publicUserIds: [],
      fellowRequests: [],
    })
    expect(byKey(r).get(k)).toMatchObject({ sent: 2, heldOut: 1, reminded: 1 })
  })

  it('portfolio_ready converts on the currently-public flag, regardless of time', () => {
    const k = 'nudge.portfolio_ready'
    const r = computeNudgeReadout({
      events: [sent(k, 'a'), sent(k, 'b'), sent(k, 'c'), sent(k, 'd'), held(k, 'e'), held(k, 'f')],
      publicUserIds: ['a', 'b', 'c', 'e', 'not-nudged'],
      fellowRequests: [],
    })
    const n = byKey(r).get(k)!
    expect(n.treatedRate).toBeCloseTo(0.75)
    expect(n.holdoutRate).toBeCloseTo(0.5)
    expect(n.lift).toBeCloseTo(0.25)
  })

  it('fellow_eligible converts only on a request within 14 days of the nudge row', () => {
    const k = 'nudge.fellow_eligible'
    const r = computeNudgeReadout({
      events: [
        sent(k, 'in-window'),
        sent(k, 'edge'),
        sent(k, 'too-late'),
        sent(k, 'before'),
        held(k, 'held-in'),
        held(k, 'held-late'),
      ],
      publicUserIds: ['in-window', 'too-late'], // portfolio flag must not affect this nudge
      fellowRequests: [
        { user_id: 'in-window', requested_at: iso(T0 + 3 * DAY) },
        { user_id: 'edge', requested_at: iso(T0 + 14 * DAY) },
        { user_id: 'too-late', requested_at: iso(T0 + 14 * DAY + 1) },
        { user_id: 'before', requested_at: iso(T0 - 1) },
        { user_id: 'held-in', requested_at: iso(T0 + DAY) },
        { user_id: 'held-late', requested_at: iso(T0 + 20 * DAY) },
      ],
    })
    const n = byKey(r).get(k)!
    expect(n.sent).toBe(4)
    expect(n.treatedRate).toBeCloseTo(0.5) // in-window + edge
    expect(n.holdoutRate).toBeCloseTo(0.5) // held-in
    expect(n.lift).toBeCloseTo(0)
    expect(n.ready).toBe(false)
  })

  it('anchors the window on the earliest initial row per user', () => {
    const k = 'nudge.fellow_eligible'
    const r = computeNudgeReadout({
      events: [sent(k, 'a', T0 + 10 * DAY), sent(k, 'a', T0)],
      publicUserIds: [],
      fellowRequests: [{ user_id: 'a', requested_at: iso(T0 + 20 * DAY) }],
    })
    expect(byKey(r).get(k)!.treatedRate).toBe(0)
  })

  it('reports negative lift when the holdout converts more', () => {
    const k = 'nudge.portfolio_ready'
    const r = computeNudgeReadout({
      events: [sent(k, 'a'), sent(k, 'b'), held(k, 'c')],
      publicUserIds: ['c'],
      fellowRequests: [],
    })
    const n = byKey(r).get(k)!
    expect(n.lift).toBeLessThan(0)
    expect(n.lift).toBeCloseTo(-1)
    expect(n.ready).toBe(false)
  })

  describe('retire threshold', () => {
    const build = (treatedPortfolio: number, treatedFellow: number, holdoutConverts = false) => {
      const events: NudgeEventRow[] = []
      const publicUserIds: string[] = []
      const fellowRequests: Array<{ user_id: string; requested_at: string }> = []
      for (let i = 0; i < treatedPortfolio; i++) {
        events.push(sent('nudge.portfolio_ready', `p${i}`))
        if (i % 2 === 0) publicUserIds.push(`p${i}`)
      }
      for (let i = 0; i < treatedFellow; i++) {
        events.push(sent('nudge.fellow_eligible', `f${i}`))
        if (i % 2 === 0) fellowRequests.push({ user_id: `f${i}`, requested_at: iso(T0 + DAY) })
      }
      for (let i = 0; i < 50; i++) {
        events.push(held('nudge.portfolio_ready', `hp${i}`))
        events.push(held('nudge.fellow_eligible', `hf${i}`))
        if (holdoutConverts) {
          publicUserIds.push(`hp${i}`)
          fellowRequests.push({ user_id: `hf${i}`, requested_at: iso(T0 + DAY) })
        }
      }
      return computeNudgeReadout({ events, publicUserIds, fellowRequests })
    }

    it('is 200', () => {
      expect(NUDGE_RETIRE_MIN_TREATED).toBe(200)
    })

    it('is ready when both nudges reach 200 treated with positive lift', () => {
      const r = build(NUDGE_RETIRE_MIN_TREATED, NUDGE_RETIRE_MIN_TREATED)
      expect(r.nudges.every((n) => n.ready)).toBe(true)
      expect(r.retireReady).toBe(true)
    })

    it('is not ready one user below the threshold', () => {
      const r = build(NUDGE_RETIRE_MIN_TREATED, NUDGE_RETIRE_MIN_TREATED - 1)
      const m = byKey(r)
      expect(m.get('nudge.portfolio_ready')!.ready).toBe(true)
      expect(m.get('nudge.fellow_eligible')!.ready).toBe(false)
      expect(r.retireReady).toBe(false)
    })

    it('is not ready with enough users but negative lift', () => {
      const r = build(300, 300, true)
      for (const n of r.nudges) {
        expect(n.sent).toBe(300)
        expect(n.lift).toBeLessThan(0)
        expect(n.ready).toBe(false)
      }
      expect(r.retireReady).toBe(false)
    })
  })
})
