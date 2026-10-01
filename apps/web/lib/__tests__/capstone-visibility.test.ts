import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'

// Mock the data hook so the component render is deterministic and offline.
const mockUseApiQuery = vi.fn()
vi.mock('@/lib/api/hooks', () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
}))

import { LessonCapstonePreview } from '@/components/capstones/LessonCapstonePreview'
import { getCapstoneDefinition } from '@/config/capstones'

// React SSR inserts `<!-- -->` markers between adjacent text nodes; strip them so text assertions
// see the human-visible string.
const strip = (html: string) => html.replace(/<!-- -->/g, '')

describe('Phase 7 (7.1) — LessonCapstonePreview surfaces the capstone from lesson 1', () => {
  beforeEach(() => {
    mockUseApiQuery.mockReset()
  })

  it('renders the correct capstone for the module with its real deliverable', () => {
    mockUseApiQuery.mockReturnValue({
      data: { success: true, status: 'locked', lessonsCompleted: 2, totalLessons: 10, requiredLessons: 8 },
    })
    const html = strip(renderToString(React.createElement(LessonCapstonePreview, { moduleSlug: 'foundations' })))
    const def = getCapstoneDefinition('foundations')!
    // Title contains '&' → SSR-encoded as &amp;, so assert on a stable substring.
    expect(html).toContain('Product Opportunity Brief')
    expect(def.title).toContain('Product Opportunity Brief')
    expect(html).toContain(def.deliverableType)
    // A CTA into the capstone destination is present (next/link renders only children in bare SSR,
    // so the href itself is a routing concern, not asserted here).
    expect(html).toContain('Preview the capstone')
  })

  it('shows accurate progress toward eligibility for a non-eligible learner', () => {
    mockUseApiQuery.mockReturnValue({
      data: { success: true, status: 'locked', lessonsCompleted: 3, totalLessons: 10, requiredLessons: 8 },
    })
    const html = strip(renderToString(React.createElement(LessonCapstonePreview, { moduleSlug: 'discovery' })))
    expect(html).toContain('3/8')
    expect(html).toContain('Locked')
    // What remains: 5 more lessons.
    expect(html).toContain('5 more lessons')
  })

  it('reflects the treatment threshold when the server reports it (visibility follows the gate)', () => {
    mockUseApiQuery.mockReturnValue({
      data: { success: true, status: 'unlocked', lessonsCompleted: 4, totalLessons: 10, requiredLessons: 4 },
    })
    const html = strip(renderToString(React.createElement(LessonCapstonePreview, { moduleSlug: 'foundations' })))
    expect(html).toContain('4/4')
    expect(html).toContain('Ready to start')
  })

  it('is visibility-only: no submit or draft control is ever rendered', () => {
    mockUseApiQuery.mockReturnValue({
      data: { success: true, status: 'unlocked', lessonsCompleted: 8, totalLessons: 10, requiredLessons: 8 },
    })
    const html = renderToString(React.createElement(LessonCapstonePreview, { moduleSlug: 'foundations' }))
    // It links to the workspace but never exposes a submit affordance itself.
    expect(html).not.toMatch(/Submit Deliverable/i)
    expect(html.toLowerCase()).not.toContain('<button')
    expect(html).toContain('Open the capstone workspace')
  })

  it('renders nothing for a module without a capstone definition', () => {
    mockUseApiQuery.mockReturnValue({ data: undefined })
    const html = renderToString(React.createElement(LessonCapstonePreview, { moduleSlug: 'not-a-module' }))
    expect(html).toBe('')
  })

  it('shows the submitted state once the learner has a submission', () => {
    mockUseApiQuery.mockReturnValue({
      data: { success: true, status: 'submitted', lessonsCompleted: 10, totalLessons: 10, requiredLessons: 8 },
    })
    const html = renderToString(React.createElement(LessonCapstonePreview, { moduleSlug: 'foundations' }))
    expect(html).toContain('Submitted')
    expect(html).toContain('View your deliverable')
  })
})
