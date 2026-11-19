/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 8.2: the learner side of the capstone review loop.
 *
 * The review mutation, its admin-only route and review aging moved to the admin console
 * repository with their tests. What stays here is what this app owns:
 *   - the `capstone.reviewed` notification follows existing conventions (registered,
 *     in-app, correct destination);
 *   - no learner-facing route can review a capstone.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

import { EVENT_DEFINITIONS, validateEventPayload } from '@/lib/notifications/events'
import { buildInAppContentFromEvent } from '@/lib/notifications/in-app/service'

describe('Phase 8.2 — capstone.reviewed notification conventions', () => {
  it('is a registered portfolio event with a valid payload guard', () => {
    const def = EVENT_DEFINITIONS['capstone.reviewed']
    expect(def).toBeDefined()
    expect(def.category).toBe('portfolio')
    expect(validateEventPayload('capstone.reviewed', { submissionId: 's1' })).toBe(true)
    expect(validateEventPayload('capstone.reviewed', {})).toBe(false)
  })

  it('renders in-app content linking the learner to the capstone destination', () => {
    const published = buildInAppContentFromEvent({
      event: 'capstone.reviewed',
      payload: { moduleTitle: 'Product Thinking Foundations', moduleSlug: 'foundations', isPublished: true },
    } as any)
    expect(published.title).toBe('Capstone reviewed')
    expect(published.actionUrl).toBe('/capstones/foundations')
    expect(published.body).toContain('portfolio')

    const privateReview = buildInAppContentFromEvent({
      event: 'capstone.reviewed',
      payload: { moduleTitle: 'Product Thinking Foundations', moduleSlug: 'foundations', isPublished: false },
    } as any)
    expect(privateReview.actionUrl).toBe('/capstones/foundations')
  })
})

describe('Phase 8.2: review is not reachable from the learner app', () => {
  it('never exposes reviewCapstone through a learner-facing route', () => {
    const capstonesApi = path.join(__dirname, '..', '..', 'app', 'api', 'capstones')
    const offenders: string[] = []
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('reviewCapstone')) {
          offenders.push(full)
        }
      }
    }
    walk(capstonesApi) // the learner-facing /api/capstones tree
    expect(offenders).toEqual([])
  })
})
