import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Button, buttonVariants } from '@/components/ui/button'
import { Input, inputVariants } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress-bar'

describe('B11-A — Design System Foundation: buttonVariants & Button', () => {
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

  const allSizes = [
    'default',
    'xs',
    'sm',
    'lg',
    'xl',
    'icon',
    'icon-xs',
    'icon-sm',
    'icon-lg',
  ] as const

  it('generates non-empty class strings for all standard variants', () => {
    for (const variant of allVariants) {
      const classes = buttonVariants({ variant })
      expect(classes).toBeTruthy()
      expect(typeof classes).toBe('string')
    }
  })

  it('generates non-empty class strings for all standard sizes', () => {
    for (const size of allSizes) {
      const classes = buttonVariants({ size })
      expect(classes).toBeTruthy()
      expect(typeof classes).toBe('string')
    }
  })

  it('renders a button with variant and size classes via renderToString', () => {
    const html = renderToString(
      React.createElement(Button, { variant: 'destructive', size: 'lg' }, 'Delete Item')
    )
    expect(html).toContain('Delete Item')
    expect(html).toContain('bg-destructive')
    expect(html).toContain('h-11')
  })

  it('renders loading spinner and disabled state when loading=true', () => {
    const html = renderToString(
      React.createElement(Button, { loading: true }, 'Save')
    )
    expect(html).toContain('Save')
    expect(html).toContain('animate-spin')
    expect(html).toContain('disabled')
  })

  it('supports custom className merge', () => {
    const html = renderToString(
      React.createElement(Button, { className: 'custom-b11a-class' }, 'Test')
    )
    expect(html).toContain('custom-b11a-class')
  })
})

describe('B11-A — Design System Foundation: inputVariants & Input', () => {
  const allInputSizes = ['default', 'sm', 'lg'] as const

  it('generates class strings for all input sizes', () => {
    for (const inputSize of allInputSizes) {
      const classes = inputVariants({ inputSize })
      expect(classes).toBeTruthy()
      expect(typeof classes).toBe('string')
    }
  })

  it('renders native input with default attributes', () => {
    const html = renderToString(
      React.createElement(Input, {
        id: 'test-input',
        type: 'email',
        placeholder: 'test@example.com',
        defaultValue: 'hello',
      })
    )
    expect(html).toContain('type="email"')
    expect(html).toContain('id="test-input"')
    expect(html).toContain('placeholder="test@example.com"')
    expect(html).toContain('data-slot="input"')
  })

  it('sets aria-invalid and border-destructive when error=true', () => {
    const html = renderToString(
      React.createElement(Input, {
        id: 'error-input',
        error: true,
      })
    )
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('border-destructive')
  })
})

describe('B11-A — Design System Foundation: ProgressBar (framer-motion decoupled)', () => {
  it('does NOT contain framer-motion imports or useReducedMotion hook', () => {
    const filePath = path.resolve(import.meta.dirname, '../../components/ui/progress-bar.tsx')
    const fileContent = readFileSync(filePath, 'utf8')

    expect(fileContent).not.toContain('framer-motion')
    expect(fileContent).not.toContain('useReducedMotion')
    expect(fileContent).toContain('motion-reduce:transition-none')
  })

  it('renders accessible progressbar with clamped percentage', () => {
    const html = renderToString(
      React.createElement(ProgressBar, {
        value: 50,
        max: 100,
        label: 'Course Progress',
      })
    )
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="50"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="100"')
    expect(html).toContain('Course Progress')
    expect(html).toContain('width:50%')
  })

  it('clamps values below 0 and above max', () => {
    const htmlUnder = renderToString(
      React.createElement(ProgressBar, { value: -20, max: 100 })
    )
    expect(htmlUnder).toContain('width:0%')

    const htmlOver = renderToString(
      React.createElement(ProgressBar, { value: 150, max: 100 })
    )
    expect(htmlOver).toContain('width:100%')
  })
})

describe('B11-A — Design System Foundation: Client/Server Boundary Safety', () => {
  it('ensures design system primitives do not import server-only or DB modules', () => {
    const uiDir = path.resolve(import.meta.dirname, '../../components/ui')
    const files = ['button.tsx', 'input.tsx', 'progress-bar.tsx']

    for (const file of files) {
      const content = readFileSync(path.join(uiDir, file), 'utf8')
      expect(content).not.toContain('server-only')
      expect(content).not.toContain('@/lib/db')
      expect(content).not.toContain('createServiceRoleSupabaseClient')
    }
  })
})

describe('B11-A — Design System Foundation: High-Traffic Adoption Files', () => {
  const webRoot = path.resolve(import.meta.dirname, '../..')

  /**
   * The files B11-A migrated to the shared primitives, minus one.
   *
   * `components/settings/SettingsTabs.tsx` was part of the original ten. Commit 4525e85
   * later rebuilt it as a compact segmented control and dropped the primitive, which is
   * what made this assertion fail. It is not restored here, for two reasons:
   *
   *   1. The same commit added the file to the B11-C raw-button allowlist mirror below,
   *      so opting it out was deliberate rather than accidental.
   *   2. These controls are tabs, not buttons. The primitive's size tokens (h-8 / h-10,
   *      its own border and radius) do not fit inside a 2px-padded segmented strip, so
   *      re-adopting it to satisfy a test would be a visual regression driven by the
   *      test rather than by the design.
   *
   * Coverage moves rather than disappears: the file is still governed, by the B11-C lint
   * rule's documented allowlist, and the assertion below pins that. If the segmented
   * control is ever rebuilt on the primitive, move the path back into `adoptionFiles`
   * and drop it from both allowlists.
   */
  const adoptionFiles = [
    'app/(auth)/login/page.tsx',
    'app/(auth)/signup/page.tsx',
    'app/(auth)/reset-password/page.tsx',
    'components/settings/SecuritySettingsTab.tsx',
    'components/settings/ConfirmDestructiveAction.tsx',
    'components/feedback/ContextualFeedbackModal.tsx',
    'components/contact/ContactForm.tsx',
    'components/referral/ReferralShareModal.tsx',
    'components/certificates/CertificateActions.tsx',
  ]

  /** Migrated by B11-A, later redesigned away from the primitive. See the note above. */
  const REDESIGNED_SINCE_ADOPTION = 'components/settings/SettingsTabs.tsx'

  it('verifies the remaining adoption files import Button or Input from components/ui', () => {
    for (const relativePath of adoptionFiles) {
      const fullPath = path.join(webRoot, relativePath)
      const content = readFileSync(fullPath, 'utf8')
      const importsButton = content.includes('@/components/ui/button')
      const importsInput = content.includes('@/components/ui/input')
      expect(importsButton || importsInput, `${relativePath} dropped the primitive`).toBe(true)
    }
  })

  it('keeps the one redesigned file governed by the B11-C allowlist instead', () => {
    // An un-adopted file that is also un-allowlisted would be an unreviewed escape
    // hatch. This is what stops the exception above from becoming one.
    const eslintConfig = readFileSync(path.join(webRoot, 'eslint.config.mjs'), 'utf8')
    const allowlistPath = REDESIGNED_SINCE_ADOPTION.replace('components/', '')

    expect(eslintConfig).toContain(`"${allowlistPath}"`)
  })
})
