import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { deriveProofState, selectProofNextStep, type ProofStateInput, type ProofUserRow } from '@/lib/growth/proof-state'
import { loadProofStates, PROOF_STATE_BATCH_SIZE } from '@/lib/growth/proof-state-db'
import { getLessonIdsForModule } from '@/lib/curriculum-registry'

// Growth R5 / B1: one place decides a learner's proof state and the next step toward it.

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const completeProfile: ProofUserRow = {
  username: 'ada',
  name: 'Ada Lovelace',
  bio: 'Product thinker building in public.',
  avatar_url: 'https://example.test/a.png',
  linkedin_url: 'https://linkedin.com/in/ada',
  github_url: null,
  website_url: null,
  is_portfolio_public: true,
  is_fellow: false,
}
const publicCapstone = { module_slug: 'discovery', status: 'reviewed', is_public: true }

const input = (overrides: Partial<ProofStateInput> = {}): ProofStateInput => ({
  userId: USER,
  user: completeProfile,
  capstones: [publicCapstone],
  latestFellowRequestStatus: null,
  completedLessonIds: [],
  hasFullCurriculumCertificate: false,
  ...overrides,
})
const next = (overrides: Partial<ProofStateInput> = {}) => selectProofNextStep(deriveProofState(input(overrides)))

describe('selectProofNextStep', () => {
  it('asks to publish a portfolio that is ready apart from being private', () => {
    const step = next({ user: { ...completeProfile, is_portfolio_public: false } })
    expect(step).toMatchObject({ kind: 'publish_portfolio', path: '/settings?tab=portfolio' })
  })

  it('does not ask to publish a private portfolio that is not ready yet', () => {
    const step = next({ user: { ...completeProfile, is_portfolio_public: false, bio: null } })
    expect(step.kind).not.toBe('publish_portfolio')
  })

  it('asks to request Fellow when eligible, and never calls Fellow a credential', () => {
    const step = next()
    expect(step.kind).toBe('request_fellow')
    expect(step.text).not.toMatch(/certif|credential/i)
  })

  it.each([
    ['pending', 'pending'],
    ['approved Fellow', 'fellow'],
  ])('does not ask a %s learner to request Fellow', (_label, which) => {
    const step =
      which === 'pending'
        ? next({ latestFellowRequestStatus: 'pending' })
        : next({ user: { ...completeProfile, is_fellow: true } })
    expect(step.kind).not.toBe('request_fellow')
  })

  it('points to the next capstone once its module is finished (the Growth module maps to metrics)', () => {
    const growth = getLessonIdsForModule('growth')
    const step = next({ user: { ...completeProfile, is_fellow: true }, completedLessonIds: growth })
    expect(step).toMatchObject({ kind: 'submit_capstone', path: '/capstones/metrics' })
  })

  it('counts lessons toward the certificate when nothing else is pending', () => {
    const step = next({ user: { ...completeProfile, is_fellow: true }, completedLessonIds: ['les_x'] })
    expect(step).toEqual({
      kind: 'continue_lessons',
      text: 'You have completed 1 of 90 lessons toward your certificate.',
      path: '/academy',
    })
  })

  it('has nothing left once the certificate is earned', () => {
    expect(next({ user: { ...completeProfile, is_fellow: true }, hasFullCurriculumCertificate: true }).kind).toBe('none')
  })
})

describe('loadProofStates', () => {
  function fakeSupabase(failTable?: string) {
    const tables: string[] = []
    const rows: Record<string, unknown[]> = {
      users: [{ id: USER, ...completeProfile }],
      capstone_submissions: [{ user_id: USER, ...publicCapstone }],
      fellow_requests: [
        { user_id: USER, status: 'rejected', requested_at: '2026-10-05T00:00:00Z' },
        { user_id: USER, status: 'pending', requested_at: '2026-09-01T00:00:00Z' },
      ],
      user_lesson_progress: [],
      certificates: [],
    }
    const client = {
      from(table: string) {
        tables.push(table)
        const result = table === failTable ? { data: null, error: { message: 'down' } } : { data: rows[table], error: null }
        const chain: Record<string, unknown> = {}
        for (const method of ['select', 'in', 'eq', 'order', 'not']) chain[method] = () => chain
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
        return chain
      },
    }
    return { client: client as unknown as SupabaseClient<Database>, tables }
  }

  it('uses a fixed five queries for a whole page of learners', async () => {
    const db = fakeSupabase()
    const ids = Array.from({ length: PROOF_STATE_BATCH_SIZE }, (_, i) => (i === 0 ? USER : `user-${i}`))

    const states = await loadProofStates(db.client, ids)

    expect(db.tables).toHaveLength(5)
    // The newest request (rejected) is the one that counts.
    expect(states?.get(USER)?.fellowState).toBe('eligible')
  })

  it('returns null when any read fails, so the job skips the page', async () => {
    expect(await loadProofStates(fakeSupabase('fellow_requests').client, [USER])).toBeNull()
  })

  it('refuses more than one page of learners', async () => {
    const ids = Array.from({ length: PROOF_STATE_BATCH_SIZE + 1 }, (_, i) => `user-${i}`)
    await expect(loadProofStates(fakeSupabase().client, ids)).rejects.toThrow(/at most/)
  })
})
