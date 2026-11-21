import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Learner API GET handlers that only read the caller's own rows run on the
 * learner-token client, so Row Level Security applies. Writes, settings reads,
 * cross-user reads and shared caches stay on the service role.
 */

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')

/** The source of one exported handler, from `export const NAME` up to the next export or EOF. */
function handler(rel: string, name: string): string {
  const src = read(rel)
  const start = src.indexOf(`export const ${name} = withRoute(`)
  expect(start, `${rel} exports ${name}`).toBeGreaterThanOrEqual(0)
  const next = src.indexOf('\nexport ', start + 1)
  return next === -1 ? src.slice(start) : src.slice(start, next)
}

const SWITCHED_GETS = [
  'app/api/xp/route.ts',
  'app/api/streaks/route.ts',
  'app/api/review/queue/route.ts',
  'app/api/skill-radar/route.ts',
  'app/api/capstones/route.ts',
  'app/api/capstones/[module]/route.ts',
  'app/api/certificates/route.ts',
  'app/api/reflections/route.ts',
  'app/api/user/curriculum-access/route.ts',
  'app/api/settings/goal/route.ts',
  'app/api/settings/profile/route.ts',
  'app/api/settings/portfolio/route.ts',
  'app/api/v2/lessons/[lessonId]/progress/route.ts',
  'app/api/badges/route.ts',
]

describe('learner API GET handlers read under RLS', () => {
  it.each(SWITCHED_GETS)('%s GET uses getLearnerDbForRequest and not the service role', (rel) => {
    const get = handler(rel, 'GET')
    expect(get).toContain('await getLearnerDbForRequest(request)')
    expect(get).not.toContain('createServiceRoleClient()')
  })

  it('passes the learner client to the audited library reads', () => {
    expect(handler('app/api/xp/route.ts', 'GET')).toContain('getUserXpSummary(supabase,')
    expect(handler('app/api/streaks/route.ts', 'GET')).toMatch(/getUserStreakStatus\(supabase,[\s\S]*getWeeklySummary\(supabase,/)
    expect(handler('app/api/review/queue/route.ts', 'GET')).toContain('getReviewQueueData(supabase,')
    expect(handler('app/api/skill-radar/route.ts', 'GET')).toContain('getSkillRadarSummary(supabase,')
    expect(handler('app/api/capstones/route.ts', 'GET')).toContain('getModuleCapstonesOverview(supabase,')
    expect(handler('app/api/capstones/[module]/route.ts', 'GET')).toContain('loadCapstoneSubmission(supabase,')
    expect(handler('app/api/certificates/route.ts', 'GET')).toContain('getUserCertificates(supabase,')
    expect(handler('app/api/badges/route.ts', 'GET')).toContain('getUserBadgesData(supabase,')
    expect(handler('app/api/v2/lessons/[lessonId]/progress/route.ts', 'GET')).toContain('findProgress(learnerDb,')
  })
})

describe('writes stay on the service role', () => {
  const WRITES: [string, string][] = [
    ['app/api/certificates/route.ts', 'POST'],
    ['app/api/reflections/route.ts', 'POST'],
    ['app/api/settings/goal/route.ts', 'POST'],
    ['app/api/settings/profile/route.ts', 'POST'],
    ['app/api/settings/portfolio/route.ts', 'POST'],
    ['app/api/v2/lessons/[lessonId]/progress/route.ts', 'PATCH'],
    ['app/api/badges/route.ts', 'POST'],
  ]

  it.each(WRITES)('%s %s keeps createServiceRoleClient', (rel, name) => {
    const body = handler(rel, name)
    expect(body).toContain('createServiceRoleClient()')
    expect(body).not.toContain('getLearnerDbForRequest')
  })
})

describe('unsafe reads stay on the service role', () => {
  it('referrals GET keeps the service role: it reads referred users rows and the settings-backed reward', () => {
    const get = handler('app/api/referrals/route.ts', 'GET')
    expect(get).toContain('createServiceRoleClient()')
    expect(get).toContain('getUserReferralStats(supabase,')
    expect(get).not.toContain('getLearnerDbForRequest')
  })
})
