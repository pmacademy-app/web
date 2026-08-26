import { describe, it, expect, vi, beforeEach } from 'vitest'
import { interpolateVariables, stripHtmlToPlainText, renderEmailTemplate } from '@/emails'

describe('Admin Template Studio & Production Renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('interpolateVariables helper', () => {
    it('correctly replaces {{variableName}} tokens', () => {
      const template = 'Hello {{userName}}, you have {{streakDays}} streak days on {{appName}}!'
      const variables = { userName: 'Aditya', streakDays: 14, appName: 'Prodily' }
      const output = interpolateVariables(template, variables)
      expect(output).toBe('Hello Aditya, you have 14 streak days on Prodily!')
    })

    it('safely handles missing or undefined variables by replacing with empty string', () => {
      const template = 'Welcome {{userName}}! Your referral code is {{missingKey}}.'
      const variables = { userName: 'Aditya' }
      const output = interpolateVariables(template, variables)
      expect(output).toBe('Welcome Aditya! Your referral code is .')
    })

    it('handles whitespace within variable braces {{ var }}', () => {
      const template = 'Hi {{  userName  }}, confirm at {{ link }}'
      const variables = { userName: 'TestUser', link: 'https://prodily.me/verify' }
      const output = interpolateVariables(template, variables)
      expect(output).toBe('Hi TestUser, confirm at https://prodily.me/verify')
    })
  })

  describe('stripHtmlToPlainText helper', () => {
    it('strips HTML tags and script/style content', () => {
      const html = `
        <style>body { color: red; }</style>
        <h1>Welcome</h1>
        <p>This is a <strong>test</strong> email.</p>
        <script>console.log('secret')</script>
      `
      const text = stripHtmlToPlainText(html)
      expect(text).toBe('Welcome This is a test email.')
    })
  })

  describe('renderEmailTemplate fallback precedence', () => {
    it('falls back to static React Email component when no published template is in DB', async () => {
      const rendered = await renderEmailTemplate('auth.welcome', {
        userName: 'Alex',
      })
      expect(rendered.html).toContain('Alex')
      expect(rendered.subject).toBeTruthy()
      expect(rendered.text).toBeTruthy()
    })

    it('throws when unregistered template key is requested', async () => {
      await expect(renderEmailTemplate('unknown.invalid_key', {})).rejects.toThrow(
        /not registered in EMAIL_TEMPLATE_MAP/
      )
    })
  })
})
