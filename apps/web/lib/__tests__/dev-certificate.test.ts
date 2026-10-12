import { describe, it, expect } from 'vitest'
import { generateCertificateCode } from '../certificates'
import { buildTestCertificateCode, isTestCertificateCode } from '../certificates-db'

describe('Developer Certificate Testing Suite', () => {
  it('generateCertificateCode produces valid deterministic PMA code format', () => {
    const code = generateCertificateCode('dev-user-123', 'full_curriculum')
    expect(code.startsWith('PMA-')).toBe(true)
    expect(code.length).toBe(17)
  })

  it('Test certificate code format is TEST-PMA-YYYY-XXXXXXXX-XXXXXX', () => {
    const code = generateCertificateCode('dev-user-123', 'full_curriculum')
    const testCode = buildTestCertificateCode('dev-user-123', 'full_curriculum')
    expect(testCode.startsWith(`TEST-${code}-`)).toBe(true)
    expect(testCode).toMatch(/^TEST-PMA-\d{4}-[A-F0-9]{8}-[A-F0-9]{6}$/)
    expect(testCode.length).toBe(29)
    expect(isTestCertificateCode(testCode)).toBe(true)
    expect(isTestCertificateCode(code)).toBe(false)
  })

  it('every test certificate code is unique, so dev runs never collide or share an email key', () => {
    const codes = new Set(Array.from({ length: 20 }, () => buildTestCertificateCode('dev-user-123', 'full_curriculum')))
    expect(codes.size).toBe(20)
  })
})
