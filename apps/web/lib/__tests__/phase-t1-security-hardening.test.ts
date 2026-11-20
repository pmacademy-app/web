import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { issueCertificate } from '../certificates/certificates-db'
import { getLessonIdsForModule } from '../curriculum-registry'

// Mock external auth and database dependencies for route execution
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
}))

// ─── T1.1: Certificate Prerequisites & Integrity Tests ───────────────────────

describe('T1.1 — Certificate Security & Prerequisite Integrity', () => {
  const mockUserId = 'usr-cert-tester-1'

  it('rejects full curriculum certificate issuance when learner has < 90 lessons', async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: mockUserId, name: 'Alice Learner', total_xp: 500 }, error: null }),
              }),
            }),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => {
                  const partialLessons = Array.from({ length: 45 }, (_, i) => ({ lesson_id: `les_mock_${i}` }))
                  return Promise.resolve({ data: partialLessons, error: null })
                },
              }),
            }),
          }
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }
      },
    } as unknown as SupabaseClient<Database>

    await expect(issueCertificate(mockSupabase, mockUserId, 'full_curriculum')).rejects.toThrow(
      'Full curriculum completion certificate requires completing all 90 lessons'
    )
  })

  it('allows full curriculum certificate issuance when learner has completed all 90 lessons', async () => {
    let insertedRow: Record<string, unknown> | null = null

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: mockUserId, name: 'Alice Learner', total_xp: 4500 }, error: null }),
              }),
            }),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => {
                  const all90 = Array.from({ length: 90 }, (_, i) => ({ lesson_id: `les_mock_${i}` }))
                  return Promise.resolve({ data: all90, error: null })
                },
              }),
            }),
          }
        }
        if (table === 'certificates') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
            insert: (payload: Record<string, unknown>) => {
              insertedRow = { id: 'cert-new-1', ...payload }
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: insertedRow, error: null }),
                }),
              }
            },
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    } as unknown as SupabaseClient<Database>

    const cert = await issueCertificate(mockSupabase, mockUserId, 'full_curriculum')
    expect(cert).toBeDefined()
    expect(cert.lessons_completed).toBe(90)
    expect(cert.type).toBe('full_curriculum')
    expect(cert.certificate_code).toMatch(/^PMA-\d{4}-[A-F0-9]{8}$/)
  })

  it('rejects module certificate issuance when not all lessons in the module are completed', async () => {
    const foundationsLessons = getLessonIdsForModule('foundations')
    expect(foundationsLessons.length).toBe(10)

    // Only 8 of 10 completed
    const partialFoundations = foundationsLessons.slice(0, 8).map((id) => ({ lesson_id: id }))

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: mockUserId, name: 'Alice Learner', total_xp: 400 }, error: null }),
              }),
            }),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: partialFoundations, error: null }),
              }),
            }),
          }
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }
      },
    } as unknown as SupabaseClient<Database>

    await expect(
      issueCertificate(mockSupabase, mockUserId, 'module_completion', 'foundations')
    ).rejects.toThrow('Module completion certificate requires completing all 10 lessons in this module')
  })

  it('allows module certificate issuance when all lessons in the module are completed', async () => {
    const foundationsLessons = getLessonIdsForModule('foundations')
    const completedFoundations = foundationsLessons.map((id) => ({ lesson_id: id }))
    let insertedRow: Record<string, unknown> | null = null

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: mockUserId, name: 'Alice Learner', total_xp: 500 }, error: null }),
              }),
            }),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: completedFoundations, error: null }),
              }),
            }),
          }
        }
        if (table === 'certificates') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
            insert: (payload: Record<string, unknown>) => {
              insertedRow = { id: 'cert-mod-1', ...payload }
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: insertedRow, error: null }),
                }),
              }
            },
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    } as unknown as SupabaseClient<Database>

    const cert = await issueCertificate(mockSupabase, mockUserId, 'module_completion', 'foundations')
    expect(cert).toBeDefined()
    expect(cert.module_slug).toBe('foundations')
    expect(cert.type).toBe('module_completion')
  })

  it('rejects invalid module slugs with INVALID_MODULE', async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: mockUserId, name: 'Alice' }, error: null }),
              }),
            }),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: () => ({
              eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }
      },
    } as unknown as SupabaseClient<Database>

    await expect(
      issueCertificate(mockSupabase, mockUserId, 'module_completion', 'non_existent_module')
    ).rejects.toThrow('Invalid or unrecognized module slug')
  })

  it('is idempotent: returns existing certificate without duplicating on repeated calls', async () => {
    const existingCert = {
      id: 'cert-existing-1',
      certificate_code: 'PMA-2026-ALREADY1',
      user_id: mockUserId,
      type: 'full_curriculum',
      module_slug: null,
      lessons_completed: 90,
      learner_name: 'Alice',
      level: 1,
      career_title: 'Junior PM',
      total_xp: 4500,
      modules_completed: 9,
      issued_at: new Date().toISOString(),
    }

    const insertSpy = vi.fn()

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: mockUserId, name: 'Alice', total_xp: 4500 }, error: null }),
              }),
            }),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: Array.from({ length: 90 }, (_, i) => ({ lesson_id: `les_${i}` })), error: null }),
              }),
            }),
          }
        }
        if (table === 'certificates') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: existingCert, error: null }),
              }),
            }),
            insert: insertSpy,
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    } as unknown as SupabaseClient<Database>

    const cert = await issueCertificate(mockSupabase, mockUserId, 'full_curriculum')
    expect(cert).toEqual(existingCert)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('allows bypassPrerequisites for admin dev test certificate generator', async () => {
    let insertedRow: Record<string, unknown> | null = null

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: mockUserId, name: 'Dev Target', total_xp: 0 }, error: null }),
              }),
            }),
          }
        }
        if (table === 'user_lesson_progress') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }
        }
        if (table === 'certificates') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
            insert: (payload: Record<string, unknown>) => {
              insertedRow = { id: 'cert-test-dev', ...payload }
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: insertedRow, error: null }),
                }),
              }
            },
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    } as unknown as SupabaseClient<Database>

    const cert = await issueCertificate(mockSupabase, mockUserId, 'full_curriculum', null, { bypassPrerequisites: true })
    expect(cert).toBeDefined()
    expect(cert.id).toBe('cert-test-dev')
  })

  it('verifies that Phase T1 migration revokes direct client INSERT on public.certificates', () => {
    const migrationPath = path.resolve(__dirname, '../../../../supabase/migrations/20260925000001_phase_t1_security_hardening.sql')
    expect(fs.existsSync(migrationPath)).toBe(true)

    const sql = fs.readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can insert own certificates" ON public.certificates')
    expect(sql).toContain('ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY')
  })
})

// ─── T1.3: Scalable Login Resolution Tests ───────────────────────────────────

describe('T1.3 — Login Unconfirmed User Resolution & Scalability', () => {
  it('verifies that login route does not scan listUsers({ perPage: 1000 }) into memory', () => {
    const loginSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/auth/login/route.ts'),
      'utf8'
    )
    expect(loginSrc).not.toContain('listUsers({ page: 1, perPage: 1000 })')
    expect(loginSrc).toContain('get_auth_user_id_by_email')
  })

  it('verifies get_auth_user_id_by_email migration definition and security definer grants', () => {
    const migrationPath = path.resolve(__dirname, '../../../../supabase/migrations/20260925000001_phase_t1_security_hardening.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email TEXT)')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = auth, pg_temp')
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM PUBLIC')
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) FROM authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role')
  })
})

// T1.4 (update-password route error sanitization) retired with the route. The reset
// action's sanitization is covered in update-password-action.test.ts.
