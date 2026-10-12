import type { PublicCapstoneItem, PublicPortfolioPayload } from '@/lib/portfolio-db'

/**
 * Single-capstone public page (Growth R5 / B13a). Pure helpers, kept apart from the route so the
 * visibility rule and the structured data are testable.
 *
 * Visibility: a capstone page exists only for a capstone the public portfolio itself shows
 * (portfolio public; submission submitted or reviewed, and public, i.e. not opted out — the same
 * rule getPublicPortfolioData applies). A submitted capstone does not wait for its review: the
 * owner decided on 2026-10-11 that it is public as soon as the portfolio and the capstone are.
 * Anything else is a 404, so the page reveals nothing the portfolio does not, not even whether a
 * private capstone exists.
 */
export function findPublicCapstone(
  portfolio: PublicPortfolioPayload | null,
  moduleSlug: string,
): PublicCapstoneItem | null {
  if (!portfolio || !portfolio.user.isPortfolioPublic) return null
  return portfolio.capstones.find((capstone) => capstone.moduleSlug === moduleSlug) ?? null
}

/** schema.org CreativeWork for the case study, authored by the portfolio's Person. */
export function buildCapstoneJsonLd(input: {
  capstone: PublicCapstoneItem
  authorName: string
  portfolioUrl: string
  pageUrl: string
  publisherName: string
}): Record<string, unknown> {
  const { capstone } = input
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: capstone.title,
    headline: capstone.title,
    genre: capstone.deliverableType,
    about: capstone.moduleTitle,
    url: input.pageUrl,
    datePublished: capstone.submittedAt,
    wordCount: capstone.wordCount,
    author: { '@type': 'Person', name: input.authorName, url: input.portfolioUrl },
    publisher: { '@type': 'Organization', name: input.publisherName },
    isPartOf: { '@type': 'ProfilePage', url: input.portfolioUrl },
  }
}
