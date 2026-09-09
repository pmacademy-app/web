import { describe, it, expect } from 'vitest'
import { safeJsonLd, safeJsonStringify } from '../seo/safe-json-ld'
import { profileUpdateSchema } from '../../app/api/settings/profile/route'
import { generatePersonJsonLd, generateProfilePageJsonLd, validateOptionalUrl } from '../portfolio'

describe('B2: Public Portfolio XSS & Untrusted JSON-LD Serialization Security Suite', () => {
  describe('Safe JSON Serialization (safeJsonLd / safeJsonStringify)', () => {
    it('safeJsonStringify produces identical escaped JSON string to safeJsonLd', () => {
      const data = { x: '<test>&"hello"</test>' }
      expect(safeJsonStringify(data)).toBe(safeJsonLd(data))
    })

    it('prevents classic </script><script>alert(1)</script> injection breakout', () => {
      const payload = {
        name: 'Attacker</script><script>alert(1)</script>',
        bio: 'Legitimate bio </script><script>alert("xss")</script>',
      }

      const serialized = safeJsonLd(payload)

      // Invariant 1: No literal closing script tag
      expect(serialized.toLowerCase()).not.toContain('</script>')
      expect(serialized).not.toContain('</script>')
      expect(serialized).not.toContain('<script>')
      expect(serialized).not.toContain('<')
      expect(serialized).not.toContain('>')

      // Invariant 2: RFC 8259 Unicode escaping used
      expect(serialized).toContain('\\u003c')
      expect(serialized).toContain('\\u003e')

      // Invariant 3: JSON.parse reconstructs the exact original data structure and strings
      const parsed = JSON.parse(serialized)
      expect(parsed).toEqual(payload)
      expect(parsed.name).toBe('Attacker</script><script>alert(1)</script>')
      expect(parsed.bio).toBe('Legitimate bio </script><script>alert("xss")</script>')
    })

    it('prevents uppercase </SCRIPT> and mixed-case </ScRiPt> breakout vectors', () => {
      const uppercasePayload = { bio: 'Check this: </SCRIPT><script>alert(2)</script>' }
      const mixedCasePayload = { bio: 'Sneaky: </ScRiPt><script>alert(3)</SCRIPT>' }

      const serializedUpper = safeJsonLd(uppercasePayload)
      const serializedMixed = safeJsonLd(mixedCasePayload)

      expect(serializedUpper.toLowerCase()).not.toContain('</script>')
      expect(serializedUpper).not.toContain('</SCRIPT>')
      expect(serializedMixed.toLowerCase()).not.toContain('</script>')
      expect(serializedMixed).not.toContain('</ScRiPt>')

      expect(JSON.parse(serializedUpper)).toEqual(uppercasePayload)
      expect(JSON.parse(serializedMixed)).toEqual(mixedCasePayload)
    })

    it('prevents HTML tag injection payloads such as </script><img src=x onerror=alert(1)>', () => {
      const imgPayload = {
        name: 'John',
        bio: 'Portfolio </script><img src=x onerror=alert(1)>',
      }

      const serialized = safeJsonLd(imgPayload)

      expect(serialized.toLowerCase()).not.toContain('</script>')
      expect(serialized).not.toContain('<img')
      expect(serialized).not.toContain('>')
      expect(JSON.parse(serialized)).toEqual(imgPayload)
    })

    it('safely escapes <, >, &, U+2028, and U+2029 characters without altering JSON parsing', () => {
      const specialChars = {
        html: '<div class="test">& "quotes" & \'single\'</div>',
        lineSeparators: 'Line 1\u2028Line 2\u2029Line 3',
        symbols: 'A & B > C < D',
      }

      const serialized = safeJsonLd(specialChars)

      expect(serialized).not.toContain('<')
      expect(serialized).not.toContain('>')
      expect(serialized).not.toContain('&')
      expect(serialized).not.toContain('\u2028')
      expect(serialized).not.toContain('\u2029')

      const parsed = JSON.parse(serialized)
      expect(parsed).toEqual(specialChars)
      expect(parsed.html).toBe('<div class="test">& "quotes" & \'single\'</div>')
      expect(parsed.lineSeparators).toBe('Line 1\u2028Line 2\u2029Line 3')
      expect(parsed.symbols).toBe('A & B > C < D')
    })

    it('preserves normal portfolio bio text, formatting, newlines, and unicode emojis', () => {
      const normalProfile = {
        name: "Renée O'Connor-Smith",
        bio: 'Lead Product Manager at Acme Corp 🚀\nBuilding AI-driven workflows & customer platforms.\nContact me: test@example.com',
        website: 'https://example.com/~renee?ref=portfolio&lang=en_US',
      }

      const serialized = safeJsonLd(normalProfile)
      const parsed = JSON.parse(serialized)

      expect(parsed).toEqual(normalProfile)
      expect(parsed.name).toBe("Renée O'Connor-Smith")
      expect(parsed.bio).toContain('🚀')
      expect(parsed.bio).toContain('\n')
      expect(parsed.website).toBe('https://example.com/~renee?ref=portfolio&lang=en_US')
    })
  })

  describe('End-to-End Person & ProfilePage JSON-LD Schemas with Malicious Payloads', () => {
    it('produces safe Person JSON-LD when attacker supplies XSS vectors in profile fields', () => {
      const maliciousOptions = {
        name: 'Evil User </script><script>alert("name")</script>',
        username: 'attacker',
        bio: 'Evil Bio </script><svg onload=alert(1)> & special characters < > &',
        avatarUrl: 'https://example.com/avatar.jpg',
        linkedinUrl: 'https://linkedin.com/in/attacker',
        githubUrl: 'https://github.com/attacker',
        websiteUrl: 'https://attacker.io',
        siteOrigin: 'https://prodily.adityagangwani.me',
      }

      const personSchema = generatePersonJsonLd(maliciousOptions)
      const serialized = safeJsonLd(personSchema)

      expect(serialized.toLowerCase()).not.toContain('</script>')
      expect(serialized).not.toContain('<')
      expect(serialized).not.toContain('>')
      expect(serialized).not.toContain('&')

      const parsed = JSON.parse(serialized)
      expect(parsed['@context']).toBe('https://schema.org')
      expect(parsed['@type']).toBe('Person')
      expect(parsed.name).toBe('Evil User </script><script>alert("name")</script>')
      expect(parsed.description).toBe('Evil Bio </script><svg onload=alert(1)> & special characters < > &')
    })

    it('produces safe ProfilePage JSON-LD when user-controlled nested fields contain injection attempts', () => {
      const profilePageSchema = generateProfilePageJsonLd({
        name: 'Hacker </script><script>alert(1)</script>',
        username: 'hacker',
        bio: 'Bio </script><iframe src="javascript:alert(1)">',
        avatarUrl: null,
        linkedinUrl: 'https://linkedin.com/in/hacker',
        githubUrl: 'https://github.com/hacker',
        websiteUrl: 'https://hacker.io',
        isFellow: false,
        siteOrigin: 'https://prodily.adityagangwani.me',
      })

      const serialized = safeJsonLd(profilePageSchema)

      expect(serialized.toLowerCase()).not.toContain('</script>')
      expect(serialized).not.toContain('<')
      expect(serialized).not.toContain('>')
      expect(serialized).not.toContain('&')

      const parsed = JSON.parse(serialized)
      expect(parsed['@type']).toBe('ProfilePage')
      expect((parsed.mainEntity as { name: string }).name).toBe('Hacker </script><script>alert(1)</script>')
    })
  })

  describe('Profile Settings Input & URL Validation (Boundary Hardening)', () => {
    it('accepts valid profile update with legitimate HTTP/HTTPS URLs and string lengths', () => {
      const validPayload = {
        name: 'Alex Morgan',
        bio: 'Product manager interested in AI and design systems.',
        linkedin_url: 'https://www.linkedin.com/in/alexmorgan',
        github_url: 'https://github.com/alexmorgan',
        website_url: 'https://alexmorgan.dev',
      }

      const result = profileUpdateSchema.safeParse(validPayload)
      expect(result.success).toBe(true)
    })

    it('rejects dangerous URL schemes such as javascript:, data:, and vbscript:', () => {
      const dangerousLinkedin = profileUpdateSchema.safeParse({
        linkedin_url: 'javascript:alert(document.cookie)',
      })
      expect(dangerousLinkedin.success).toBe(false)
      if (!dangerousLinkedin.success) {
        expect(dangerousLinkedin.error.issues[0]?.message).toContain('http:// or https://')
      }

      const dangerousGithub = profileUpdateSchema.safeParse({
        github_url: 'data:text/html,<script>alert(1)</script>',
      })
      expect(dangerousGithub.success).toBe(false)

      const dangerousWebsite = profileUpdateSchema.safeParse({
        website_url: 'vbscript:msgbox("hello")',
      })
      expect(dangerousWebsite.success).toBe(false)
    })

    it('rejects excessively long strings exceeding security limits', () => {
      const longName = profileUpdateSchema.safeParse({
        name: 'A'.repeat(101),
      })
      expect(longName.success).toBe(false)
      if (!longName.success) {
        expect(longName.error.issues[0]?.message).toContain('100 characters or fewer')
      }

      const longBio = profileUpdateSchema.safeParse({
        bio: 'B'.repeat(501),
      })
      expect(longBio.success).toBe(false)
      if (!longBio.success) {
        expect(longBio.error.issues[0]?.message).toContain('500 characters or fewer')
      }

      const longUrl = profileUpdateSchema.safeParse({
        website_url: `https://example.com/${'c'.repeat(500)}`,
      })
      expect(longUrl.success).toBe(false)
      if (!longUrl.success) {
        expect(longUrl.error.issues[0]?.message).toContain('500 characters or fewer')
      }
    })

    it('allows null and empty string optional fields gracefully', () => {
      const emptyPayload = {
        name: null,
        bio: null,
        linkedin_url: null,
        github_url: null,
        website_url: null,
      }

      const result = profileUpdateSchema.safeParse(emptyPayload)
      expect(result.success).toBe(true)
    })
  })

  describe('validateOptionalUrl Protocol Verification', () => {
    it('accepts legitimate https and http URLs', () => {
      expect(validateOptionalUrl('https://example.com')).toBe(true)
      expect(validateOptionalUrl('http://localhost:3000/profile')).toBe(true)
      expect(validateOptionalUrl('https://sub.domain.co.uk/path?a=1&b=2#section')).toBe(true)
    })

    it('rejects malformed and non-http/https URLs', () => {
      expect(validateOptionalUrl('javascript:alert(1)')).toBe(false)
      expect(validateOptionalUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false)
      expect(validateOptionalUrl('vbscript:alert(1)')).toBe(false)
      expect(validateOptionalUrl('file:///etc/passwd')).toBe(false)
      expect(validateOptionalUrl('//evil.com')).toBe(false)
      expect(validateOptionalUrl('not-a-url')).toBe(false)
    })

    it('handles empty and null inputs as valid non-provided values', () => {
      expect(validateOptionalUrl('')).toBe(true)
      expect(validateOptionalUrl('   ')).toBe(true)
      expect(validateOptionalUrl(null)).toBe(true)
      expect(validateOptionalUrl(undefined)).toBe(true)
    })
  })
})
