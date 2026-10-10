import { describe, it, expect } from 'vitest'
import { renderEmailTemplate } from '@/emails'
import { buildPortfolioShareIntents, portfolioShareText } from '@/lib/portfolio'

// Growth R5 / B3: the portfolio-published email offers one-click LinkedIn and X shares, tagged
// so visits from those posts can be attributed.

const PORTFOLIO = 'https://prodily.example/p/jordanpm'

describe('buildPortfolioShareIntents', () => {
  const intents = buildPortfolioShareIntents(PORTFOLIO, "Jordan's Product Management portfolio on Prodily", 'test_campaign')

  it('builds a LinkedIn share-offsite link to the UTM-tagged portfolio', () => {
    const url = new URL(intents.linkedin)
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/sharing/share-offsite/')
    const shared = new URL(url.searchParams.get('url')!)
    expect(shared.origin + shared.pathname).toBe(PORTFOLIO)
    expect(Object.fromEntries(shared.searchParams)).toEqual({
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: 'test_campaign',
    })
  })

  it('builds an X intent with the share text and the UTM-tagged portfolio', () => {
    const url = new URL(intents.x)
    expect(url.origin + url.pathname).toBe('https://twitter.com/intent/tweet')
    expect(url.searchParams.get('text')).toBe("Jordan's Product Management portfolio on Prodily")
    expect(new URL(url.searchParams.get('url')!).searchParams.get('utm_source')).toBe('x')
  })

  it('shares the same third-person text as the portfolio page', () => {
    expect(portfolioShareText('Jordan', 'Prodily PM Academy')).toBe("Jordan's Product Management portfolio on Prodily PM Academy")
  })
})

describe('PortfolioPublished email', () => {
  it('renders LinkedIn and X share links in place of the prose nudge', async () => {
    const { html, text } = await renderEmailTemplate('achievement.portfolio_published', {
      userName: 'Jordan PM',
      username: 'jordanpm',
      portfolioUrl: PORTFOLIO,
    })

    expect(text).toContain('Share on LinkedIn')
    expect(text).toContain('Share on X')
    expect(html).toContain('https://www.linkedin.com/sharing/share-offsite/?url=')
    expect(html).toContain('https://twitter.com/intent/tweet?text=')
    expect(html).toContain(encodeURIComponent('utm_campaign=portfolio_published_email'))
    expect(text).not.toContain('Share your public portfolio link on LinkedIn, Twitter')
  })
})

// Growth R5 / B4: the badge email shares only a public portfolio.
describe('BadgeEarned email', () => {
  it('offers LinkedIn and X shares with the badge wording for a public portfolio', async () => {
    const { html, text } = await renderEmailTemplate('achievement.badge_earned', {
      userName: 'Jordan',
      badgeName: 'Module Master',
      badgeDescription: 'Finished a module',
      portfolioUrl: PORTFOLIO,
    })
    expect(text).toContain('Share on LinkedIn')
    expect(html).toContain(encodeURIComponent('I just earned the "Module Master" badge'))
    expect(html).toContain(encodeURIComponent('utm_campaign=badge_earned_email'))
  })

  it('asks to publish instead when the portfolio is private', async () => {
    const { text } = await renderEmailTemplate('achievement.badge_earned', {
      userName: 'Jordan',
      badgeName: 'Module Master',
      badgeDescription: 'Finished a module',
      portfolioUrl: null,
    })
    expect(text).not.toContain('Share on LinkedIn')
    expect(text).toContain('Make your portfolio public')
  })
})
