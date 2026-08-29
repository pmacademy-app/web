import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { createServiceRoleClient } from '@/lib/supabase'
import { getPublicPortfolioSitemapEntries } from '@/lib/portfolio-db'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl).replace(/\/$/, '')

/**
 * Dynamic XML sitemap generation.
 *
 * Includes:
 *  - All public marketing pages
 *  - All 90 public lesson preview pages (/lessons/lesson-001 ... /lessons/lesson-090)
 *  - All publicly accessible user portfolios (/p/[username])
 *
 * Excludes:
 *  - All private/unconfigured user portfolios (is_portfolio_public: false)
 *  - All authenticated/admin app routes (/dashboard, /settings, /admin, /academy, etc.)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketingRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/curriculum`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/frameworks`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const curriculum = await fetchCurriculumData()
  const lessonRoutes: MetadataRoute.Sitemap = (curriculum?.lessons ?? []).map((lesson) => ({
    url: `${siteUrl}/lessons/${lesson.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  let portfolioRoutes: MetadataRoute.Sitemap = []
  try {
    const supabase = createServiceRoleClient()
    const publicPortfolios = await getPublicPortfolioSitemapEntries(supabase)
    portfolioRoutes = publicPortfolios.map((entry) => ({
      url: `${siteUrl}/p/${encodeURIComponent(entry.username)}`,
      lastModified: entry.updatedAt
        ? new Date(entry.updatedAt)
        : entry.createdAt
        ? new Date(entry.createdAt)
        : new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    }))
  } catch (portfolioErr) {
    console.error('[sitemap] Error generating public portfolio routes:', portfolioErr)
  }

  return [...marketingRoutes, ...lessonRoutes, ...portfolioRoutes]
}

