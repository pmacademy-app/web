import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'

describe('B11-B — Learner States: EmptyState', () => {
  it('renders default icon, title, and description', () => {
    const html = renderToString(
      React.createElement(EmptyState, {
        title: 'No items found',
        description: 'Try adjusting your search filters.',
      })
    )
    expect(html).toContain('No items found')
    expect(html).toContain('Try adjusting your search filters.')
    expect(html).toContain('role="status"')
    expect(html).toContain('svg')
  })

  it('renders custom icon when provided', () => {
    const customIcon = React.createElement('span', { 'data-testid': 'custom-icon' }, '★')
    const html = renderToString(
      React.createElement(EmptyState, {
        icon: customIcon,
        title: 'Custom Title',
      })
    )
    expect(html).toContain('data-testid="custom-icon"')
    expect(html).toContain('★')
    expect(html).toContain('Custom Title')
  })

  it('renders custom action element when provided', () => {
    const action = React.createElement('button', { type: 'button' }, 'Add Item')
    const html = renderToString(
      React.createElement(EmptyState, {
        title: 'Empty List',
        action,
      })
    )
    expect(html).toContain('Add Item')
    expect(html).toContain('<button')
  })

  it('merges custom className and applies standard border/background classes', () => {
    const html = renderToString(
      React.createElement(EmptyState, {
        title: 'Styled Empty',
        className: 'custom-empty-class',
      })
    )
    expect(html).toContain('custom-empty-class')
    expect(html).toContain('border-dashed')
    expect(html).toContain('border-border')
  })
})

describe('B11-B — Learner States: ErrorState', () => {
  it('renders default title and role="alert"', () => {
    const html = renderToString(React.createElement(ErrorState, {}))
    expect(html).toContain('Something went wrong')
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="assertive"')
  })

  it('renders custom title and description', () => {
    const html = renderToString(
      React.createElement(ErrorState, {
        title: 'Unable to Load Data',
        description: 'Please check your internet connection.',
      })
    )
    expect(html).toContain('Unable to Load Data')
    expect(html).toContain('Please check your internet connection.')
  })

  it('renders error message when string or Error object is passed', () => {
    const htmlString = renderToString(
      React.createElement(ErrorState, {
        error: 'Network timeout after 5000ms',
      })
    )
    expect(htmlString).toContain('Network timeout after 5000ms')

    const htmlObject = renderToString(
      React.createElement(ErrorState, {
        error: new Error('Failed to fetch resource'),
      })
    )
    expect(htmlObject).toContain('Failed to fetch resource')
  })

  it('renders retry button with B11-A Button when onRetry is provided', () => {
    const dummyRetry = () => {}
    const html = renderToString(
      React.createElement(ErrorState, {
        onRetry: dummyRetry,
        retryLabel: 'Try Again Now',
      })
    )
    expect(html).toContain('Try Again Now')
    expect(html).toContain('data-slot="button"')
  })

  it('does not render retry button when onRetry is omitted', () => {
    const html = renderToString(React.createElement(ErrorState, { title: 'Static Error' }))
    expect(html).not.toContain('Try again')
    expect(html).not.toContain('data-slot="button"')
  })

  it('merges custom className and applies destructive styling', () => {
    const html = renderToString(
      React.createElement(ErrorState, {
        title: 'Test',
        className: 'custom-error-class',
      })
    )
    expect(html).toContain('custom-error-class')
    expect(html).toContain('border-destructive/25')
    expect(html).toContain('bg-destructive/5')
  })
})

describe('B11-B — Learner States: Skeleton (Pure CSS & Server/Client Safe)', () => {
  it('renders pure CSS skeleton with aria-hidden="true"', () => {
    const html = renderToString(
      React.createElement(Skeleton, { className: 'h-6 w-32' })
    )
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('animate-pulse')
    expect(html).toContain('motion-reduce:animate-none')
    expect(html).toContain('bg-secondary/80')
    expect(html).toContain('h-6 w-32')
  })

  it('does NOT declare use client or import framer-motion / useReducedMotion', () => {
    const skeletonPath = path.resolve(import.meta.dirname, '../../components/ui/skeleton.tsx')
    const content = readFileSync(skeletonPath, 'utf8')

    expect(content).not.toContain("'use client'")
    expect(content).not.toContain('"use client"')
    expect(content).not.toContain('framer-motion')
    expect(content).not.toContain('useReducedMotion')
  })
})

describe('B11-B — Learner States: Client/Server Boundary Safety', () => {
  it('ensures learner state UI primitives do not import server-only or DB modules', () => {
    const uiDir = path.resolve(import.meta.dirname, '../../components/ui')
    const files = ['empty-state.tsx', 'error-state.tsx', 'skeleton.tsx']

    for (const file of files) {
      const content = readFileSync(path.join(uiDir, file), 'utf8')
      expect(content).not.toContain('server-only')
      expect(content).not.toContain('@/lib/db')
      expect(content).not.toContain('createServiceRoleSupabaseClient')
    }
  })
})

describe('B11-B — Learner States: Adoption Across Target Surfaces', () => {
  const webRoot = path.resolve(import.meta.dirname, '../..')

  it('app/(app)/loading.tsx uses Skeleton from @/components/ui/skeleton', () => {
    const file = path.join(webRoot, 'app/(app)/loading.tsx')
    const content = readFileSync(file, 'utf8')
    expect(content).toContain("import { Skeleton } from '@/components/ui/skeleton'")
    expect(content).toContain('<Skeleton')
  })

  it('DashboardNotificationsWidget uses Skeleton from @/components/ui/skeleton', () => {
    const file = path.join(webRoot, 'components/notifications/DashboardNotificationsWidget.tsx')
    const content = readFileSync(file, 'utf8')
    expect(content).toContain("import { Skeleton } from '@/components/ui/skeleton'")
    expect(content).toContain('<Skeleton')
  })

  it('NotificationCenterDrawer uses ErrorState and EmptyState', () => {
    const file = path.join(webRoot, 'components/notifications/NotificationCenterDrawer.tsx')
    const content = readFileSync(file, 'utf8')
    expect(content).toContain("import { EmptyState } from '@/components/ui/empty-state'")
    expect(content).toContain("import { ErrorState } from '@/components/ui/error-state'")
    expect(content).toContain('<ErrorState')
    expect(content).toContain('<EmptyState')
  })

  it('RecentActivityCard uses EmptyState', () => {
    const file = path.join(webRoot, 'components/dashboard/RecentActivityCard.tsx')
    const content = readFileSync(file, 'utf8')
    expect(content).toContain("import { EmptyState } from '@/components/ui/empty-state'")
    expect(content).toContain('<EmptyState')
  })

  it('Review EmptyState delegates to @/components/ui/empty-state and Button variants', () => {
    const file = path.join(webRoot, 'components/review/EmptyState.tsx')
    const content = readFileSync(file, 'utf8')
    expect(content).toContain("import { EmptyState as SharedEmptyState } from '@/components/ui/empty-state'")
    expect(content).toContain("import { buttonVariants } from '@/components/ui/button'")
    expect(content).toContain('<SharedEmptyState')
  })

  it('BadgeShowcaseCard uses EmptyState', () => {
    const file = path.join(webRoot, 'components/progress/BadgeShowcaseCard.tsx')
    const content = readFileSync(file, 'utf8')
    expect(content).toContain("import { EmptyState } from '@/components/ui/empty-state'")
    expect(content).toContain('<EmptyState')
  })
})
