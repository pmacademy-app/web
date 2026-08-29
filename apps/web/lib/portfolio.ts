/**
 * Pure Portfolio Utilities & Validation (Phase 3 Sprint 2)
 *
 * Provides username validation, URL validation, and Person JSON-LD schema generation for SEO.
 * Zero UI coupling.
 */

export interface PersonJsonLdOptions {
  name: string
  username: string
  title?: string
  bio?: string | null
  avatarUrl?: string | null
  linkedinUrl?: string | null
  githubUrl?: string | null
  websiteUrl?: string | null
  siteOrigin: string
  isFellow?: boolean
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
  bio,
  avatarUrl,
  linkedinUrl,
  githubUrl,
  websiteUrl,
  siteOrigin,
  isFellow,
}: PersonJsonLdOptions): Record<string, unknown> {
  const profileUrl = `${siteOrigin.replace(/\/$/, '')}/p/${username}`
  const sameAs: string[] = []

  if (linkedinUrl && linkedinUrl.trim() && validateOptionalUrl(linkedinUrl)) {
    sameAs.push(linkedinUrl.trim())
  }
  if (githubUrl && githubUrl.trim() && validateOptionalUrl(githubUrl)) {
    sameAs.push(githubUrl.trim())
  }
  if (websiteUrl && websiteUrl.trim() && validateOptionalUrl(websiteUrl)) {
    sameAs.push(websiteUrl.trim())
  }

  const person: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: name || username,
    alternateName: username,
    description: bio || `${name || username}'s Product Management portfolio and skill radar on Prodily PM Academy.`,
    url: profileUrl,
  }

  if (avatarUrl) {
    person.image = avatarUrl
  }

  if (sameAs.length > 0) {
    person.sameAs = sameAs
  }

  if (isFellow) {
    person.jobTitle = 'Product Management Fellow'
  }

  return person
}

/**
 * Generates full share URL for portfolio.
 */
export function formatPortfolioShareUrl(siteOrigin: string, username: string): string {
  const origin = siteOrigin.replace(/\/$/, '')
  return `${origin}/p/${encodeURIComponent(username)}`
}

/**
 * Generates schema.org ProfilePage + Person JSON-LD for public portfolio SEO.
 * Conforms to Schema.org ProfilePage standard with nested mainEntity Person.
 */
export function generateProfilePageJsonLd(options: PersonJsonLdOptions): Record<string, unknown> {
  const profileUrl = formatPortfolioShareUrl(options.siteOrigin, options.username)
  const personProps = { ...generatePersonJsonLd(options) }
  delete personProps['@context']

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${profileUrl}#profilepage`,
    url: profileUrl,
    name: options.isFellow
      ? `${options.name || options.username} — Product Management Fellow at Prodily | Portfolio`
      : `${options.name || options.username} — Product Portfolio`,
    mainEntity: {
      ...personProps,
      '@id': `${profileUrl}#person`,
    },
  }
}

