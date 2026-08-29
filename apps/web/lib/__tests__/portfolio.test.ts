import { describe, it, expect } from 'vitest'
import {
  validateUsername,
  validateOptionalUrl,
  generatePersonJsonLd,
  formatPortfolioShareUrl,
} from '../portfolio'

describe('Public Portfolio Unit Test Suite', () => {
  describe('Username Validation', () => {
    it('validateUsername accepts valid usernames', () => {
      expect(validateUsername('johndoe').isValid).toBe(true)
      expect(validateUsername('john_doe_99').isValid).toBe(true)
      expect(validateUsername('pm-leader').isValid).toBe(true)
    })

    it('validateUsername rejects invalid or short/long usernames', () => {
      expect(validateUsername('ab').isValid).toBe(false)
      expect(validateUsername('a'.repeat(35)).isValid).toBe(false)
      expect(validateUsername('john@doe!').isValid).toBe(false)
      expect(validateUsername('admin').isValid).toBe(false)
      expect(validateUsername('settings').isValid).toBe(false)
    })
  })

  describe('URL Validation', () => {
    it('validateOptionalUrl validates HTTP and HTTPS URLs', () => {
      expect(validateOptionalUrl('https://linkedin.com/in/johndoe')).toBe(true)
      expect(validateOptionalUrl('http://mywebsite.com')).toBe(true)
      expect(validateOptionalUrl('')).toBe(true)
      expect(validateOptionalUrl(null)).toBe(true)
      expect(validateOptionalUrl('ftp://invalid-protocol.com')).toBe(false)
      expect(validateOptionalUrl('not-a-url')).toBe(false)
    })
  })

  describe('Person Schema JSON-LD Generation', () => {
    it('generatePersonJsonLd generates valid schema.org Person structured data without unsupported jobTitle or worksFor', () => {
      const jsonLd = generatePersonJsonLd({
        name: 'Alex Rivera',
        username: 'arivera',
        bio: 'Product Manager building SaaS platforms.',
        avatarUrl: 'https://example.com/avatar.jpg',
        linkedinUrl: 'https://linkedin.com/in/arivera',
        githubUrl: 'https://github.com/arivera',
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(jsonLd['@context']).toBe('https://schema.org')
      expect(jsonLd['@type']).toBe('Person')
      expect(jsonLd.name).toBe('Alex Rivera')
      expect(jsonLd.url).toBe('https://prodily.adityagangwani.me/p/arivera')
      expect(jsonLd.worksFor).toBeUndefined()
      expect(jsonLd.jobTitle).toBeUndefined()
      expect(Array.isArray(jsonLd.sameAs)).toBe(true)
      expect((jsonLd.sameAs as string[]).length).toBe(2)
    })

    it('generatePersonJsonLd uses factual fallback description without verified claims when bio is missing', () => {
      const jsonLd = generatePersonJsonLd({
        name: 'Jordan Lee',
        username: 'jordanl',
        bio: null,
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      expect(jsonLd.description).toBe("Jordan Lee's Product Management portfolio and skill radar on Prodily PM Academy.")
      expect((jsonLd.description as string).toLowerCase()).not.toContain('verified')
      expect(jsonLd.worksFor).toBeUndefined()
      expect(jsonLd.jobTitle).toBeUndefined()
    })
  })

  describe('Share URL Formatting', () => {
    it('formatPortfolioShareUrl returns clean canonical URL', () => {
      const url = formatPortfolioShareUrl('https://prodily.adityagangwani.me/', 'arivera')
      expect(url).toBe('https://prodily.adityagangwani.me/p/arivera')
    })
  })
})
