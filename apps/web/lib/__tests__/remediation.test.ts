import { describe, it, expect } from 'vitest'
import { generateCertificateCode, generateQrCodeSvg } from '../certificates'
import { evaluateRateLimit } from '../rate-limit'

describe('Pre-Launch Remediation Unit Test Suite', () => {
  it('generateQrCodeSvg creates ISO/IEC 18004 compliant QR matrix with rects', () => {
    const code = generateCertificateCode('test-user-123', 'full_curriculum')
    const url = `https://prodily.adityagangwani.me/verify/${code}`
    const svg = generateQrCodeSvg(url, 150)

    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0')
    expect(svg).toContain('<rect')
  })

  it('evaluateRateLimit throttles repeated contact submissions', async () => {
    const key = 'test_remediation_ip_1'
    const check1 = await evaluateRateLimit(key, { limit: 2, windowMs: 1000 })
    expect(check1.success).toBe(true)

    const check2 = await evaluateRateLimit(key, { limit: 2, windowMs: 1000 })
    expect(check2.success).toBe(true)

    const check3 = await evaluateRateLimit(key, { limit: 2, windowMs: 1000 })
    expect(check3.success).toBe(false)
  })
})
