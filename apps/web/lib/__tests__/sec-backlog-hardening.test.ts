/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import * as fs from 'fs'
import * as path from 'path'
import MarkdownRenderer from '@/components/ui/MarkdownRenderer'
import { isValidAvatarUrl } from '@/lib/avatar/avatar-service'

describe('AG-33: Security Backlog Hardening', () => {
  describe('SEC-14: HTML Sanitization (MarkdownRenderer & Code Fences)', () => {
    it('strips script tags from markdown content', () => {
      const maliciousContent = '# Hello\n\n<script>alert("xss")</script>\n\nWelcome to Prodily.'
      const html = renderToString(React.createElement(MarkdownRenderer, { content: maliciousContent }))
      expect(html).not.toContain('<script>')
      expect(html).not.toContain('alert("xss")')
      expect(html).toContain('Welcome to Prodily.')
    })

    it('strips onerror and other event handler attributes from HTML elements', () => {
      const payload = 'Here is an image: <img src="invalid-image" onerror="alert(1)" alt="test" />'
      const html = renderToString(React.createElement(MarkdownRenderer, { content: payload }))
      expect(html).not.toContain('onerror')
      expect(html).toContain('src="invalid-image"')
      expect(html).toContain('alt="test"')
    })

    it('sanitizes javascript: URLs in markdown links', () => {
      const linkPayload = '[Click here](javascript:alert("pwned"))'
      const html = renderToString(React.createElement(MarkdownRenderer, { content: linkPayload }))
      expect(html).not.toContain('javascript:alert')
    })

    it('escapes code fence language tags to prevent attribute breakout', () => {
      const codeFence = '```"><script>alert(1)</script>\nconst x = 1\n```'
      const html = renderToString(React.createElement(MarkdownRenderer, { content: codeFence }))
      expect(html).not.toContain('<script>alert(1)</script>')
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })
  })

  describe('SEC-13: Avatar Storage URL Allow-list', () => {
    const supabaseUrl = 'https://myproject.supabase.co'

    it('allows null, undefined, and empty string', () => {
      expect(isValidAvatarUrl(null, supabaseUrl)).toBe(true)
      expect(isValidAvatarUrl(undefined, supabaseUrl)).toBe(true)
      expect(isValidAvatarUrl('', supabaseUrl)).toBe(true)
      expect(isValidAvatarUrl('   ', supabaseUrl)).toBe(true)
    })

    it('allows relative storage paths within avatars bucket', () => {
      expect(isValidAvatarUrl('usr-123/avatar-1.jpg', supabaseUrl)).toBe(true)
      expect(isValidAvatarUrl('avatars/usr-123/avatar-1.jpg', supabaseUrl)).toBe(true)
    })

    it('rejects relative paths with directory traversal', () => {
      expect(isValidAvatarUrl('../secrets/file.txt', supabaseUrl)).toBe(false)
      expect(isValidAvatarUrl('avatars/../../etc/passwd', supabaseUrl)).toBe(false)
      expect(isValidAvatarUrl('/absolute/path.png', supabaseUrl)).toBe(false)
    })

    it('allows valid URLs on authorized Supabase storage host and avatars path', () => {
      const validUrl = 'https://myproject.supabase.co/storage/v1/object/public/avatars/usr-123/avatar.jpg'
      expect(isValidAvatarUrl(validUrl, supabaseUrl)).toBe(true)
    })

    it('rejects foreign domains', () => {
      expect(isValidAvatarUrl('https://evil.example.com/avatar.jpg', supabaseUrl)).toBe(false)
      expect(isValidAvatarUrl('http://insecure.example.com/avatar.jpg', supabaseUrl)).toBe(false)
      expect(isValidAvatarUrl('https://attacker-supabase.co/storage/v1/object/public/avatars/pic.jpg', supabaseUrl)).toBe(false)
    })

    it('rejects foreign storage buckets on Supabase host', () => {
      const foreignBucket = 'https://myproject.supabase.co/storage/v1/object/public/private-resumes/doc.pdf'
      expect(isValidAvatarUrl(foreignBucket, supabaseUrl)).toBe(false)
    })
  })

  describe('SEC-18: Environment Variable Protection in .gitignore', () => {
    it('ignores all .env* files while explicitly keeping .env.example', () => {
      const gitignorePath = path.resolve(__dirname, '../../../../.gitignore')
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')

      expect(gitignoreContent).toMatch(/^\.env\*$/m)
      expect(gitignoreContent).toMatch(/^!\.env\.example$/m)
    })
  })
})
