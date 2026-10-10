import { describe, it, expect } from 'vitest'
import { buildInAppContentFromEvent } from '@/lib/notifications/in-app/service'
import type { EventEnvelope } from '@/lib/notifications/types'

// Growth R5 / B2: achievement notifications carry a share action. Certificates get LinkedIn
// add-to-profile; a public portfolio, a published capstone and a Fellow grant get a portfolio
// share; a Fellow without a public portfolio is asked to publish it. Fellow never gets a LinkedIn
// credential action (ADR-011).

function envelope(event: string, payload: Record<string, unknown>): EventEnvelope<Record<string, unknown>> {
  return {
    id: `evt-${event}`,
    event,
    userId: 'user-1',
    userEmail: 'ada@example.test',
    userName: 'Ada',
    userTimezone: 'UTC',
    priority: 'high',
    category: 'achievements',
    occurredAt: '2026-10-10T00:00:00.000Z',
    payload,
  } as unknown as EventEnvelope<Record<string, unknown>>
}

const action = (event: string, payload: Record<string, unknown>) =>
  buildInAppContentFromEvent(envelope(event, payload)).secondaryAction ?? null

describe('certificate.generated', () => {
  const payload = {
    certificateCode: 'PMA-2026-ABCDEF12',
    certificateType: 'full_curriculum',
    careerTitle: 'Senior PM',
    issuedAt: '2026-10-09T00:00:00.000Z',
    verificationUrl: 'https://prodily.example/verify/PMA-2026-ABCDEF12',
  }

  it('offers LinkedIn add-to-profile for a real certificate', () => {
    const result = action('certificate.generated', payload)
    expect(result).toMatchObject({ kind: 'linkedin_add_to_profile', label: 'Add to LinkedIn' })
    const url = new URL((result as { url: string }).url)
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/profile/add')
    expect(url.searchParams.get('certId')).toBe('PMA-2026-ABCDEF12')
  })

  it('offers nothing for an admin TEST certificate', () => {
    expect(action('certificate.generated', { ...payload, certificateCode: 'TEST-PMA-2026-ABCDEF12-A1B2C3' })).toBeNull()
  })
})

describe('capstone.reviewed', () => {
  it('shares the portfolio when the capstone is published on a public portfolio', () => {
    expect(
      action('capstone.reviewed', { moduleSlug: 'discovery', isPublished: true, username: 'ada', isPortfolioPublic: true }),
    ).toEqual({ kind: 'share_portfolio', label: 'Share portfolio', username: 'ada', context: 'portfolio' })
  })

  it.each([
    ['not published', { isPublished: false, username: 'ada', isPortfolioPublic: true }],
    ['on a private portfolio', { isPublished: true, username: 'ada', isPortfolioPublic: false }],
  ])('offers nothing when %s', (_label, payload) => {
    expect(action('capstone.reviewed', { moduleSlug: 'discovery', ...payload })).toBeNull()
  })
})

describe('fellow.granted', () => {
  it('shares the portfolio with Fellow wording when it is public', () => {
    expect(action('fellow.granted', { username: 'ada', isPortfolioPublic: true })).toEqual({
      kind: 'share_portfolio',
      label: 'Share portfolio',
      username: 'ada',
      context: 'fellow',
    })
  })

  it('asks to publish a private portfolio', () => {
    expect(action('fellow.granted', { username: 'ada', isPortfolioPublic: false })).toEqual({
      kind: 'link',
      label: 'Publish portfolio',
      href: '/settings?tab=portfolio',
    })
  })

  it.each([
    [{ username: 'ada', isPortfolioPublic: true }],
    [{ username: 'ada', isPortfolioPublic: false }],
    [{ username: null, isPortfolioPublic: true }],
  ])('never offers a LinkedIn credential or credential wording (%o)', (payload) => {
    const content = buildInAppContentFromEvent(envelope('fellow.granted', payload))
    expect(content.secondaryAction?.kind).not.toBe('linkedin_add_to_profile')
    expect(JSON.stringify(content)).not.toMatch(/certif|credential|profile\/add/i)
  })
})

describe('portfolio.published', () => {
  it('shares the portfolio', () => {
    expect(action('portfolio.published', { username: 'ada' })).toMatchObject({ kind: 'share_portfolio', username: 'ada' })
  })

  it('offers nothing without a username', () => {
    expect(action('portfolio.published', {})).toBeNull()
  })
})
