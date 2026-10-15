/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { CertificateCard } from '@/components/certificates/CertificateCard'
import type { VerifiedCertificatePayload } from '@/lib/certificates-db'
import { calculateLevel } from '@/lib/xp'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const TEST_LABEL = 'Test certificate — not a valid credential'
const REAL_CODE = 'PMA-2026-ABCDEF12'
const TEST_CODE = 'TEST-PMA-2026-ABCDEF12-9F3A1C'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function certificate(certificateCode: string): VerifiedCertificatePayload {
  return {
    id: 'cert-1',
    certificateCode,
    type: 'full_curriculum',
    moduleSlug: null,
    learnerName: 'Asha Rao',
    username: 'asha',
    avatarUrl: null,
    levelInfo: calculateLevel(5000),
    totalXp: 5000,
    lessonsCompleted: 90,
    modulesCompleted: 9,
    issuedAt: '2026-10-01T00:00:00.000Z',
    isValid: true,
    verificationUrl: `https://example.test/verify/${certificateCode}`,
    portfolioUrl: 'https://example.test/p/asha',
  }
}

// Printing /verify shows only `.certificate-print-container`, so everything a printout
// says about the certificate has to come from inside that element.
function printedText(code: string): string {
  act(() => root.render(<CertificateCard certificate={certificate(code)} />))
  const printable = container.querySelector('.certificate-print-container')
  expect(printable).not.toBeNull()
  return printable?.textContent ?? ''
}

describe('CertificateCard test-certificate marking', () => {
  it('words a real certificate as a verified credential', () => {
    const text = printedText(REAL_CODE)

    expect(text).toContain('Verified Credential')
    expect(text).toContain('Certificate of Completion')
    expect(text).toContain('This credential is awarded to')
    expect(text).toContain('for completing all 90 lessons across 9 modules of the curriculum.')
    // A certificate needs only the 90 lessons: no capstone or "mastery" claim.
    expect(text).not.toContain('fulfilled all curriculum requirements')
    expect(text).not.toMatch(/mastery|mastered/i)
    expect(text).not.toContain('capstone')
    expect(text).toContain('Modules Completed')
    // Signed by the founder; there is no academic board to name.
    expect(text).toContain('Aditya Gangwani')
    expect(text).toContain('Founder, Prodily')
    expect(text).not.toContain('Academic Board')
    expect(text).not.toContain('PM Academy')
    expect(text).toContain('Scan to Verify')
    expect(text).not.toContain(TEST_LABEL)
  })

  it('marks a TEST certificate inside the printable card and makes no credential claim', () => {
    const text = printedText(TEST_CODE)

    expect(text).toContain(TEST_LABEL)
    expect(text).toContain('Test Certificate')
    expect(text).toContain('It does not certify any completed lessons.')
    expect(text).toContain(TEST_CODE)

    expect(text).not.toContain('Verified Credential')
    expect(text).not.toContain('Certificate of Completion')
    expect(text).not.toContain('This credential is awarded to')
    expect(text).not.toContain('for completing all 90 lessons')
    expect(text).not.toContain('has successfully fulfilled')
    expect(text).not.toContain('Founder, Prodily')
    expect(text).not.toContain('Scan to Verify')
  })
})
