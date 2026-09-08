/**
 * Security gate: representative secrets must be redacted BEFORE they reach a console,
 * `system_errors`, a dead-letter record, or an API response body.
 *
 * These are abuse cases, not happy paths. Each one is a concrete credential that, if
 * persisted, grants an attacker something specific:
 *   - Supabase service-role JWT  → full database access
 *   - password-reset token_hash  → account takeover
 *   - session access/refresh     → session hijack
 *   - Brevo / Resend API key     → send mail as the brand
 *   - webhook signing secret     → forge provider callbacks
 *
 * IMPORTANT — fixture design rule:
 *   All values here are structurally valid (so the redaction regex can match them) but
 *   are deliberately constructed to be obviously synthetic and non-functional:
 *   - Hex segments use only the nybble `a`–`f` runs that form no real key fingerprint
 *   - JWT payloads decode to a minimal `{"role":"test"}` stub — not a valid Supabase claim
 *   - Passwords are dictionary words separated by `_test_` markers
 *   - All domain names use `.example.invalid` (RFC 2606 reserved — no real host)
 *   Values that trigger GitHub secret-scanning (whsec_, xkeysib-, re_) are intentionally
 *   kept structurally correct so the tests exercise the actual matching rules, but the
 *   material after the prefix is composed of obviously non-random TEST_PLACEHOLDER text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'

import {
  sanitizeErrorMessage,
  sanitizeStructuredPayload,
  maskEmailAddress,
  maskEmailsInText,
} from '../monitoring/redaction'
import { logErrorReport, logSystemError } from '../monitoring/logger'
import { apiError, apiInternalError } from '../errors/api-response'

/**
 * Structurally valid but obviously synthetic test fixtures.
 * None of these values are real credentials. All prefixes match the redaction regexes
 * so the tests exercise genuine matching; the bodies are deliberately non-random
 * placeholder text with no cryptographic entropy.
 */
const SECRETS = {
  // xkeysib- prefix matched by redaction; body is TEST_PLACEHOLDER (not a real key)
  brevoApiKey: 'xkeysib-TEST_PLACEHOLDER_NOT_A_REAL_BREVO_KEY',
  // xsmtpsib- prefix matched by redaction; body is TEST_PLACEHOLDER
  brevoSmtpKey: 'xsmtpsib-TEST_PLACEHOLDER_NOT_A_REAL_SMTP_KEY',
  // re_ prefix matched by redaction; body is TEST_PLACEHOLDER (not a real Resend key)
  resendApiKey: 're_TestPlaceholder_NotARealResendApiKey',
  // whsec_ prefix matched by redaction; body is TEST_PLACEHOLDER (not a real webhook secret)
  webhookSecret: 'whsec_TestPlaceholderNotARealWebhookSecretXX',
  // JWT shape matched by redaction; payload decodes to {"role":"test"} — not a Supabase claim
  serviceRoleJwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoidGVzdCJ9.TestPlaceholderSignatureXXXXXXXX',
  // pkce_ shape matched by redaction; body is TEST_PLACEHOLDER (not a real token hash)
  resetTokenHash: 'pkce_test_placeholder_not_a_real_token_hash_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  // sb-access-token= matched by redaction; body is TEST_PLACEHOLDER
  accessToken: 'sb-access-token=test_placeholder_not_a_real_access_token',
  // sb-refresh-token= matched by redaction; body is TEST_PLACEHOLDER
  refreshToken: 'sb-refresh-token=test_placeholder_not_a_real_refresh_token',
  // postgres://user:password@host shape matched by redaction; domain is .example.invalid
  dbUrl: 'postgresql://postgres:test_placeholder_db_pass@db.placeholder.example.invalid:5432/postgres',
  // password= matched by redaction; value is TEST_PLACEHOLDER
  password: 'password=test_placeholder_not_a_real_password',
}

/** Fails if any secret VALUE survives into the given serialized output. */
function assertNoSecretsIn(serialized: string) {
  expect(serialized).not.toContain('TEST_PLACEHOLDER_NOT_A_REAL_BREVO_KEY')
  expect(serialized).not.toContain('TEST_PLACEHOLDER_NOT_A_REAL_SMTP_KEY')
  expect(serialized).not.toContain('TestPlaceholder_NotARealResendApiKey')
  expect(serialized).not.toContain('TestPlaceholderNotARealWebhookSecretXX')
  expect(serialized).not.toContain('TestPlaceholderSignatureXXXXXXXX')
  expect(serialized).not.toContain('test_placeholder_not_a_real_token_hash')
  expect(serialized).not.toContain('test_placeholder_db_pass')
  expect(serialized).not.toContain('test_placeholder_not_a_real_password')
}

// ─── Value-shape redaction ────────────────────────────────────────────────────

describe('redaction — provider and platform credentials', () => {
  it.each([
    ['Brevo API key', SECRETS.brevoApiKey, 'TEST_PLACEHOLDER_NOT_A_REAL_BREVO_KEY'],
    ['Brevo SMTP key', SECRETS.brevoSmtpKey, 'TEST_PLACEHOLDER_NOT_A_REAL_SMTP_KEY'],
    ['Resend API key', SECRETS.resendApiKey, 'TestPlaceholder_NotARealResendApiKey'],
    ['webhook signing secret', SECRETS.webhookSecret, 'TestPlaceholderNotARealWebhookSecretXX'],
    ['Supabase service-role JWT', SECRETS.serviceRoleJwt, 'TestPlaceholderSignatureXXXXXXXX'],
  ])('redacts a %s', (_label, secret, sensitivePart) => {
    const out = sanitizeErrorMessage(`provider call failed using ${secret} at 12:00`)
    expect(out).not.toContain(sensitivePart)
  })

  it('redacts database connection credentials while keeping the scheme visible', () => {
    const out = sanitizeErrorMessage(`connect failed: ${SECRETS.dbUrl}`)
    expect(out).not.toContain('test_placeholder_db_pass')
    expect(out).not.toContain('postgres:test_placeholder')
    // The scheme survives, so an operator still knows which dependency failed.
    expect(out).toContain('postgresql://')
  })

  it('redacts session cookies and Authorization headers', () => {
    expect(sanitizeErrorMessage(`request had ${SECRETS.accessToken}`)).not.toContain('test_placeholder_not_a_real_access_token')
    expect(sanitizeErrorMessage(`request had ${SECRETS.refreshToken}`)).not.toContain('test_placeholder_not_a_real_refresh_token')
    expect(sanitizeErrorMessage('cookie: sb-access-token=abc123; other=1')).toContain('[REDACTED]')
    expect(sanitizeErrorMessage('authorization: Basic dXNlcjpwYXNz')).not.toContain('dXNlcjpwYXNz')
  })

  it('redacts one-time auth tokens carried in callback URLs', () => {
    // A password-reset token_hash is an account-takeover credential.
    const url = `https://prodily.app/api/auth/callback?token_hash=${SECRETS.resetTokenHash}&type=recovery`
    const out = sanitizeErrorMessage(`failed to send ${url}`)
    expect(out).not.toContain(SECRETS.resetTokenHash)
    expect(out).toContain('token_hash=[REDACTED]')
  })

  it('redacts passwords in both key=value and JSON forms', () => {
    expect(sanitizeErrorMessage(SECRETS.password)).not.toContain('test_placeholder_not_a_real_password')
    expect(sanitizeErrorMessage('{"password":"test_placeholder_not_a_real_password"}')).not.toContain('test_placeholder_not_a_real_password')
  })

  it('is idempotent — re-sanitizing does not mangle an existing marker', () => {
    // Rule order matters: prefix rules run first so the marker records WHICH kind of
    // secret was present. A later generic rule must not overwrite that with a bare
    // [REDACTED], and sanitizing twice must be a no-op.
    const once = sanitizeErrorMessage(`Hook secret: ${SECRETS.webhookSecret}`)
    expect(once).toContain('whsec_[REDACTED]')
    expect(sanitizeErrorMessage(once)).toBe(once)

    const providerOnce = sanitizeErrorMessage(`api-key: ${SECRETS.brevoApiKey}`)
    expect(providerOnce).toContain('xkeysib-[REDACTED]')
    expect(sanitizeErrorMessage(providerOnce)).toBe(providerOnce)
  })

  it('leaves a non-sensitive diagnostic message untouched', () => {
    // Over-redaction destroys the diagnostics this pipeline exists for.
    const safe = 'Database query returned 0 rows for user lookup'
    expect(sanitizeErrorMessage(safe)).toBe(safe)
  })
})

describe('redaction — email PII is masked, not destroyed', () => {
  it('masks an address while preserving the domain', () => {
    expect(maskEmailAddress('jane.doe@example.com')).toBe('j***e@example.com')
    expect(maskEmailAddress('ab@example.com')).toBe('*@example.com')
  })

  it('masks addresses embedded in free text so the domain stays diagnosable', () => {
    const out = maskEmailsInText('bounce for learner.one@corp-mail.co.uk after 3 attempts')
    expect(out).not.toContain('learner.one@')
    expect(out).toContain('@corp-mail.co.uk')
  })
})

// ─── Key-name redaction (defense in depth) ────────────────────────────────────

describe('redaction — structured payloads redact by key name too', () => {
  it('redacts an opaque token that no value pattern would recognise', () => {
    // The regexes cannot recognise this shape; the key name is what saves us.
    const cleaned = sanitizeStructuredPayload({ token: 'ZmFrZS1vcGFxdWUtdG9rZW4tMTIz' }) as Record<string, unknown>
    expect(cleaned.token).toBe('[REDACTED]')
  })

  it.each([
    'password', 'access_token', 'refresh_token', 'apiKey', 'secret',
    'authorization', 'cookie', 'otp', 'service_role_key', 'connection_string',
  ])('redacts the value under a %s key', (key) => {
    const cleaned = sanitizeStructuredPayload({ [key]: 'sensitive-value-here' }) as Record<string, unknown>
    expect(cleaned[key]).toBe('[REDACTED]')
  })

  it('redacts token-bearing auth URLs by key name', () => {
    const cleaned = sanitizeStructuredPayload({
      verificationUrl: 'https://prodily.app/api/auth/callback?token_hash=abc&type=signup',
      resetUrl: 'https://prodily.app/api/auth/callback?token_hash=def&type=recovery',
    }) as Record<string, unknown>
    expect(cleaned.verificationUrl).toBe('[REDACTED]')
    expect(cleaned.resetUrl).toBe('[REDACTED]')
  })

  it('does NOT redact the safe keys operators triage by', () => {
    // Over-redaction here would strip the two fields that make an incident actionable.
    const cleaned = sanitizeStructuredPayload({
      templateKey: 'auth.password_reset',
      authAction: 'login',
      statusCode: 402,
      errorId: 'err_abc123',
      queueId: 'q-1',
      maskedEmail: 'j***e@example.com',
    }) as Record<string, unknown>

    expect(cleaned.templateKey).toBe('auth.password_reset')
    expect(cleaned.authAction).toBe('login')
    expect(cleaned.statusCode).toBe(402)
    expect(cleaned.errorId).toBe('err_abc123')
    expect(cleaned.queueId).toBe('q-1')
    expect(cleaned.maskedEmail).toBe('j***e@example.com')
  })

  it('redacts secrets nested deep inside arrays and objects', () => {
    const cleaned = sanitizeStructuredPayload({
      attempts: [
        { provider: 'brevo', error: `rejected key ${SECRETS.brevoApiKey}` },
        { provider: 'resend', headers: { authorization: `Bearer ${SECRETS.serviceRoleJwt}` } },
      ],
    })
    assertNoSecretsIn(JSON.stringify(cleaned))
  })

  it('bounds cyclic and oversized structures instead of hanging', () => {
    const cyclic: Record<string, unknown> = { name: 'root' }
    cyclic.self = cyclic
    expect(() => sanitizeStructuredPayload(cyclic)).not.toThrow()
    expect(JSON.stringify(sanitizeStructuredPayload(cyclic))).toContain('circular')

    const huge = sanitizeStructuredPayload({ blob: 'x'.repeat(10_000) }) as Record<string, string>
    expect(huge.blob.length).toBeLessThan(2_100)
  })
})

// ─── Persistence boundary ─────────────────────────────────────────────────────

function buildCapturingSupabase() {
  const inserted: Record<string, unknown>[] = []
  const chain = (): Record<string, unknown> => {
    const node: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'neq', 'order']) node[m] = () => chain()
    node.limit = async () => ({ data: [], error: null })
    node.maybeSingle = async () => ({ data: null, error: null })
    return node
  }
  const from = (table: string) => ({
    ...chain(),
    insert: (payload: Record<string, unknown>) => {
      if (table === 'system_errors') inserted.push(payload)
      return { select: () => ({ maybeSingle: async () => ({ data: { id: 'err-1' }, error: null }) }) }
    },
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })
  return { client: { from, rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient<Database>, inserted }
}

describe('persistence boundary — nothing sensitive reaches system_errors', () => {
  beforeEach(() => vi.clearAllMocks())

  it('strips every representative secret from a structured report', async () => {
    const fake = buildCapturingSupabase()
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake.client)

    await logErrorReport({
      domain: 'email',
      kind: 'provider_quota',
      operation: 'email.provider_send',
      summary: 'Brevo rejected an email send',
      subject: { templateKey: 'auth.password_reset', maskedEmail: 'j***e@example.com' },
      provider: { name: 'brevo', statusCode: 402 },
      details: {
        providerMessage: `rejected: ${SECRETS.brevoApiKey}`,
        requestHeaders: { authorization: `Bearer ${SECRETS.serviceRoleJwt}`, cookie: SECRETS.accessToken },
        resetUrl: `https://prodily.app/api/auth/callback?token_hash=${SECRETS.resetTokenHash}`,
        dbUrl: SECRETS.dbUrl,
      },
    })

    expect(fake.inserted).toHaveLength(1)
    assertNoSecretsIn(JSON.stringify(fake.inserted[0]))
    // Diagnostics survive.
    expect(fake.inserted[0].template_key).toBe('auth.password_reset')
    expect(JSON.stringify(fake.inserted[0].details)).toContain('402')
  })

  it('strips secrets from a legacy logSystemError call as well', async () => {
    const fake = buildCapturingSupabase()
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake.client)

    await logSystemError({
      severity: 'error',
      category: 'queue',
      operation: 'dead_letter_drop',
      message: `send failed using ${SECRETS.brevoApiKey} for learner@example.com`,
      details: { password: 'test_placeholder_not_a_real_password', dbUrl: SECRETS.dbUrl },
    })

    const serialized = JSON.stringify(fake.inserted[0])
    assertNoSecretsIn(serialized)
    expect(serialized).not.toContain('learner@example.com')
  })
})

// ─── API response boundary ────────────────────────────────────────────────────

describe('API response boundary — no secret can be published to a client', () => {
  it('redacts a secret even if a caller wrongly passes one as the user message', async () => {
    const res = apiError({
      status: 500,
      code: 'SERVER_ERROR',
      message: `upstream rejected ${SECRETS.brevoApiKey} via ${SECRETS.dbUrl}`,
    })
    assertNoSecretsIn(JSON.stringify(await res.json()))
  })

  it('never publishes the exception text behind an internal error', async () => {
    const res = await apiInternalError({
      cause: new Error(`connect ${SECRETS.dbUrl} rejected token_hash=${SECRETS.resetTokenHash}`),
      domain: 'auth',
      operation: 'auth.login',
      summary: 'Unexpected failure while signing a learner in',
    })
    const body = await res.json()

    assertNoSecretsIn(JSON.stringify(body))
    expect(body.errorId).toMatch(/^err_[0-9a-f]{16}$/)
  })
})
