import { describe, it, expect } from 'vitest'
import { renderEmailTemplate } from '../../emails'

describe('Email Engine & Delivery Unit Test Suite', () => {
  it('renderEmailTemplate compiles React Email components to HTML and plain text', async () => {
    const rendered = await renderEmailTemplate('auth.welcome', { userName: 'Sarah' })
    expect(rendered.html).toContain('Prodily PM Academy')
    expect(rendered.html).toContain('Welcome to Prodily PM Academy, Sarah!')
    expect(rendered.text).toContain('Welcome to Prodily PM Academy')
    expect(rendered.subject).toContain('Welcome to PM Academy')

    const badgeRendered = await renderEmailTemplate('achievement.badge_earned', {
      userName: 'Sarah',
      badgeName: 'First Step',
      badgeDescription: 'Completed 1st lesson',
    })
    expect(badgeRendered.subject).toContain('First Step')
    expect(badgeRendered.html).toContain('First Step')
  })
})
