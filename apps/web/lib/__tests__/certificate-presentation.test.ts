/**
 * Admin dev TEST- certificates resolve on /verify and appear in certificate lists like
 * real ones. `lib/certificates/presentation` decides the wording for both, so a TEST row
 * is never presented as a verified credential and a real one reads exactly as it did.
 */
import { describe, it, expect } from 'vitest'
import { BRAND } from '@/lib/brand'
import { TEST_CERTIFICATE_PREFIX, generateCredentialJsonLd, isTestCertificateCode } from '@/lib/certificates'
import { buildLinkedInCertificationUrl } from '@/lib/certificates/linkedin-url'
import * as certificatesDb from '@/lib/certificates-db'
import {
  CERTIFICATE_COMPLETION_STATEMENT,
  CERTIFICATE_RECIPIENT_LEAD_IN,
  TEST_CERTIFICATE_LABEL,
  getCertificateRowCopy,
  getCertificatePresentation,
  getVerifyPageCopy,
} from '@/lib/certificates/presentation'

const REAL_CODE = 'PMA-2026-ABCDEF12'
const TEST_CODE = 'TEST-PMA-2026-ABCDEF12-9F3A1C'

const input = (certificateCode: string) => ({
  certificateCode,
  learnerName: 'Grace Grad',
  careerTitle: 'Principal PM',
  lessonsCompleted: 90,
})

describe('isTestCertificateCode', () => {
  it('recognises only the TEST- prefix', () => {
    expect(isTestCertificateCode(TEST_CODE)).toBe(true)
    expect(isTestCertificateCode(REAL_CODE)).toBe(false)
    expect(isTestCertificateCode('PMA-2026-TEST-0001')).toBe(false)
    expect(isTestCertificateCode('')).toBe(false)
  })

  it('has one definition, re-exported by certificates-db', () => {
    expect(certificatesDb.isTestCertificateCode).toBe(isTestCertificateCode)
    expect(certificatesDb.TEST_CERTIFICATE_PREFIX).toBe(TEST_CERTIFICATE_PREFIX)
  })
})

describe('getCertificatePresentation', () => {
  it('words a real certificate as a verified, shareable credential', () => {
    expect(getCertificatePresentation(REAL_CODE)).toEqual({
      isTest: false,
      statusLabel: 'Verified Credential',
      isShareableCredential: true,
    })
  })

  it('words a TEST certificate as a test, not shareable', () => {
    expect(getCertificatePresentation(TEST_CODE)).toEqual({
      isTest: true,
      statusLabel: 'Test certificate (not a valid credential)',
      isShareableCredential: false,
    })
  })
})

describe('getVerifyPageCopy', () => {
  it('keeps the real certificate metadata and footer unchanged', () => {
    expect(getVerifyPageCopy(input(REAL_CODE))).toEqual({
      isTest: false,
      statusLabel: 'Verified Credential',
      isShareableCredential: true,
      metaTitle: 'Verified Certificate: Grace Grad | Principal PM',
      metaDescription: `Official ${BRAND.fullName} Certificate of Completion for Grace Grad (Principal PM, 90 lessons completed). Certificate ID: ${REAL_CODE}.`,
      indexable: true,
      footerLine: `Official Verified Credential. ${BRAND.certificateIssuerLine}.`,
    })
  })

  it('gives a TEST certificate the test label everywhere and keeps it out of search', () => {
    const copy = getVerifyPageCopy(input(TEST_CODE))

    expect(copy.isTest).toBe(true)
    expect(copy.indexable).toBe(false)
    expect(copy.isShareableCredential).toBe(false)
    expect(copy.metaTitle).toBe(TEST_CERTIFICATE_LABEL)
    expect(copy.metaDescription.startsWith(TEST_CERTIFICATE_LABEL)).toBe(true)
    expect(copy.metaDescription).toContain(TEST_CODE)
    expect(copy.footerLine.startsWith(TEST_CERTIFICATE_LABEL)).toBe(true)
  })

  it('never claims a verified or official credential for a TEST certificate', () => {
    const copy = getVerifyPageCopy(input(TEST_CODE))

    for (const text of [copy.statusLabel, copy.metaTitle, copy.metaDescription, copy.footerLine]) {
      expect(text).not.toMatch(/verified|official|certificate of completion/i)
      expect(text).not.toContain('Grace Grad')
    }
  })
})

describe('certificate brand and claims', () => {
  it('names the issuer "Prodily", never PM Academy', () => {
    const copy = getVerifyPageCopy(input(REAL_CODE))
    expect(copy.metaDescription).toBe(
      `Official Prodily Certificate of Completion for Grace Grad (Principal PM, 90 lessons completed). Certificate ID: ${REAL_CODE}.`,
    )
    const row = getCertificateRowCopy({
      type: 'full_curriculum',
      module_slug: null,
      lessons_completed: 90,
      level: 10,
      career_title: 'Principal PM',
      issued_at: '2026-10-01T00:00:00.000Z',
    })
    expect(row.title).toBe('Prodily Full Curriculum Completion Certificate')

    const linkedIn = new URL(
      buildLinkedInCertificationUrl({
        certificateCode: REAL_CODE,
        careerTitle: 'Principal PM',
        issuedAt: '2026-10-01T00:00:00.000Z',
        verificationUrl: 'https://prodily.example/verify/' + REAL_CODE,
      }),
    )
    expect(linkedIn.searchParams.get('name')).toBe('Prodily: Product Management Certificate (Principal PM)')

    const jsonLd = generateCredentialJsonLd({
      certificateCode: REAL_CODE,
      learnerName: 'Grace Grad',
      careerTitle: 'Principal PM',
      issuedAt: '2026-10-01T00:00:00.000Z',
      verificationUrl: 'https://prodily.example/verify/' + REAL_CODE,
      portfolioUrl: 'https://prodily.example/p/grace',
      siteOrigin: 'https://prodily.example',
    })
    expect(jsonLd.name).toBe('Prodily Product Management Completion Credential')
    expect(jsonLd.recognizedBy).toMatchObject({ name: 'Prodily' })

    for (const text of [
      copy.metaTitle,
      copy.metaDescription,
      copy.footerLine,
      row.title,
      row.detail,
      linkedIn.searchParams.get('name') ?? '',
      String(jsonLd.name),
      CERTIFICATE_RECIPIENT_LEAD_IN,
      CERTIFICATE_COMPLETION_STATEMENT,
    ]) {
      expect(text).not.toContain('PM Academy')
    }
  })

  it('certifies completion of the 90 lessons only, with no capstone or mastery claim', () => {
    expect(CERTIFICATE_RECIPIENT_LEAD_IN).toBe('This credential is awarded to')
    expect(CERTIFICATE_COMPLETION_STATEMENT).toBe('for completing all 90 lessons across 9 modules of the curriculum.')
    expect(CERTIFICATE_COMPLETION_STATEMENT).not.toMatch(/mastery|capstone|requirements/i)
  })
})
