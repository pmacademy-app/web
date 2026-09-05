import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitizes admin-pasted HTML before it is persisted as an email template.
 *
 * Admin-authored template HTML is treated as untrusted input per the Admin
 * Broadcast System security requirements: even though the admin console's own
 * preview renders it inside a fully sandboxed iframe (`sandbox=""`, blocking
 * script execution there), the SAME html is later sent as a real email — a
 * context with no sandbox. Stripping scripts/handlers/dangerous elements at
 * save time keeps the stored template safe regardless of where it is later
 * rendered (preview, test-send, or the actual recipient's inbox).
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return ''

  return DOMPurify.sanitize(rawHtml, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'base', 'meta'],
    FORBID_ATTR: ['srcdoc', 'formaction'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  })
}
