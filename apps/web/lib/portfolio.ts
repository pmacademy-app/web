/**
 * Pure Portfolio Utilities & Validation (Phase 3 Sprint 2)
 *
 * Provides username validation, URL validation, and Person JSON-LD schema generation for SEO.
 * Zero UI coupling.
 */

export interface PersonJsonLdOptions {
  name: string
  username: string
  title: string
  bio?: string | null
  avatarUrl?: string | null
  linkedinUrl?: string | null
  githubUrl?: string | null
  websiteUrl?: string | null
  siteOrigin: string
}

/**
 * Validates portfolio username format.
 * Must be 3–30 characters, alphanumeric, hyphens, or underscores only.
 */
export function validateUsername(username: string): { isValid: boolean; reason?: string } {
  if (!username || typeof username !== 'string') {
    return { isValid: false, reason: 'Username cannot be empty.' }
  }

  const trimmed = username.trim()
  if (trimmed.length < 3 || trimmed.length > 30) {
    return { isValid: false, reason: 'Username must be between 3 and 30 characters.' }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { isValid: false, reason: 'Username can only contain letters, numbers, hyphens, and underscores.' }
  }

  // Excluded reserved words
  const reserved = ['admin', 'api', 'app', 'settings', 'curriculum', 'academy', 'login', 'signup', 'dashboard', 'capstones']
  if (reserved.includes(trimmed.toLowerCase())) {
    return { isValid: false, reason: 'This username is reserved.' }
  }

  return { isValid: true }
}

/**
 * Validates an optional URL input (must start with http:// or https:// if provided).
 */
export function validateOptionalUrl(url?: string | null): boolean {
  if (!url || !url.trim()) return true
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Generates schema.org Person JSON-LD for public portfolio SEO.
 */
export function generatePersonJsonLd({
  name,
  username,
  title,
  bio,
  avatarUrl,
  linkedinUrl,
  githubUrl,
  websiteUrl,
  siteOrigin,
}: PersonJsonLdOptions): Record<string, unknown> {
  const profileUrl = `${siteOrigin.replace(/\/$/, '')}/p/${username}`
  const sameAs: string[] = []

  if (linkedinUrl && validateOptionalUrl(linkedinUrl)) sameAs.push(linkedinUrl)
  if (githubUrl && validateOptionalUrl(githubUrl)) sameAs.push(githubUrl)
  if (websiteUrl && validateOptionalUrl(websiteUrl)) sameAs.push(websiteUrl)

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: name || username,
    alternateName: username,
    jobTitle: title,
    description: bio || `${name || username}'s Product Management portfolio and skill radar on Prodigy PM Academy.`,
    url: profileUrl,
    image: avatarUrl || undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    worksFor: {
      '@type': 'Organization',
      name: 'PM Academy Learner',
    },
  }
}

/**
 * Generates full share URL for portfolio.
 */
export function formatPortfolioShareUrl(siteOrigin: string, username: string): string {
  const origin = siteOrigin.replace(/\/$/, '')
  return `${origin}/p/${encodeURIComponent(username)}`
}
