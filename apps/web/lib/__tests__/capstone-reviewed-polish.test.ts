/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Growth R1 / Task 8 — `capstone.reviewed` carries the real recipient and links a published
 * review to the learner's public portfolio.
 *
 * - The dispatch side (the review service) moved to the admin console repository with its tests.
 * - A published review deep-links to `/p/<username>` only when the portfolio is public;
 *   every other case keeps `/capstones/<slug>`.
 */
import { describe, it, expect } from 'vitest'

import { buildInAppContentFromEvent } from '@/lib/notifications/in-app/service'

describe('capstone.reviewed in-app deep link', () => {
  const build = (payload: Record<string, unknown>) =>
    buildInAppContentFromEvent({ event: 'capstone.reviewed', payload } as any)

  // Growth R5 B13b: the published capstone has its own public page, which the notification opens.
  it('links a published review to its public case-study page', () => {
    const content = build({ moduleTitle: 'Foundations', moduleSlug: 'foundations', isPublished: true, username: 'riyapm', isPortfolioPublic: true })
    expect(content.actionUrl).toBe('/p/riyapm/capstones/foundations')
    expect(content.body).toBe('The Prodily team reviewed your Foundations capstone and published it to your portfolio.')
  })

  it('keeps the capstone link when published without a username or with a private portfolio', () => {
    expect(build({ moduleSlug: 'foundations', isPublished: true }).actionUrl).toBe('/capstones/foundations')
    expect(build({ moduleSlug: 'foundations', isPublished: true, username: 'riyapm', isPortfolioPublic: false }).actionUrl).toBe(
      '/capstones/foundations'
    )
  })

  it('keeps the capstone link for a rejected (not published) review', () => {
    expect(
      build({ moduleSlug: 'foundations', isPublished: false, username: 'riyapm', isPortfolioPublic: true }).actionUrl
    ).toBe('/capstones/foundations')
  })
})
