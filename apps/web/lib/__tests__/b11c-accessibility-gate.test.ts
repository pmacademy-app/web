import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import axe from 'axe-core'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Executes axe-core accessibility audit on a rendered React element within JSDOM.
 * Evaluates against WCAG 2.1 Level AA criteria.
 */
async function auditA11y(element: React.ReactElement, options?: axe.RunOptions) {
  const html = renderToString(element)
  const fullDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>A11y Audit</title>
</head>
<body>
  <main id="audit-root">
    ${html}
  </main>
</body>
</html>`

  const dom = new JSDOM(fullDocument, { runScripts: 'outside-only' })
  const { document } = dom.window
  const root = document.getElementById('audit-root')

  if (!root) {
    throw new Error('Audit root element not found')
  }

  const results = await axe.run(root, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
    ...options,
  })

  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  )

  return {
    violations: results.violations,
    seriousOrCritical,
    passes: results.passes,
  }
}

describe('B11-C — Accessibility Gate: Design System Primitives (B11-A)', () => {
  const allVariants = [
    'default',
    'secondary',
    'outline',
    'ghost',
    'destructive',
    'destructive-subtle',
    'warning',
    'accent',
    'admin',
    'link',
    'ai',
    'success',
    'locked',
  ] as const

  it.each(allVariants)('Button variant "%s" produces 0 serious/critical axe violations', async (variant) => {
    const { seriousOrCritical } = await auditA11y(
      React.createElement(Button, { variant, type: 'button' }, `Action: ${variant}`)
    )
    expect(seriousOrCritical).toEqual([])
  })

  it('icon-only Button with aria-label produces 0 serious/critical violations', async () => {
    const { seriousOrCritical } = await auditA11y(
      React.createElement(
        Button,
        { size: 'icon', 'aria-label': 'Search curriculum', type: 'button' },
        React.createElement('span', { 'aria-hidden': 'true' }, '🔍')
      )
    )
    expect(seriousOrCritical).toEqual([])
  })

  it('loading and disabled Button states produce 0 serious/critical violations', async () => {
    const { seriousOrCritical: loadingViolations } = await auditA11y(
      React.createElement(Button, { loading: true, type: 'button' }, 'Saving Changes')
    )
    expect(loadingViolations).toEqual([])

    const { seriousOrCritical: disabledViolations } = await auditA11y(
      React.createElement(Button, { disabled: true, type: 'button' }, 'Submit')
    )
    expect(disabledViolations).toEqual([])
  })

  it('Input with associated label produces 0 serious/critical violations', async () => {
    const formElement = React.createElement('form', {}, [
      React.createElement('label', { key: 'lbl', htmlFor: 'work-email' }, 'Work Email Address'),
      React.createElement(Input, {
        key: 'inp',
        id: 'work-email',
        type: 'email',
        placeholder: 'alex@example.com',
        required: true,
      }),
    ])

    const { seriousOrCritical } = await auditA11y(formElement)
    expect(seriousOrCritical).toEqual([])
  })

  it('Input with error state and aria-describedby produces 0 serious/critical violations', async () => {
    const formWithError = React.createElement('form', {}, [
      React.createElement('label', { key: 'lbl', htmlFor: 'password-input' }, 'Password'),
      React.createElement(Input, {
        key: 'inp',
        id: 'password-input',
        type: 'password',
        error: true,
        'aria-describedby': 'password-error-msg',
      }),
      React.createElement(
        'p',
        { key: 'err', id: 'password-error-msg', role: 'alert' },
        'Password must be at least 8 characters'
      ),
    ])

    const { seriousOrCritical } = await auditA11y(formWithError)
    expect(seriousOrCritical).toEqual([])
  })

  it('ProgressBar produces 0 serious/critical violations', async () => {
    const { seriousOrCritical } = await auditA11y(
      React.createElement(ProgressBar, {
        value: 75,
        max: 100,
        label: 'Module Completion Progress',
      })
    )
    expect(seriousOrCritical).toEqual([])
  })
})

describe('B11-C — Accessibility Gate: Learner States (B11-B)', () => {
  it('EmptyState with title, description, and action button produces 0 serious/critical violations', async () => {
    const { seriousOrCritical } = await auditA11y(
      React.createElement(EmptyState, {
        title: 'No Reviews Due',
        description: 'You are completely caught up with your daily flashcard queue.',
        action: React.createElement(Button, { type: 'button' }, 'Return to Dashboard'),
      })
    )
    expect(seriousOrCritical).toEqual([])
  })

  it('ErrorState with alert role and retry button produces 0 serious/critical violations', async () => {
    const { seriousOrCritical } = await auditA11y(
      React.createElement(ErrorState, {
        title: 'Unable to Load Leaderboard',
        description: 'A transient network error occurred. Please try again.',
        error: 'Failed to fetch cohort data',
        onRetry: () => {},
        retryLabel: 'Retry Query',
      })
    )
    expect(seriousOrCritical).toEqual([])
  })

  it('Skeleton container with aria-busy produces 0 serious/critical violations', async () => {
    const loadingWidget = React.createElement(
      'section',
      { 'aria-busy': 'true', 'aria-label': 'Loading notification feed' },
      [
        React.createElement(Skeleton, { key: 's1', className: 'h-8 w-48 mb-4' }),
        React.createElement(Skeleton, { key: 's2', className: 'h-24 w-full mb-2' }),
        React.createElement(Skeleton, { key: 's3', className: 'h-24 w-full' }),
      ]
    )

    const { seriousOrCritical } = await auditA11y(loadingWidget)
    expect(seriousOrCritical).toEqual([])
  })
})

describe('B11-C — Accessibility Gate: Failure Enforcement Verification', () => {
  it('fails with critical violation when button lacks an accessible name', async () => {
    const inaccessibleButton = React.createElement('button', { type: 'button' })
    const { seriousOrCritical } = await auditA11y(inaccessibleButton)

    expect(seriousOrCritical.length).toBeGreaterThan(0)
    const buttonNameViolation = seriousOrCritical.find((v) => v.id === 'button-name')
    expect(buttonNameViolation).toBeDefined()
    expect(buttonNameViolation?.impact).toBe('critical')
  })

  it('fails with critical violation when form input lacks an accessible label', async () => {
    const unlabeledInput = React.createElement('input', { type: 'text', id: 'unlabeled-test' })
    const { seriousOrCritical } = await auditA11y(unlabeledInput)

    expect(seriousOrCritical.length).toBeGreaterThan(0)
    const labelViolation = seriousOrCritical.find((v) => v.id === 'label')
    expect(labelViolation).toBeDefined()
    expect(labelViolation?.impact).toBe('critical')
  })

  it('fails with critical violation when image lacks alt text', async () => {
    const imageWithoutAlt = React.createElement('img', { src: '/test.png' })
    const { seriousOrCritical } = await auditA11y(imageWithoutAlt)

    expect(seriousOrCritical.length).toBeGreaterThan(0)
    const imageAltViolation = seriousOrCritical.find((v) => v.id === 'image-alt')
    expect(imageAltViolation).toBeDefined()
    expect(imageAltViolation?.impact).toBe('critical')
  })
})
