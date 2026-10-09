/**
 * Admin dev TEST- certificates resolve on /verify and appear in certificate lists like
 * real ones. `lib/certificates/presentation` decides the wording for both, so a TEST row
 * is never presented as a verified credential and a real one reads exactly as it did.
 */
import { describe, it, expect } from 'vitest'
import { BRAND } from '@/lib/brand'
import { TEST_CERTIFICATE_PREFIX, isTestCertificateCode } from '@/lib/certificates'
import * as certificatesDb from '@/lib/certificates-db'
import {
  TEST_CERTIFICATE_LABEL,
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
      statusLabel: 'Test certificate — not a valid credential',
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
