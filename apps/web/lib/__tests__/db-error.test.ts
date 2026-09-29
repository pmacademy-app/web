import { describe, it, expect } from 'vitest'
import { describeDbError } from '@/lib/monitoring/db-error'

describe('describeDbError — structured, redacted DB error serialization', () => {
  it('extracts message/code/details/hint from a PostgREST-shaped rejection (never "[object Object]")', () => {
    // This is the exact shape postgrest-js rejects with — a plain object, not an Error.
    const pgErr = {
      message: 'relation "rate_limits" does not exist',
      code: '42P01',
      details: 'the migration has not been applied',
      hint: 'run the latest migration',
    }

    const described = describeDbError(pgErr)

    expect(described.message).toContain('does not exist')
    expect(described.code).toBe('42P01')
    expect(described.details).toContain('migration')
    expect(described.hint).toContain('migration')
    // The regression: String({...}) used to be logged.
    expect(JSON.stringify(described)).not.toContain('[object Object]')
  })

  it('handles a native Error, keeping message and any syscall code', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    const described = describeDbError(err)

    expect(described.message).toBe('socket hang up')
    expect(described.code).toBe('ECONNRESET')
  })

  it('redacts secrets and email addresses out of the fields', () => {
    const pgErr = { message: 'failed sending to learner@example.com with key xkeysib-abc123def456' }
    const described = describeDbError(pgErr)

    expect(described.message).not.toContain('learner@example.com')
    expect(described.message).not.toContain('xkeysib-abc123def456')
  })

  it('never throws on odd inputs', () => {
    expect(describeDbError(null).message).toBeDefined()
    expect(describeDbError(undefined).message).toBeDefined()
    expect(describeDbError('plain string').message).toContain('plain string')
    expect(describeDbError(42).message).toBe('42')
  })
})
