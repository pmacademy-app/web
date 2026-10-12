import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  FULL_CURRICULUM_LESSON_COUNT,
  clampCertificateProgress,
  deriveCertificateState,
  derivePortfolioState,
  hasFullCurriculumCertificate,
} from '../dashboard/proof-card'
import { trackDashboardProofCardClicked } from '../analytics'

describe('derivePortfolioState', () => {
  it.each([
    [null, true, 'none'],
    [undefined, true, 'none'],
    ['', true, 'none'],
    ['   ', true, 'none'],
    ['   ', false, 'none'],
    ['jane-pm', true, 'public'],
    ['  jane-pm  ', true, 'public'],
    ['jane-pm', false, 'private'],
  ] as const)('username %j + public=%s → %s', (username, isPublic, expected) => {
    expect(derivePortfolioState(username, isPublic)).toBe(expected)
  })
})

describe('clampCertificateProgress', () => {
  it('requires 90 lessons for the full-curriculum certificate', () => {
    expect(FULL_CURRICULUM_LESSON_COUNT).toBe(90)
  })

  it.each([
    [0, 0],
    [45, 45],
    [90, 90],
    [91, 90],
    [120, 90],
    [-1, 0],
    [-3, 0],
    [12.9, 12],
    [89.99, 89],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 90],
    [Number.NEGATIVE_INFINITY, 0],
  ])('clamps %s → %s', (input, expected) => {
    expect(clampCertificateProgress(input)).toBe(expected)
  })
})

describe('deriveCertificateState', () => {
  it.each([
    [false, 0, 'not_started'],
    [false, -3, 'not_started'],
    [false, 0.5, 'not_started'],
    [false, Number.NaN, 'not_started'],
    [false, 1, 'in_progress'],
    [false, 45, 'in_progress'],
    [false, 89, 'in_progress'],
    [false, 89.99, 'in_progress'],
    [false, 90, 'ready'],
    [false, 120, 'ready'],
    [false, Number.POSITIVE_INFINITY, 'ready'],
    [true, 0, 'earned'],
    [true, 45, 'earned'],
    [true, 90, 'earned'],
    [true, 120, 'earned'],
  ] as const)('hasCertificate=%s, %s lessons → %s', (hasCertificate, lessons, expected) => {
    expect(deriveCertificateState(hasCertificate, lessons)).toBe(expected)
  })
})

describe('hasFullCurriculumCertificate', () => {
  it.each([
    ['undefined', undefined, false],
    ['null', null, false],
    ['an error', { data: null, error: { message: 'boom' } }, false],
    ['an error even with rows', { data: [{ id: 'c1' }], error: { message: 'boom' } }, false],
    ['data: null', { data: null, error: null }, false],
    ['data: []', { data: [], error: null }, false],
    ['data: [{ id }]', { data: [{ id: 'c1' }], error: null }, true],
    ['data: [{ id }] without an error key', { data: [{ id: 'c1' }] }, true],
  ] as const)('%s → %s', (_label, result, expected) => {
    expect(hasFullCurriculumCertificate(result as Parameters<typeof hasFullCurriculumCertificate>[0])).toBe(
      expected,
    )
  })
})

describe('trackDashboardProofCardClicked', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { gtag: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('dispatches dashboard_proof_card_clicked with exactly { action, portfolio_state } (no PII)', () => {
    trackDashboardProofCardClicked('share_portfolio', 'public')

    expect(window.gtag).toHaveBeenCalledTimes(1)
    const [kind, name, params] = (window.gtag as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(kind).toBe('event')
    expect(name).toBe('dashboard_proof_card_clicked')
    expect(params).toEqual({ action: 'share_portfolio', portfolio_state: 'public' })
    expect(Object.keys(params).sort()).toEqual(['action', 'portfolio_state'])
  })

  it('is a no-op when gtag is unavailable', () => {
    vi.stubGlobal('window', {})
    expect(() => trackDashboardProofCardClicked('view_certificates', 'none')).not.toThrow()
  })
})
