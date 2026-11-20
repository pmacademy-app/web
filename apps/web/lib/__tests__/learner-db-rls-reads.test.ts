import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { cookieValue, authClient, serviceClient } = vi.hoisted(() => ({
  cookieValue: { current: undefined as string | undefined },
  authClient: vi.fn((token: string) => ({ kind: 'learner', token })),
  serviceClient: vi.fn(() => ({ kind: 'service' })),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'sb-access-token' && cookieValue.current ? { value: cookieValue.current } : undefined) }),
}))
vi.mock('@/lib/supabase', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase')>()),
  createAuthenticatedServerClient: authClient,
  createServiceRoleClient: serviceClient,
}))

import { getLearnerDb } from '@/lib/auth'

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('getLearnerDb', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the learner token so RLS applies', async () => {
    cookieValue.current = 'tok-123'
    expect(await getLearnerDb()).toEqual({ kind: 'learner', token: 'tok-123' })
    expect(serviceClient).not.toHaveBeenCalled()
  })

  it('falls back to the service role only when there is no token', async () => {
    cookieValue.current = undefined
    expect(await getLearnerDb()).toEqual({ kind: 'service' })
  })
})

describe('learner pages read their own progress under RLS', () => {
  const PAGES = [
    'app/(app)/progress/metrics/page.tsx',
    'app/(app)/progress/milestones/page.tsx',
    'app/(app)/progress/radar/page.tsx',
    'app/(app)/progress/certificates/page.tsx',
    'app/(app)/academy/page.tsx',
    'app/(app)/academy/[moduleSlug]/[lessonId]/page.tsx',
  ]

  it.each(PAGES)('%s reads user_lesson_progress through getLearnerDb', (page) => {
    const src = read(page).replace(/\r\n/g, '\n')
    expect(src).toContain('await getLearnerDb()')
    expect(src).toMatch(/learnerDb\n\s*\.from\('user_lesson_progress'\)/)
    expect(src).not.toMatch(/(?:supabase|serviceSupabase)\n\s*\.from\('user_lesson_progress'\)/)
  })
})
