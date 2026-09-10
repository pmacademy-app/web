import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'

import {
  logErrorReport,
  logSystemError,
  isTestEnvironment,
} from '../monitoring/logger'

describe('Test Telemetry Isolation — Pre-B3 Hygiene Invariant', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('correctly detects automated test execution environment', () => {
    expect(isTestEnvironment()).toBe(true)
  })

  it('prevents unmocked logErrorReport from calling Supabase or writing to production', async () => {
    // We intentionally DO NOT mock createServiceRoleClient here.
    // In unmocked test mode, it must return a synthetic incident ID without calling DB.
    const incidentId = await logErrorReport({
      domain: 'email',
      kind: 'provider_quota',
      operation: 'test.unmocked_quota_check',
      summary: 'Synthetic test quota error',
      provider: { name: 'brevo', statusCode: 402 },
      details: { fakeSecret: 'xkeysib-FAKEKEY123' },
    })

    expect(typeof incidentId).toBe('string')
    expect(incidentId).toMatch(/^test_incident_[0-9a-f]{16}$/)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('prevents unmocked logSystemError from calling Supabase or writing to production', async () => {
    const incidentId = await logSystemError({
      severity: 'critical',
      category: 'resend',
      operation: 'test.unmocked_direct_error',
      message: 'Synthetic unmocked direct send failure',
      details: { fakeSecret: 're_FakeResendKey123' },
    })

    expect(typeof incidentId).toBe('string')
    expect(incidentId).toMatch(/^test_incident_[0-9a-f]{16}$/)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('allows tests with explicit createServiceRoleClient mocks to test persistence logic', async () => {
    const insertedRows: Record<string, unknown>[] = []
    const fakeClient = {
      from: vi.fn((table: string) => {
        if (table === 'system_errors') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn((payload: Record<string, unknown>) => {
              insertedRows.push(payload)
              return {
                select: () => ({
                  maybeSingle: async () => ({ data: { id: 'mock-incident-id-123' }, error: null }),
                }),
              }
            }),
          }
        }
        return { select: vi.fn().mockReturnThis() }
      }),
    } as unknown as SupabaseClient<Database>

    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeClient)

    const incidentId = await logErrorReport({
      domain: 'auth',
      kind: 'auth_failed',
      operation: 'test.mocked_auth_check',
      summary: 'Synthetic mocked auth check',
    })

    expect(incidentId).toBe('mock-incident-id-123')
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0].operation).toBe('test.mocked_auth_check')
    expect(insertedRows[0].kind).toBe('auth_failed')
    expect(insertedRows[0].domain).toBe('auth')
  })

  it('keeps redaction active during test runs', async () => {
    await logErrorReport({
      domain: 'email',
      kind: 'provider_quota',
      operation: 'test.redaction_test',
      summary: 'Brevo failed using key xkeysib-SECRETKEY999 for test@example.com',
    })

    const loggedMessages = consoleErrorSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n')
    expect(loggedMessages).not.toContain('SECRETKEY999')
    expect(loggedMessages).toContain('xkeysib-[REDACTED]')
  })
})
