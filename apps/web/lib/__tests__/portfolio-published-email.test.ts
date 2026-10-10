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

// Growth R5 / B6, B7: proof nudge emails.
describe('proof nudge emails', () => {
  it.each([
    ['nudge.portfolio_ready', 'portfolio_ready', 'Publish my portfolio'],
    ['nudge.fellow_eligible', 'fellow_eligible', 'Request PM Fellow'],
  ])('%s renders its call to action and a reminder variant', async (key, nudge, cta) => {
    const first = await renderEmailTemplate(key, { userName: 'Jordan', nudge, isReminder: false, ctaUrl: 'https://prodily.example/settings?tab=portfolio' })
    expect(first.text).toContain(cta)
    expect(first.text).not.toContain('a quick reminder')
    const reminder = await renderEmailTemplate(key, { userName: 'Jordan', nudge, isReminder: true, ctaUrl: 'https://prodily.example/settings?tab=portfolio' })
    expect(reminder.text).toContain('a quick reminder')
    expect(first.text).not.toMatch(/certif|credential/i)
  })
})
