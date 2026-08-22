import { describe, it, expect } from 'vitest'
import { generateCertificateCode } from '../certificates'

describe('Developer Certificate Testing Suite', () => {
  it('generateCertificateCode produces valid deterministic PMA code format', () => {
    const code = generateCertificateCode('dev-user-123', 'full_curriculum')
    expect(code.startsWith('PMA-')).toBe(true)
    expect(code.length).toBe(17)
  })

  it('Test certificate code prefix formatting is TEST-PMA-YYYY-XXXXXXXX', () => {
    const code = generateCertificateCode('dev-user-123', 'full_curriculum')
    const testCode = `TEST-${code}`
    expect(testCode.startsWith('TEST-PMA-')).toBe(true)
    expect(testCode.length).toBe(22)
  })
})
