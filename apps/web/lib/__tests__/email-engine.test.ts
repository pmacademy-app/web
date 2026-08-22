import { describe, it, expect } from 'vitest'
import { renderEmailTemplate } from '../../emails'

describe('Email Engine & Delivery Unit Test Suite', () => {
  it('renderEmailTemplate compiles React Email components to HTML and plain text', async () => {
    const rendered = await renderEmailTemplate('auth.welcome', { userName: 'Sarah' })
    expect(rendered.html).toContain('Prodily')
    expect(rendered.html).toContain('Welcome to Prodily, Sarah!')
    expect(rendered.text).toContain('Welcome to Prodily')
    expect(rendered.subject).toContain('Welcome to Prodily')

    const badgeRendered = await renderEmailTemplate('achievement.badge_earned', {
      userName: 'Sarah',
      badgeName: 'First Step',
      badgeDescription: 'Completed 1st lesson',
    })
    expect(badgeRendered.subject).toContain('First Step')
    expect(badgeRendered.html).toContain('First Step')
  }, 15000)
})
