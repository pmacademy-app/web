/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CapstoneReviewedEmail } from '@/emails/templates/learning/CapstoneReviewed'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ROOT = path.resolve(import.meta.dirname, '../../')

// The review drawer moved to the admin console repository with its test.
describe('PROD-03 (AG-27): Capstone Review UI & Notifications', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount()
      })
      container.remove()
    }
    container = null
    root = null
    vi.restoreAllMocks()
  })

  it('renders CapstoneReviewedEmail correctly for approved action with feedback', () => {
    act(() => {
      root?.render(
        <CapstoneReviewedEmail
          userName="Alex"
          moduleName="PM Foundations"
          moduleSlug="foundations"
          action="approve"
          feedback="Excellent customer problem articulation."
        />
      )
    })

    expect(container?.textContent).toContain('Capstone Approved!')
    expect(container?.textContent).toContain('Alex')
    expect(container?.textContent).toContain('Excellent customer problem articulation.')
    expect(container?.textContent).toContain('published to your public portfolio')
    expect(container?.textContent).not.toMatch(/\u2014/)
  })

  it('renders CapstoneReviewedEmail correctly for changes_requested action', () => {
    act(() => {
      root?.render(
        <CapstoneReviewedEmail
          userName="Alex"
          moduleName="PM Foundations"
          moduleSlug="foundations"
          action="request_changes"
          feedback="Please expand on metrics and quantitative evidence."
        />
      )
    })

    expect(container?.textContent).toContain('Capstone Feedback: Changes Requested')
    expect(container?.textContent).toContain('Please expand on metrics and quantitative evidence.')
    expect(container?.textContent).toContain('revise and resubmit your project')
    expect(container?.textContent).not.toMatch(/\u2014/)
  })

  it('verifies that the learner capstone workspace page contains no alert() calls', () => {
    const pageSource = readFileSync(
      path.join(ROOT, 'app/(app)/capstones/[module]/page.tsx'),
      'utf8'
    )
    expect(pageSource).not.toMatch(/\balert\s*\(/)
    expect(pageSource).toContain('setSubmitError')
    expect(pageSource).toContain('Review & Rubric Evaluation')
    expect(pageSource).toContain('Edit and resubmit')
  })
})
