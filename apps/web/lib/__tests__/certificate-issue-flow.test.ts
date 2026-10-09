/**
 * Growth R1 / Task 6 — one full-curriculum certificate issuance flow, dispatched once.
 *
 * Three paths can issue a full-curriculum certificate (the 90th quiz submission, the
 * learner POST route and the certificates page repair). Each must converge on the same
 * row and announce it exactly once:
 *
 * - `issueCertificateWithStatus` finds an existing non-TEST row for the same
 *   (user, type, module) even when its code was minted in an earlier year, and turns a
 *   lost insert race (23505) into "already existed" instead of ISSUE_FAILED.
 * - `certificate.generated` is dispatched only when a row was actually created, under
 *   a stable id derived from the certificate code.
 * - The certificate email carries an idempotency key, so the email_queue unique index
 *   — not a racy SELECT — decides duplicates.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

// ─── Module mocks ────────────────────────────────────────────────────────────

const { fakeHolder, enqueueSpy, createInAppSpy, authUser } = vi.hoisted(() => ({
  fakeHolder: { current: null as unknown },
  enqueueSpy: vi.fn(),
  createInAppSpy: vi.fn(),
  authUser: {
    current: {
      id: 'user-route',
      email: 'route@example.com',
      user_metadata: { full_name: 'Route Learner' },
    } as Record<string, unknown> | null,
  },
}))

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createServiceRoleClient: () => fakeHolder.current }
})

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async () => authUser.current),
}))

vi.mock('@/lib/notifications/queue/processor', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, enqueueNotificationItem: (...args: unknown[]) => enqueueSpy(...args) }
})

vi.mock('@/lib/notifications/in-app/service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createInAppNotification: (...args: unknown[]) => createInAppSpy(...args) }
})

import { issueCertificate, issueCertificateWithStatus } from '@/lib/certificates-db'
import {
  dispatchCertificateGenerated,
  issueFullCurriculumCertificateIfEligible,
} from '@/lib/certificates/issue-flow'
import { generateCertificateCode } from '@/lib/certificates'
import { getLessonIdsForModule } from '@/lib/curriculum-registry'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'
import { recordQuizAttemptAction } from '@/lib/academy/lessons-db'
import { POST as certificatesPost } from '../../app/api/certificates/route'

// ─── In-memory Supabase fake ─────────────────────────────────────────────────

type Row = Record<string, unknown>
type DbError = { code?: string; message: string } | null

interface FakeOptions {
  users?: Row[]
  progress?: Row[]
  certificates?: Row[]
  /** Called before a `certificates` insert lands; may return an error to simulate failure. */
  onCertificateInsert?: (row: Row, tables: Record<string, Row[]>) => DbError | void
  /** Called for each `certificates` read with the filtered columns; may return an error. */
  onCertificateSelect?: (filterColumns: string[]) => DbError | void
  /** Error returned by every `user_lesson_progress` read. */
  progressSelectError?: DbError
  /** `is_first_attempt` reported by the quiz-completion RPC. */
  rpcIsFirstAttempt?: boolean
}

function createFakeSupabase(options: FakeOptions = {}) {
  const tables: Record<string, Row[]> = {
    users: options.users ?? [{ id: 'user-1', name: 'Ada Learner', username: 'ada', total_xp: 4500, email: 'ada@example.com' }],
    user_lesson_progress: options.progress ?? [],
    certificates: options.certificates ?? [],
  }
  const certificateInserts: Row[] = []
  let idSeq = 0

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    const filterColumns: string[] = []
    let pendingInsert: Row | Row[] | null = null
    let isMutation = false

    async function exec(mode: 'single' | 'maybe' | 'many'): Promise<{ data: unknown; error: DbError }> {
      if (pendingInsert) {
        const rows = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert]
        if (table === 'certificates') {
          const row = rows[0]
          certificateInserts.push(row)
          const hookError = options.onCertificateInsert?.(row, tables)
          if (hookError) return { data: null, error: hookError }
          if (tables.certificates.some((c) => c.certificate_code === row.certificate_code)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          }
        }
        const inserted = rows.map((r) => ({ id: `${table}-${++idSeq}`, ...r }))
        ;(tables[table] ??= []).push(...inserted)
        return { data: mode === 'many' ? inserted : inserted[0], error: null }
      }
      if (isMutation) return { data: null, error: null }
      if (table === 'certificates') {
        const selectError = options.onCertificateSelect?.(filterColumns)
        if (selectError) return { data: null, error: selectError }
      }
      if (table === 'user_lesson_progress' && options.progressSelectError) {
        return { data: null, error: options.progressSelectError }
      }

      const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      if (mode === 'many') return { data: rows, error: null }
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }
      if (mode === 'single' && rows.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      return { data: rows[0] ?? null, error: null }
    }

    const builder: Record<string, unknown> = {
      select: () => proxy,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val)
        filterColumns.push(col)
        return proxy
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (r[col] ?? null) === val)
        return proxy
      },
      insert: (row: Row | Row[]) => {
        pendingInsert = row
        return proxy
      },
      update: () => {
        isMutation = true
        return proxy
      },
      upsert: () => {
        isMutation = true
        return proxy
      },
      single: () => exec('single'),
      maybeSingle: () => exec('maybe'),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => exec('many').then(res, rej),
    }
    // Any other chain method (order, limit, gte, in, ...) is accepted and ignored.
    const proxy: Record<string, unknown> = new Proxy(builder, {
      get(target, prop: string) {
        if (prop in target) return target[prop]
        return () => proxy
      },
    })
    return proxy
  }

  const client = {
    from: vi.fn(from),
    rpc: vi.fn(async () => ({
      data: { success: true, total_xp_awarded: 30, is_first_attempt: options.rpcIsFirstAttempt ?? true },
      error: null,
    })),
  }

  return {
    client: client as unknown as SupabaseClient<Database>,
    tables,
    certificateInserts,
  }
}

function completedLessons(n: number, userId = 'user-1'): Row[] {
  return Array.from({ length: n }, (_, i) => ({ user_id: userId, lesson_id: `les_mock_${i}`, status: 'completed' }))
}

/** All 90 real lesson ids, so module completion can be detected (fake ids belong to no module). */
function realCurriculumLessons(userId = 'user-1'): Row[] {
  const canonical = ['foundations', 'discovery', 'design', 'execution', 'growth', 'leadership', 'technical', 'strategy', 'capstone']
  return canonical.flatMap((slug) => getLessonIdsForModule(slug)).map((id) => ({ user_id: userId, lesson_id: id, status: 'completed' }))
}

function certRow(overrides: Row): Row {
  return {
    id: 'cert-existing',
    user_id: 'user-1',
    certificate_code: 'PMA-2025-OLDCODE1',
    type: 'full_curriculum',
    module_slug: null,
    learner_name: 'Ada Learner',
    level: 9,
    career_title: 'PM',
    total_xp: 4500,
    lessons_completed: 90,
    modules_completed: 9,
    issued_at: '2025-12-31T00:00:00.000Z',
    ...overrides,
  }
}

function certificateDispatches(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .map((c) => c[0] as { event: string; id: string; payload: Record<string, unknown> })
    .filter((e) => e.event === 'certificate.generated')
}

let dispatchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  enqueueSpy.mockReset().mockResolvedValue({ success: true, queueId: 'q-1' })
  createInAppSpy.mockReset().mockResolvedValue({ success: true, id: 'n-1' })
  authUser.current = { id: 'user-1', email: 'route@example.com', user_metadata: { full_name: 'Route Learner' } }
  dispatchSpy = vi
    .spyOn(globalNotificationDispatcher, 'dispatch')
    .mockResolvedValue({ dispatched: true, handlerCount: 0, errors: [] })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── issueCertificateWithStatus ──────────────────────────────────────────────

describe('issueCertificateWithStatus', () => {
  it('returns an existing non-TEST row from an earlier year without inserting', async () => {
    const existing = certRow({})
    const fake = createFakeSupabase({ progress: completedLessons(90), certificates: [existing] })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')

    expect(result.created).toBe(false)
    expect(result.certificate.id).toBe('cert-existing')
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('returns the same-year row found by its unique code without inserting', async () => {
    const code = generateCertificateCode('user-1', 'full_curriculum', null)
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      certificates: [certRow({ id: 'cert-same-year', certificate_code: code })],
    })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')

    expect(result).toMatchObject({ created: false, certificate: { id: 'cert-same-year' } })
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('ignores admin TEST- rows and inserts a real certificate', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      certificates: [certRow({ id: 'cert-test', certificate_code: 'TEST-PMA-2026-ABCDEF12' })],
    })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')

    expect(result.created).toBe(true)
    expect(result.certificate.certificate_code).toBe(generateCertificateCode('user-1', 'full_curriculum', null))
    expect(fake.certificateInserts).toHaveLength(1)
  })

  it('does not treat a module certificate as the full-curriculum one', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      certificates: [certRow({ id: 'cert-module', type: 'module_completion', module_slug: 'foundations', certificate_code: 'PMA-2026-MODULE01' })],
    })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')

    expect(result.created).toBe(true)
    expect(result.certificate.type).toBe('full_curriculum')
  })

  it('inserts a fresh certificate and reports created: true', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(90) })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')

    expect(result.created).toBe(true)
    expect(result.certificate).toMatchObject({ type: 'full_curriculum', module_slug: null, lessons_completed: 90 })
    expect(fake.certificateInserts).toHaveLength(1)
  })

  it('turns a lost insert race (23505) into the existing row with created: false', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      onCertificateInsert: (row, tables) => {
        // A concurrent request committed the same certificate between our lookup and insert.
        tables.certificates.push({ ...certRow({}), id: 'cert-winner', certificate_code: row.certificate_code })
        return { code: '23505', message: 'duplicate key value violates unique constraint "certificates_certificate_code_key"' }
      },
    })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')

    expect(result).toMatchObject({ created: false, certificate: { id: 'cert-winner' } })
  })

  it('keeps throwing ISSUE_FAILED for any other insert error', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      onCertificateInsert: () => ({ code: '42501', message: 'permission denied' }),
    })

    await expect(issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')).rejects.toMatchObject({
      code: 'ISSUE_FAILED',
    })
  })

  it('still enforces prerequisites', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(89) })

    await expect(issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')).rejects.toMatchObject({
      code: 'PREREQUISITES_NOT_MET',
    })
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('matches module certificates by module slug and normalizes the legacy "module" type', async () => {
    const foundations = getLessonIdsForModule('foundations')
    const progress = foundations.map((id) => ({ user_id: 'user-1', lesson_id: id, status: 'completed' }))
    const fake = createFakeSupabase({
      progress,
      certificates: [certRow({ id: 'cert-found', type: 'module_completion', module_slug: 'foundations', certificate_code: 'PMA-2025-FOUND001' })],
    })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'module', 'foundations')

    expect(result).toMatchObject({ created: false, certificate: { id: 'cert-found' } })
  })

  it('refuses a code owned by another learner instead of returning their certificate', async () => {
    const code = generateCertificateCode('user-1', 'full_curriculum', null)
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      certificates: [certRow({ id: 'cert-other', user_id: 'someone-else', certificate_code: code })],
    })

    await expect(issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')).rejects.toMatchObject({
      code: 'CERTIFICATE_CODE_COLLISION',
      status: 409,
    })
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('refuses a 23505 whose winning row belongs to another learner', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      onCertificateInsert: (row, tables) => {
        tables.certificates.push({ ...certRow({}), id: 'cert-other', user_id: 'someone-else', certificate_code: row.certificate_code })
        return { code: '23505', message: 'duplicate key value violates unique constraint' }
      },
    })

    const promise = issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')
    await expect(promise).rejects.toMatchObject({ code: 'CERTIFICATE_CODE_COLLISION' })
  })

  it('throws (and does not insert) when the by-code lookup fails', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      onCertificateSelect: (cols) => (cols.includes('certificate_code') ? { message: 'connection reset' } : undefined),
    })

    await expect(issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')).rejects.toThrow(
      'Certificate lookup failed.'
    )
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('throws (and does not insert) when the by-learner lookup fails', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      onCertificateSelect: (cols) =>
        cols.includes('user_id') && !cols.includes('certificate_code') ? { message: 'statement timeout' } : undefined,
    })

    await expect(issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')).rejects.toThrow(
      'Certificate lookup failed.'
    )
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('throws instead of reporting "not eligible" when the lesson progress read fails', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      progressSelectError: { message: 'statement timeout' },
    })

    const error = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum').catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Lesson progress lookup failed.')
    expect(error.code).toBeUndefined()
    expect(fake.client.from).not.toHaveBeenCalledWith('certificates')
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('still reports PREREQUISITES_NOT_MET when the progress read succeeds with no rows', async () => {
    const fake = createFakeSupabase({ progress: [] })

    await expect(issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')).rejects.toMatchObject({
      code: 'PREREQUISITES_NOT_MET',
      status: 400,
    })
  })

  it('ignores module_slug for the full-curriculum certificate', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      certificates: [certRow({ id: 'cert-blank-slug', module_slug: '' })],
    })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum', 'foundations')

    expect(result).toMatchObject({ created: false, certificate: { id: 'cert-blank-slug' } })
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('returns the oldest matching certificate when several exist', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      certificates: [
        certRow({ id: 'cert-newer', certificate_code: 'PMA-2025-NEWER001', issued_at: '2025-06-01T00:00:00.000Z' }),
        certRow({ id: 'cert-oldest', certificate_code: 'PMA-2024-OLDEST01', issued_at: '2024-03-01T00:00:00.000Z' }),
      ],
    })

    const result = await issueCertificateWithStatus(fake.client, 'user-1', 'full_curriculum')

    expect(result.certificate.id).toBe('cert-oldest')
  })

  it('issueCertificate stays a thin wrapper returning only the row', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(90), certificates: [certRow({})] })

    const cert = await issueCertificate(fake.client, 'user-1', 'full_curriculum')

    expect(cert.id).toBe('cert-existing')
  })
})

// ─── dispatchCertificateGenerated ────────────────────────────────────────────

describe('dispatchCertificateGenerated', () => {
  it('dispatches under a stable id with a normalized payload', async () => {
    const cert = certRow({ certificate_code: 'PMA-2026-ABCDEF12', type: 'full_curriculum' })

    await dispatchCertificateGenerated(cert as never, { email: 'ada@example.com', name: 'Ada' }, 'https://example.test/')

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy.mock.calls[0][0]).toMatchObject({
      id: 'certificate-generated-PMA-2026-ABCDEF12',
      event: 'certificate.generated',
      userId: 'user-1',
      userEmail: 'ada@example.com',
      userName: 'Ada',
      category: 'certificates',
      payload: {
        certificateCode: 'PMA-2026-ABCDEF12',
        certificateType: 'full_curriculum',
        learnerName: 'Ada Learner',
        verificationUrl: 'https://example.test/verify/PMA-2026-ABCDEF12',
        issuedAt: '2025-12-31T00:00:00.000Z',
      },
    })
  })

  it('never throws when the dispatcher rejects', async () => {
    dispatchSpy.mockRejectedValueOnce(new Error('dispatcher down'))

    await expect(
      dispatchCertificateGenerated(certRow({}) as never, { email: null, name: null })
    ).resolves.toBeUndefined()
  })

  it('logs the handler errors the dispatcher reports, without throwing or retrying', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    dispatchSpy.mockResolvedValueOnce({
      dispatched: true,
      handlerCount: 2,
      errors: [{ handlerId: 'email-connector', error: new Error('queue unavailable') }],
    })
    const cert = certRow({ certificate_code: 'PMA-2026-ABCDEF12' })

    await expect(
      dispatchCertificateGenerated(cert as never, { email: 'ada@example.com', name: 'Ada' })
    ).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('[certificates/issue-flow] certificate.generated handlers failed:', {
      certificateCode: 'PMA-2026-ABCDEF12',
      errors: [{ handlerId: 'email-connector', message: 'queue unavailable' }],
    })
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
  })

  it('logs nothing when every handler succeeds', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await dispatchCertificateGenerated(certRow({}) as never, { email: 'ada@example.com', name: 'Ada' })

    expect(warnSpy).not.toHaveBeenCalled()
  })
})

// ─── issueFullCurriculumCertificateIfEligible ────────────────────────────────

describe('issueFullCurriculumCertificateIfEligible', () => {
  const meta = { email: 'ada@example.com', name: 'Ada' }

  it('returns null without throwing or dispatching below 90 lessons', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(89) })

    const result = await issueFullCurriculumCertificateIfEligible(fake.client, 'user-1', meta)

    expect(result).toEqual({ certificate: null, created: false })
    expect(certificateDispatches(dispatchSpy)).toHaveLength(0)
    expect(fake.certificateInserts).toHaveLength(0)
  })

  it('issues and dispatches once with the stable id at 90 lessons', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(90) })

    const result = await issueFullCurriculumCertificateIfEligible(fake.client, 'user-1', meta)

    expect(result.created).toBe(true)
    const code = result.certificate?.certificate_code
    const events = certificateDispatches(dispatchSpy)
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe(`certificate-generated-${code}`)
    expect(events[0].payload.certificateCode).toBe(code)
    expect(events[0].payload.verificationUrl).toMatch(new RegExp(`/verify/${code}$`))
  })

  it('does not dispatch when the certificate already exists', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(90), certificates: [certRow({})] })

    const result = await issueFullCurriculumCertificateIfEligible(fake.client, 'user-1', meta)

    expect(result).toMatchObject({ created: false, certificate: { id: 'cert-existing' } })
    expect(certificateDispatches(dispatchSpy)).toHaveLength(0)
  })

  it('dispatches exactly once across repeated calls', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(90) })

    await issueFullCurriculumCertificateIfEligible(fake.client, 'user-1', meta)
    await issueFullCurriculumCertificateIfEligible(fake.client, 'user-1', meta)

    expect(certificateDispatches(dispatchSpy)).toHaveLength(1)
    expect(fake.tables.certificates).toHaveLength(1)
  })

  it('propagates a failed progress read rather than answering "not eligible yet"', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      progressSelectError: { message: 'connection reset' },
    })

    await expect(issueFullCurriculumCertificateIfEligible(fake.client, 'user-1', meta)).rejects.toThrow(
      'Lesson progress lookup failed.'
    )
    expect(certificateDispatches(dispatchSpy)).toHaveLength(0)
    expect(fake.certificateInserts).toHaveLength(0)
  })
})

// ─── POST /api/certificates ──────────────────────────────────────────────────

describe('POST /api/certificates', () => {
  function post(body: Record<string, unknown> = {}) {
    return certificatesPost(
      new Request('https://prodily.app/api/certificates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }) as never
    )
  }

  it('dispatches certificate.generated once across repeated POSTs and keeps the response shape', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(90) })
    fakeHolder.current = fake.client

    const first = await post()
    const second = await post()

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstBody = await first.json()
    const secondBody = await second.json()
    expect(firstBody.success).toBe(true)
    expect(secondBody.certificate.id).toBe(firstBody.certificate.id)

    const events = certificateDispatches(dispatchSpy)
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe(`certificate-generated-${firstBody.certificate.certificate_code}`)
    expect(events[0].payload.certificateType).toBe('full_curriculum')
  })

  it('answers a generic 5xx and announces nothing when the certificate lookup fails', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      onCertificateSelect: () => ({ message: 'connect ECONNREFUSED db.internal:5432' }),
    })
    fakeHolder.current = fake.client

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(fake.certificateInserts).toHaveLength(0)
    expect(certificateDispatches(dispatchSpy)).toHaveLength(0)
  })

  it('answers a generic 5xx, not a 400 "not eligible", when the lesson progress read fails', async () => {
    const fake = createFakeSupabase({
      progress: completedLessons(90),
      progressSelectError: { message: 'connect ECONNREFUSED db.internal:5432' },
    })
    fakeHolder.current = fake.client

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(body)).not.toContain('PREREQUISITES_NOT_MET')
    expect(fake.certificateInserts).toHaveLength(0)
    expect(certificateDispatches(dispatchSpy)).toHaveLength(0)
  })

  it('dispatches a module certificate once with the normalized type', async () => {
    const foundations = getLessonIdsForModule('foundations')
    const fake = createFakeSupabase({
      progress: foundations.map((id) => ({ user_id: 'user-1', lesson_id: id, status: 'completed' })),
    })
    fakeHolder.current = fake.client

    await post({ type: 'module', moduleSlug: 'foundations' })
    await post({ type: 'module', moduleSlug: 'foundations' })

    const events = certificateDispatches(dispatchSpy)
    expect(events).toHaveLength(1)
    expect(events[0].payload.certificateType).toBe('module_completion')
  })
})

// ─── Email connector idempotency ─────────────────────────────────────────────

describe('certificate.generated email connector', () => {
  it('enqueues the certificate email under certificate:<code>', async () => {
    dispatchSpy.mockRestore()
    initializeNotificationConnectors(true)

    await globalNotificationDispatcher.dispatch({
      id: 'certificate-generated-PMA-2026-ABCDEF12',
      event: 'certificate.generated',
      userId: 'user-1',
      userEmail: 'ada@example.com',
      userName: 'Ada',
      userTimezone: 'UTC',
      priority: 'high',
      category: 'certificates',
      occurredAt: new Date().toISOString(),
      payload: { certificateCode: 'PMA-2026-ABCDEF12', certificateType: 'full_curriculum' },
    })

    const certificateEmail = enqueueSpy.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((p) => p.templateKey === 'achievement.certificate')
    expect(certificateEmail).toMatchObject({ idempotencyKey: 'certificate:PMA-2026-ABCDEF12' })
  })
})

// ─── Lesson completion hook ──────────────────────────────────────────────────

describe('recordQuizAttemptAction full-curriculum hook', () => {
  const attempts = [{ question_id: 'q-les_04ix6b-1', selected_option: 0 }]

  it('issues and announces the certificate when the 90th lesson completes', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(90) })

    const result = await recordQuizAttemptAction(fake.client, 'user-1', 'les_04ix6b', attempts)

    expect(result.success).toBe(true)
    expect(fake.certificateInserts).toHaveLength(1)
    const events = certificateDispatches(dispatchSpy)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ userEmail: 'ada@example.com', userName: 'Ada Learner' })
  })

  it('skips the certificate queries on a resubmission (not the first attempt) past 90', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(95), rpcIsFirstAttempt: false })

    const result = await recordQuizAttemptAction(fake.client, 'user-1', 'les_04ix6b', attempts)

    expect(result.success).toBe(true)
    expect(fake.client.from).not.toHaveBeenCalledWith('certificates')
    expect(certificateDispatches(dispatchSpy)).toHaveLength(0)
  })

  it('does not attempt issuance at 89 lessons', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(89) })

    await recordQuizAttemptAction(fake.client, 'user-1', 'les_04ix6b', attempts)

    expect(fake.certificateInserts).toHaveLength(0)
    expect(fake.client.from).not.toHaveBeenCalledWith('certificates')
    expect(certificateDispatches(dispatchSpy)).toHaveLength(0)
  })

  it('a failing issuance never breaks quiz submission or the module notification', async () => {
    // Real curriculum ids, so the 90th lesson also closes its module.
    const fake = createFakeSupabase({
      progress: realCurriculumLessons(),
      onCertificateInsert: () => ({ code: '42501', message: 'permission denied' }),
    })

    const result = await recordQuizAttemptAction(fake.client, 'user-1', 'les_04ix6b', attempts)

    expect(result.success).toBe(true)
    expect(result.totalCompletedLessons).toBe(90)
    const events = dispatchSpy.mock.calls.map((c: unknown[]) => (c[0] as { event: string }).event)
    expect(events).toContain('module.completed')
    expect(events).not.toContain('certificate.generated')
  })

  it('another first-attempt completion after the certificate exists does not announce it again', async () => {
    const fake = createFakeSupabase({ progress: completedLessons(90) })

    await recordQuizAttemptAction(fake.client, 'user-1', 'les_04ix6b', attempts)
    await recordQuizAttemptAction(fake.client, 'user-1', 'les_04ix6b', attempts)

    expect(certificateDispatches(dispatchSpy)).toHaveLength(1)
    expect(fake.tables.certificates).toHaveLength(1)
  })
})

// ─── Growth R4 / A1: real module completion ──────────────────────────────────

describe('recordQuizAttemptAction module.completed hook', () => {
  const foundations = getLessonIdsForModule('foundations')
  const discovery = getLessonIdsForModule('discovery')
  const lastLesson = foundations[9]
  const attempts = [{ question_id: `q-${lastLesson}-1`, selected_option: 0 }]
  const moduleDispatches = () =>
    dispatchSpy.mock.calls
      .map((c: unknown[]) => c[0] as { id: string; event: string; payload: Record<string, unknown> })
      .filter((e: { event: string }) => e.event === 'module.completed')
  const rows = (ids: string[]) => ids.map((id) => ({ user_id: 'user-1', lesson_id: id, status: 'completed' }))

  it('fires once, with the real module name and a stable id, when the last lesson closes the module', async () => {
    const fake = createFakeSupabase({ progress: rows(foundations) })

    await recordQuizAttemptAction(fake.client, 'user-1', lastLesson, attempts)

    const events = moduleDispatches()
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('module-completed-user-1-foundations')
    expect(events[0].payload).toMatchObject({ moduleSlug: 'foundations', moduleName: 'Product Thinking Foundations' })
    expect(events[0].payload).not.toHaveProperty('xpBonusEarned')
  })

  it('does not fire on a 10th completed lesson that leaves every module open', async () => {
    const fake = createFakeSupabase({ progress: rows([...foundations.slice(0, 5), ...discovery.slice(0, 4), lastLesson]) })

    const result = await recordQuizAttemptAction(fake.client, 'user-1', lastLesson, attempts)

    expect(result.totalCompletedLessons).toBe(10)
    expect(moduleDispatches()).toHaveLength(0)
  })

  it('does not fire on a resubmission of an already completed lesson', async () => {
    const fake = createFakeSupabase({ progress: rows(foundations), rpcIsFirstAttempt: false })

    await recordQuizAttemptAction(fake.client, 'user-1', lastLesson, attempts)

    expect(moduleDispatches()).toHaveLength(0)
  })
})
