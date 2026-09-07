/**
 * Coverage for the structured error taxonomy (audit §F3, B4, B14, B15).
 *
 * Three properties matter operationally and are asserted here:
 *   1. Severity is DERIVED from the failure kind, so it is consistent across every
 *      call site and therefore actually filterable.
 *   2. Credentials never reach persisted output — including Brevo's `xkeysib-`, which
 *      the original sanitizer had no rule for, and nested `details` values, which were
 *      written to the database completely raw.
 *   3. Repeats of one incident share a fingerprint, so a sustained outage collapses
 *      into a counted incident instead of an alert storm.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'

import {
  deriveSeverity,
  deriveRetryability,
  classifyProviderFailureKind,
  resolveErrorReport,
  categoryForReport,
  defaultNextAction,
  type FailureKind,
} from '../monitoring/error-taxonomy'

import {
  sanitizeErrorMessage,
  sanitizeDetails,
  stabilizeForFingerprint,
  logErrorReport,
  logSystemError,
} from '../monitoring/logger'

// ─── Severity derivation ──────────────────────────────────────────────────────

describe('error taxonomy — severity is derived from failure kind', () => {
  it('treats provider capacity exhaustion as critical — it stops mail until a human acts', () => {
    expect(deriveSeverity('provider_quota')).toBe('critical')
  })

  it('treats a single provider outage or timeout as a warning, since failover covers it', () => {
    expect(deriveSeverity('provider_outage')).toBe('warning')
    expect(deriveSeverity('provider_timeout')).toBe('warning')
  })

  it('escalates an outage to critical once EVERY provider has failed', () => {
    expect(deriveSeverity('provider_outage', { allProvidersFailed: true })).toBe('critical')
    expect(deriveSeverity('provider_timeout', { allProvidersFailed: true })).toBe('critical')
  })

  it('does not escalate kinds where a second provider would not have helped', () => {
    expect(deriveSeverity('provider_rejected', { allProvidersFailed: true })).toBe('error')
    expect(deriveSeverity('validation', { allProvidersFailed: true })).toBe('error')
  })

  it('treats missing configuration and an unreachable database as critical', () => {
    expect(deriveSeverity('config_missing')).toBe('critical')
    expect(deriveSeverity('db_unavailable')).toBe('critical')
  })

  it('assigns a severity and an action to every declared kind', () => {
    const kinds: FailureKind[] = [
      'provider_quota', 'provider_outage', 'provider_timeout', 'provider_rejected',
      'config_missing', 'auth_failed', 'db_unavailable', 'validation', 'unexpected',
    ]
    for (const kind of kinds) {
      expect(['critical', 'error', 'warning']).toContain(deriveSeverity(kind))
      expect(['auto_retrying', 'manual_retry', 'terminal']).toContain(deriveRetryability(kind))
      expect(defaultNextAction(kind).length).toBeGreaterThan(10)
    }
  })

  it('resolves a report without requiring the caller to pass a severity', () => {
    const resolved = resolveErrorReport({
      domain: 'email',
      kind: 'provider_quota',
      operation: 'email.provider_send',
      summary: 'Brevo rejected an email send',
    })
    expect(resolved.severity).toBe('critical')
    expect(resolved.retryability).toBe('terminal')
    expect(resolved.nextAction).toContain('capacity')
  })

  it('lets a call site override retryability and next action but never severity', () => {
    const resolved = resolveErrorReport({
      domain: 'queue',
      kind: 'provider_rejected',
      operation: 'queue.dead_letter',
      summary: 'Queued email exhausted its retries and was dead-lettered',
      retryability: 'manual_retry',
      nextAction: 'Requeue from the admin console.',
    })
    expect(resolved.retryability).toBe('manual_retry')
    expect(resolved.nextAction).toBe('Requeue from the admin console.')
    expect(resolved.severity).toBe('error')
    expect('severity' in ({} as Record<string, unknown>)).toBe(false)
  })
})

describe('error taxonomy — provider status classification', () => {
  it.each([
    [402, 'provider_quota'],
    [429, 'provider_quota'],
    [408, 'provider_timeout'],
    [504, 'provider_timeout'],
    [401, 'config_missing'],
    [403, 'config_missing'],
    [400, 'provider_rejected'],
    [422, 'provider_rejected'],
    [500, 'provider_outage'],
    [503, 'provider_outage'],
  ])('maps HTTP %i to %s', (status, expected) => {
    expect(classifyProviderFailureKind(status as number)).toBe(expected)
  })

  it('treats a request that never reached the provider as an outage', () => {
    expect(classifyProviderFailureKind(undefined)).toBe('provider_outage')
  })

  it('prefers an explicit timeout signal over the status code', () => {
    expect(classifyProviderFailureKind(500, true)).toBe('provider_timeout')
  })
})

describe('error taxonomy — legacy category mapping', () => {
  it('reports the provider name for email failures so existing admin filters keep working', () => {
    expect(categoryForReport({ domain: 'email', provider: { name: 'brevo' } })).toBe('brevo')
    expect(categoryForReport({ domain: 'email', provider: { name: 'resend' } })).toBe('resend')
  })

  it('falls back to the domain when there is no provider', () => {
    expect(categoryForReport({ domain: 'queue' })).toBe('queue')
    expect(categoryForReport({ domain: 'email' })).toBe('email')
  })
})

// ─── Redaction ────────────────────────────────────────────────────────────────

describe('sanitization — credentials never reach persisted output', () => {
  it('redacts Brevo API and SMTP keys', () => {
    // The original sanitizer had no xkeysib- rule, so Brevo — the PRIMARY provider —
    // could persist a live key into system_errors for every admin to read.
    const out = sanitizeErrorMessage('auth failed for xkeysib-abc123DEF456-xyz789 on send')
    expect(out).not.toContain('abc123DEF456')
    expect(out).toContain('xkeysib-[REDACTED]')

    const smtp = sanitizeErrorMessage('smtp key xsmtpsib-9f8e7d6c5b4a-QQ used')
    expect(smtp).not.toContain('9f8e7d6c5b4a')
    expect(smtp).toContain('xsmtpsib-[REDACTED]')
  })

  it('still redacts the previously covered secret shapes', () => {
    expect(sanitizeErrorMessage('Authorization: Bearer abc.def.ghi')).toContain('[REDACTED]')
    expect(sanitizeErrorMessage('re_live_9aBcD')).toContain('re_[REDACTED]')
    expect(sanitizeErrorMessage('whsec_AbCd1234')).toContain('whsec_[REDACTED]')
  })

  it('redacts JWTs, which is the shape of a Supabase service-role key', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.s1gnatureV4lu3'
    expect(sanitizeErrorMessage(`connect failed with ${jwt}`)).not.toContain('s1gnatureV4lu3')
  })

  it('sanitizes nested details values, which were previously written raw', () => {
    const cleaned = sanitizeDetails({
      providerMessage: 'rejected key xkeysib-SECRETKEY123',
      nested: { headers: ['Bearer topsecrettoken', 'ok'] },
      status: 402,
      flag: true,
    }) as Record<string, unknown>

    expect(JSON.stringify(cleaned)).not.toContain('SECRETKEY123')
    expect(JSON.stringify(cleaned)).not.toContain('topsecrettoken')
    // Non-sensitive values survive untouched.
    expect(cleaned.status).toBe(402)
    expect(cleaned.flag).toBe(true)
  })

  it('does not recurse without bound on a cyclic details object', () => {
    const cyclic: Record<string, unknown> = { name: 'root' }
    cyclic.self = cyclic
    expect(() => sanitizeDetails(cyclic)).not.toThrow()
  })
})

// ─── Fingerprint stability ────────────────────────────────────────────────────

describe('fingerprint stability — one incident, not one per occurrence', () => {
  it('collapses uuids, emails, timestamps and long numbers', () => {
    const a = stabilizeForFingerprint(
      'send failed for 6f1c2f28-6a1e-4a1a-9c1d-2b7e4d5a6c7f to learner@example.com at 2026-09-08T01:02:03Z'
    )
    const b = stabilizeForFingerprint(
      'send failed for 11111111-2222-4333-8444-555555555555 to other@example.org at 2026-09-08T09:10:11Z'
    )
    expect(a).toBe(b)
  })

  it('keeps genuinely different failures distinct', () => {
    expect(stabilizeForFingerprint('Brevo rejected an email send')).not.toBe(
      stabilizeForFingerprint('Resend rejected an email send')
    )
  })
})

// ─── Deduplication & alert-storm control ──────────────────────────────────────

interface FakeRow {
  id: string
  fingerprint: string
  occurrence_count: number
  timestamp: string
}

/**
 * Fake `system_errors` table that supports the dedup lookup, insert and update.
 *
 * Deliberately returns MULTIPLE matching rows for the same fingerprint — that is the
 * exact condition that broke the previous `.maybeSingle()` lookup, which PostgREST
 * answers with an error and null data.
 */
function buildFakeSupabase(seed: FakeRow[] = [], matchAnyFingerprint = false) {
  const rows: FakeRow[] = [...seed]
  const inserted: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  const notifications: Record<string, unknown>[] = []

  const selectBuilder = (table: string) => {
    const filters: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    const chain = () => builder

    builder.select = chain
    builder.eq = (col: string, val: unknown) => {
      filters[col] = val
      return builder
    }
    builder.neq = (col: string, val: unknown) => {
      filters[`neq_${col}`] = val
      return builder
    }
    builder.gte = chain
    builder.order = chain
    builder.limit = async (n: number) => {
      if (table !== 'system_errors') return { data: [], error: null }
      let matched = rows.filter(
        (r) => matchAnyFingerprint || !filters.fingerprint || r.fingerprint === filters.fingerprint
      )
      if (filters.neq_id) matched = matched.filter((r) => r.id !== filters.neq_id)
      return { data: matched.slice(0, n), error: null }
    }
    builder.maybeSingle = async () => ({ data: null, error: null })
    return builder
  }

  const from = (table: string) => ({
    ...selectBuilder(table),
    insert: (payload: Record<string, unknown>) => {
      if (table === 'system_errors') {
        const row: FakeRow = {
          id: `err-${rows.length + 1}`,
          fingerprint: String(payload.fingerprint),
          occurrence_count: Number(payload.occurrence_count ?? 1),
          timestamp: new Date().toISOString(),
        }
        rows.push(row)
        inserted.push(payload)
        return {
          select: () => ({ maybeSingle: async () => ({ data: { id: row.id }, error: null }) }),
        }
      }
      if (table === 'in_app_notifications') notifications.push(payload)
      return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }
    },
    update: (payload: Record<string, unknown>) => ({
      eq: async (_c: string, id: string) => {
        updates.push({ id, ...payload })
        const row = rows.find((r) => r.id === id)
        if (row && typeof payload.occurrence_count === 'number') {
          row.occurrence_count = payload.occurrence_count
        }
        return { data: null, error: null }
      },
    }),
  })

  return {
    client: { from, rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient<Database>,
    rows,
    inserted,
    updates,
    notifications,
  }
}

describe('logSystemError deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a new incident the first time a fingerprint is seen', async () => {
    const fake = buildFakeSupabase()
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake.client)

    const id = await logErrorReport({
      domain: 'email',
      kind: 'provider_outage',
      operation: 'email.provider_send',
      summary: 'Brevo API was unreachable',
    })

    expect(id).toBe('err-1')
    expect(fake.inserted).toHaveLength(1)
    expect(fake.inserted[0].occurrence_count).toBe(1)
    expect(fake.inserted[0].kind).toBe('provider_outage')
    expect(fake.inserted[0].domain).toBe('email')
    expect(fake.inserted[0].severity).toBe('warning')
  })

  it('increments occurrence_count instead of inserting a duplicate', async () => {
    const fake = buildFakeSupabase()
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake.client)

    const report = {
      domain: 'email' as const,
      kind: 'provider_outage' as const,
      operation: 'email.provider_send',
      summary: 'Brevo API was unreachable',
    }

    await logErrorReport(report)
    await logErrorReport(report)
    await logErrorReport(report)

    expect(fake.inserted).toHaveLength(1)
    expect(fake.rows[0].occurrence_count).toBe(3)
  })

  it('survives MULTIPLE pre-existing rows sharing a fingerprint', async () => {
    // The regression: `.maybeSingle()` on a multi-row match returns an error and null
    // data, so dedup silently stopped working from the second occurrence onward —
    // precisely during the sustained outages it exists for.
    const now = new Date().toISOString()
    // `matchAnyFingerprint` makes both seeded rows answer the dedup lookup, modelling
    // a fingerprint that already has several rows inside the window.
    const fake = buildFakeSupabase(
      [
        { id: 'existing-1', fingerprint: 'seeded', occurrence_count: 4, timestamp: now },
        { id: 'existing-2', fingerprint: 'seeded', occurrence_count: 2, timestamp: now },
      ],
      true
    )
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake.client)

    await logErrorReport({
      domain: 'email',
      kind: 'provider_outage',
      operation: 'email.provider_send',
      summary: 'Brevo API was unreachable',
    })

    expect(fake.inserted).toHaveLength(0)
    expect(fake.updates).toHaveLength(1)
    expect(fake.updates[0].occurrence_count).toBe(5)
  })

  it('gives repeated legacy messages carrying different ids one shared fingerprint', async () => {
    const fake = buildFakeSupabase()
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake.client)

    await logSystemError({
      severity: 'error',
      category: 'queue',
      operation: 'dead_letter_drop',
      message: 'Failed for 6f1c2f28-6a1e-4a1a-9c1d-2b7e4d5a6c7f',
    })
    await logSystemError({
      severity: 'error',
      category: 'queue',
      operation: 'dead_letter_drop',
      message: 'Failed for 11111111-2222-4333-8444-555555555555',
    })

    expect(fake.inserted).toHaveLength(1)
    expect(fake.rows[0].occurrence_count).toBe(2)
  })

  it('persists sanitized details rather than the raw payload', async () => {
    const fake = buildFakeSupabase()
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake.client)

    await logErrorReport({
      domain: 'email',
      kind: 'provider_quota',
      operation: 'email.provider_send',
      summary: 'Brevo rejected an email send',
      provider: { name: 'brevo', statusCode: 402 },
      details: { providerMessage: 'key xkeysib-LEAKEDKEY99 exhausted' },
    })

    expect(JSON.stringify(fake.inserted[0].details)).not.toContain('LEAKEDKEY99')
    expect(fake.inserted[0].category).toBe('brevo')
    expect(fake.inserted[0].severity).toBe('critical')
    expect(fake.inserted[0].next_action).toBeTruthy()
  })
})
