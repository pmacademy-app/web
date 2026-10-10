import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getPortfolioNavItem, PORTFOLIO_SETTINGS_HREF } from '../portfolio'
import { trackNavPortfolioClicked } from '../analytics'

describe('getPortfolioNavItem', () => {
  it('links a public portfolio to its public page, opened in a new tab', () => {
    expect(getPortfolioNavItem({ username: 'ada', isPortfolioPublic: true })).toEqual({
      label: 'My Portfolio',
      href: '/p/ada',
      external: true,
      state: 'public',
    })
  })

  it('points a private portfolio at the settings tab where it can be published', () => {
    expect(getPortfolioNavItem({ username: 'ada', isPortfolioPublic: false })).toEqual({
      label: 'Publish portfolio',
      href: '/settings?tab=portfolio',
      external: false,
      state: 'private',
    })
    expect(PORTFOLIO_SETTINGS_HREF).toBe('/settings?tab=portfolio')
  })

  it('treats a missing visibility flag as private (only an explicit true is public)', () => {
    expect(getPortfolioNavItem({ username: 'ada' })?.state).toBe('private')
    expect(getPortfolioNavItem({ username: 'ada', isPortfolioPublic: null })?.state).toBe('private')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])('returns null when the username is %s, whatever the visibility', (_name, username) => {
    expect(getPortfolioNavItem({ username, isPortfolioPublic: true })).toBeNull()
    expect(getPortfolioNavItem({ username, isPortfolioPublic: false })).toBeNull()
  })

  it('URL-encodes the username in the public href', () => {
    expect(getPortfolioNavItem({ username: 'a b/c?d#e', isPortfolioPublic: true })?.href).toBe(
      '/p/a%20b%2Fc%3Fd%23e'
    )
  })

  it('trims surrounding whitespace before building the href', () => {
    expect(getPortfolioNavItem({ username: '  ada  ', isPortfolioPublic: true })?.href).toBe('/p/ada')
  })
})

describe('trackNavPortfolioClicked', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { gtag: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('dispatches nav_portfolio_clicked with only state and surface (no PII)', () => {
    trackNavPortfolioClicked('public', 'sidebar')

    expect(window.gtag).toHaveBeenCalledTimes(1)
    expect(window.gtag).toHaveBeenCalledWith('event', 'nav_portfolio_clicked', {
      state: 'public',
      surface: 'sidebar',
    })
    const params = (window.gtag as ReturnType<typeof vi.fn>).mock.calls[0][2]
    expect(Object.keys(params).sort()).toEqual(['state', 'surface'])
  })

  it('passes the private state and drawer surface through unchanged', () => {
    trackNavPortfolioClicked('private', 'mobile_drawer')

    expect(window.gtag).toHaveBeenCalledWith('event', 'nav_portfolio_clicked', {
      state: 'private',
      surface: 'mobile_drawer',
    })
  })
})
