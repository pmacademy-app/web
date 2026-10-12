/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// The global setup mocks `next/link` as children-only, which drops href. Render a real anchor.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { CertificatesCard } from '@/components/progress/CertificatesCard'
import type { CertificateRow } from '@/lib/certificates-db'

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

function certificate(overrides: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: 'cert-real',
    user_id: 'user-1',
    certificate_code: REAL_CODE,
    type: 'full_curriculum',
    module_slug: null,
    learner_name: 'Grace Grad',
    level: 9,
    career_title: 'Principal PM',
    total_xp: 4500,
    lessons_completed: 90,
    modules_completed: 9,
    issued_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  } as CertificateRow
}

const testCertificate = () =>
  certificate({ id: 'cert-test', certificate_code: TEST_CODE, career_title: '[TEST] Principal PM' })

function render(certificates: CertificateRow[]) {
  act(() => {
    root.render(<CertificatesCard certificates={certificates} completedLessons={90} completedPercentage={100} />)
  })
}

/**
 * The row whose status line ends with exactly `code`. A TEST code embeds the learner's
 * real code, so a substring match would confuse the two.
 */
function rowFor(code: string): HTMLElement {
  const status = Array.from(container.querySelectorAll('span')).find((s) => s.textContent?.endsWith(` • ${code}`))
  const row = status?.parentElement?.parentElement
  if (!row) throw new Error(`no certificate row for ${code}`)
  return row
}

describe('CertificatesCard', () => {
  it('labels an admin TEST row as a test certificate, never as a verified credential', () => {
    render([testCertificate()])
    const row = rowFor(TEST_CODE)

    expect(row.querySelector('span')?.textContent).toBe(`${TEST_LABEL} • ${TEST_CODE}`)
    expect(row.querySelector('h3')?.textContent).toBe('Admin Test Certificate')
    expect(row.textContent).toContain('It does not certify any completed lessons.')

    expect(row.textContent).not.toContain('Verified Credential')
    expect(row.textContent).not.toContain('View Verified Certificate')
    expect(row.textContent).not.toContain('Completion Certificate')
    expect(row.textContent).not.toMatch(/mastering \d+ lessons/)
    expect(row.textContent).not.toContain('LinkedIn')
  })

  it('links a TEST row to its own verify page as a test certificate', () => {
    render([testCertificate()])
    const link = rowFor(TEST_CODE).querySelector('a')

    expect(link?.textContent).toBe('View Test Certificate')
    expect(link?.getAttribute('href')).toBe(`/verify/${TEST_CODE}`)
  })

  it('renders a real certificate exactly as before', () => {
    render([certificate()])
    const row = rowFor(REAL_CODE)

    expect(row.querySelector('span')?.textContent).toBe(`Verified Credential • ${REAL_CODE}`)
    expect(row.querySelector('h3')?.textContent).toBe('Prodily PM Academy Full Curriculum Completion Certificate')
    expect(row.querySelector('p')?.textContent).toMatch(
      /^Issued on .+ for completing all 90 lessons and reaching Level 9 \(Principal PM\)\.$/
    )
    const link = row.querySelector('a')
    expect(link?.textContent).toBe('View Verified Certificate')
    expect(link?.getAttribute('href')).toBe(`/verify/${REAL_CODE}`)
    expect(row.className).toContain('border-amber-500/30')

    expect(container.textContent).not.toContain(TEST_LABEL)
    expect(container.textContent).not.toContain('Admin Test Certificate')
  })

  // Growth R5 / F4: a module certificate is titled by its module, not as the full curriculum.
  it('titles a module certificate by its module', () => {
    render([certificate({ id: 'cert-mod', type: 'module', module_slug: 'discovery', lessons_completed: 10 })])
    const row = rowFor(REAL_CODE)

    expect(row.querySelector('h3')?.textContent).toBe('Users, Problems & Discovery Module Certificate')
    expect(row.querySelector('p')?.textContent).toMatch(/for completing every lesson in Users, Problems & Discovery\.$/)
    expect(container.textContent).not.toContain('Full Curriculum')
  })

  it('falls back to a plain module title for an unknown module slug', () => {
    render([certificate({ id: 'cert-mod', type: 'module', module_slug: 'tech_ai', lessons_completed: 10 })])
    expect(rowFor(REAL_CODE).querySelector('h3')?.textContent).toBe('Module Certificate')
  })

  it('labels each row by its own code when a learner has both', () => {
    render([testCertificate(), certificate()])

    expect(container.querySelectorAll('h3')).toHaveLength(2)
    expect(rowFor(REAL_CODE).textContent).toContain('Verified Credential')
    expect(rowFor(REAL_CODE).textContent).not.toContain(TEST_LABEL)
    expect(rowFor(TEST_CODE).textContent).toContain(TEST_LABEL)
    expect(rowFor(TEST_CODE).textContent).not.toContain('Verified Credential')
  })

  it('shows eligibility progress when there are no certificates', () => {
    act(() => {
      root.render(<CertificatesCard certificates={[]} completedLessons={45} completedPercentage={50} />)
    })

    expect(container.textContent).toContain('45 / 90 Lessons (50%)')
    expect(container.textContent).not.toContain(TEST_LABEL)
  })
})
