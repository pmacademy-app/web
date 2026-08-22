import { describe, it, expect } from 'vitest'
import {
  generateCertificateCode,
  generateCredentialJsonLd,
  generateQrCodeSvg,
} from '../certificates'
import { buildLinkedInCertificationUrl } from '../certificates/linkedin-url'

describe('Certificates & Credentials System 2.0 Unit Test Suite', () => {
  describe('Certificate Code Generation', () => {
    it('generateCertificateCode formats clean code with PMA prefix and year', () => {
      const code = generateCertificateCode('user-123-abc', 'full_curriculum')
      const year = new Date().getFullYear()

      expect(code.startsWith(`PMA-${year}-`)).toBe(true)
      expect(code.length).toBe(17)
    })

    it('generateCertificateCode is deterministic for identical inputs', () => {
      const code1 = generateCertificateCode('user-999', 'full_curriculum')
      const code2 = generateCertificateCode('user-999', 'full_curriculum')

      expect(code1).toBe(code2)
    })
  })

  describe('Credential JSON-LD Schema', () => {
    it('generateCredentialJsonLd generates valid schema.org EducationalOccupationalCredential', () => {
      const jsonLd = generateCredentialJsonLd({
        certificateCode: 'PMA-2026-A1B2C3D4',
        learnerName: 'Sarah Connor',
        careerTitle: 'Senior Product Manager',
        issuedAt: '2026-08-05T00:00:00Z',
        verificationUrl: 'https://prodily.adityagangwani.me/verify/PMA-2026-A1B2C3D4',
        portfolioUrl: 'https://prodily.adityagangwani.me/p/sconnor',
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(jsonLd['@context']).toBe('https://schema.org')
      expect(jsonLd['@type']).toBe('EducationalOccupationalCredential')
      expect(jsonLd.identifier).toBe('PMA-2026-A1B2C3D4')
      expect((jsonLd.grantee as { name: string }).name).toBe('Sarah Connor')
      expect(jsonLd.url).toBe('https://prodily.adityagangwani.me/verify/PMA-2026-A1B2C3D4')
    })
  })

  describe('QR Code SVG Generator', () => {
    it('generateQrCodeSvg outputs clean SVG vector markup containing rectangles for verification URL', () => {
      const verifyUrl = 'https://prodily.adityagangwani.me/verify/PMA-2026-A1B2C3D4'
      const svg = generateQrCodeSvg(verifyUrl, 100)

      expect(svg).toContain('<svg')
      expect(svg).toContain('<rect')
      expect(svg).toContain('viewBox="0 0')
    })
  })

  describe('LinkedIn Certification Add-to-Profile URL Builder', () => {
    it('buildLinkedInCertificationUrl constructs valid LinkedIn add-to-profile URL with full parameters', () => {
      const certCode = 'PMA-2026-B87F129C'
      const verifyUrl = 'https://prodily.adityagangwani.me/verify/PMA-2026-B87F129C'
      const issuedAt = '2026-08-08T00:00:00.000Z'

      const linkedinUrl = buildLinkedInCertificationUrl({
        certificateCode: certCode,
        careerTitle: 'Principal Product Manager',
        type: 'full_curriculum',
        issuedAt,
        verificationUrl: verifyUrl,
      })

      expect(linkedinUrl.startsWith('https://www.linkedin.com/profile/add')).toBe(true)
      expect(linkedinUrl).toContain('startTask=CERTIFICATION_NAME')
      expect(linkedinUrl).toContain('organizationName=Prodily')
      expect(linkedinUrl).toContain('certId=PMA-2026-B87F129C')
      expect(linkedinUrl).toContain('issueYear=2026')
      expect(linkedinUrl).toContain('issueMonth=8')
      expect(linkedinUrl).toContain(encodeURIComponent(verifyUrl))
    })
  })
})
