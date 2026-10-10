/**
 * @vitest-environment jsdom
 */

import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The global setup mocks `next/dynamic` to render nothing. Model the real behaviour instead:
// record the options, show `loading` first, then the lazily imported component.
const { dynamicCalls } = vi.hoisted(() => ({ dynamicCalls: [] as Array<{ ssr?: boolean; hasLoading: boolean }> }))

vi.mock('next/dynamic', async () => {
  const ReactActual = await vi.importActual<typeof import('react')>('react')
  return {
    default: (
      loader: () => Promise<React.ComponentType<Record<string, unknown>>>,
      options?: { ssr?: boolean; loading?: () => React.ReactNode },
    ) => {
      dynamicCalls.push({ ssr: options?.ssr, hasLoading: typeof options?.loading === 'function' })
      const Lazy = ReactActual.lazy(async () => ({ default: await loader() }))
      return function DynamicComponent(props: Record<string, unknown>) {
        return ReactActual.createElement(
          ReactActual.Suspense,
          { fallback: options?.loading ? options.loading() : null },
          ReactActual.createElement(Lazy, props),
        )
      }
    },
  }
})

function stub(name: string) {
  function StubChart(props: Record<string, unknown>) {
    return <div data-testid={name} data-props={Object.keys(props).sort().join(',')} />
  }
  return StubChart
}

vi.mock('@/components/admin/AdminLearnerActivityChart', () => ({
  AdminLearnerActivityChart: stub('learner-chart'),
}))
vi.mock('@/components/admin/AdminLearningActivityChart', () => ({
  AdminLearningActivityChart: stub('learning-chart'),
}))
vi.mock('@/components/admin/AdminEmailDashboard', () => ({
  AdminEmailDashboard: stub('email-dashboard'),
}))
vi.mock('@/components/admin/AnalyticsEngagementTab', () => ({
  AnalyticsEngagementTab: stub('engagement-tab'),
}))
vi.mock('@/components/admin/AnalyticsOutcomesTab', () => ({
  AnalyticsOutcomesTab: stub('outcomes-tab'),
}))

import {
  AdminEmailDashboardLazy,
  AdminLearnerActivityChartLazy,
  AdminLearningActivityChartLazy,
  AnalyticsEngagementTabLazy,
  AnalyticsOutcomesTabLazy,
} from '@/components/admin/charts-lazy'

type AnyComponent = React.ComponentType<Record<string, unknown>>

const cases: Array<[string, AnyComponent, string, Record<string, unknown>]> = [
  ['AdminLearnerActivityChartLazy', AdminLearnerActivityChartLazy as unknown as AnyComponent, 'learner-chart', { data: [] }],
  ['AdminLearningActivityChartLazy', AdminLearningActivityChartLazy as unknown as AnyComponent, 'learning-chart', { data: [] }],
  [
    'AdminEmailDashboardLazy',
    AdminEmailDashboardLazy as unknown as AnyComponent,
    'email-dashboard',
    { history: [], volumeSeries: [], queueCounts: {} },
  ],
  ['AnalyticsEngagementTabLazy', AnalyticsEngagementTabLazy as unknown as AnyComponent, 'engagement-tab', { data: {} }],
  ['AnalyticsOutcomesTabLazy', AnalyticsOutcomesTabLazy as unknown as AnyComponent, 'outcomes-tab', { data: {} }],
]

let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(element: React.ReactElement): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
  return container
}

async function waitFor(el: HTMLElement, selector: string): Promise<Element> {
  for (let i = 0; i < 20; i++) {
    const found = el.querySelector(selector)
    if (found) return found
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error(`${selector} never rendered`)
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('admin charts-lazy wrappers (Admin R6 B2)', () => {
  it('declares every wrapper client-only with a loading skeleton', () => {
    expect(dynamicCalls).toHaveLength(5)
    for (const call of dynamicCalls) {
      expect(call.ssr).toBe(false)
      expect(call.hasLoading).toBe(true)
    }
  })

  it.each(cases)('%s shows a skeleton, then the real component with its props', async (_name, Wrapper, testId, props) => {
    const el = mount(<Wrapper {...props} />)
    const skeleton = el.querySelector('[role="status"]')
    expect(skeleton?.getAttribute('aria-label')).toMatch(/^Loading /)
    expect(skeleton?.className).toMatch(/h-\[\d+rem\]/)
    const loaded = await waitFor(el, `[data-testid="${testId}"]`)
    expect(loaded.getAttribute('data-props')).toBe(Object.keys(props).sort().join(','))
    expect(el.querySelector('[role="status"]')).toBeNull()
  })

  it('importers no longer statically import the recharts files', () => {
    const root = path.resolve(__dirname, '..', '..')
    const importers = [
      'components/admin/AnalyticsOverviewTab.tsx',
      'components/admin/AnalyticsLearnersTab.tsx',
      'components/admin/AnalyticsLearningTab.tsx',
      'components/admin/AnalyticsWorkspace.tsx',
      'app/admin/(console)/communications/page.tsx',
    ]
    const chartModules =
      /from\s+['"][^'"]*\/(AdminEmailDashboard|AdminLearnerActivityChart|AdminLearningActivityChart|AnalyticsEngagementTab|AnalyticsOutcomesTab)['"]/
    for (const file of importers) {
      const source = fs.readFileSync(path.join(root, file), 'utf8')
      expect(source, file).not.toMatch(chartModules)
      expect(source, file).not.toMatch(/from\s+['"]recharts['"]/)
      expect(source, file).toMatch(/charts-lazy['"]/)
    }
  })
})
