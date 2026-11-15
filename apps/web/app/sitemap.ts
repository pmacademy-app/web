import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
import { STATIC_PAGE_DATES } from '@/config/content'
import { FRAMEWORK_DETAILS } from '@/config/frameworks'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { createServiceRoleClient } from '@/lib/supabase'
import { getPublicPortfolioSitemapEntries } from '@/lib/portfolio-db'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl).replace(/\/$/, '')

/**
 * Dynamic XML sitemap generation.
 *
 * Includes:
 *  - All public marketing pages with committed lastModified dates
 *  - All 10 detailed framework pages (/frameworks/[slug])
 *  - The comprehensive product management glossary hub (/glossary)
 *  - All 90 public lesson preview pages (/lessons/lesson-001 ... /lessons/lesson-090) with real updatedAt
 *  - All publicly accessible user portfolios (/p/[username]) and public capstone case studies (/p/[username]/capstones/[moduleSlug])
 *
 * Excludes:
 *  - All private/unconfigured user portfolios (is_portfolio_public: false)
 *  - All authenticated/admin app routes (/dashboard, /settings, /admin, /academy, etc.)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketingRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(STATIC_PAGE_DATES.home),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/curriculum`,
      lastModified: new Date(STATIC_PAGE_DATES.curriculum),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/frameworks`,
      lastModified: new Date(STATIC_PAGE_DATES.frameworks),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/glossary`,
      lastModified: new Date(STATIC_PAGE_DATES.glossary),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/faq`,
      lastModified: new Date(STATIC_PAGE_DATES.faq),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/reviews`,
      lastModified: new Date(STATIC_PAGE_DATES.reviews),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: new Date(STATIC_PAGE_DATES.about),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/contact`,
      lastModified: new Date(STATIC_PAGE_DATES.contact),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date(STATIC_PAGE_DATES.privacy),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: new Date(STATIC_PAGE_DATES.terms),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const frameworkRoutes: MetadataRoute.Sitemap = FRAMEWORK_DETAILS.map((fw) => ({
    url: `${siteUrl}/frameworks/${fw.slug}`,
    lastModified: new Date(fw.updatedAt),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const curriculum = await fetchCurriculumData()
  const lessonRoutes: MetadataRoute.Sitemap = (curriculum?.lessons ?? []).map((lesson) => ({
    url: `${siteUrl}/lessons/${lesson.slug}`,
    lastModified: lesson.updatedAt ? new Date(lesson.updatedAt) : new Date('2026-10-31'),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const portfolioRoutes: MetadataRoute.Sitemap = []
  try {
    const supabase = createServiceRoleClient()
    const publicPortfolios = await getPublicPortfolioSitemapEntries(supabase)
    for (const entry of publicPortfolios) {
      portfolioRoutes.push({
        url: `${siteUrl}/p/${encodeURIComponent(entry.username.toLowerCase())}`,
        lastModified: entry.updatedAt
          ? new Date(entry.updatedAt)
          : entry.createdAt
          ? new Date(entry.createdAt)
          : new Date('2026-10-31'),
        changeFrequency: 'weekly',
        priority: 0.6,
      })

      if (entry.capstones) {
        for (const cap of entry.capstones) {
          portfolioRoutes.push({
            url: `${siteUrl}/p/${encodeURIComponent(entry.username.toLowerCase())}/capstones/${encodeURIComponent(cap.moduleSlug)}`,
            lastModified: new Date(cap.submittedAt),
            changeFrequency: 'monthly',
            priority: 0.5,
          })
        }
      }
    }
  } catch (portfolioErr) {
    console.error('[sitemap] Error generating public portfolio routes:', portfolioErr)
  }

  return [...marketingRoutes, ...frameworkRoutes, ...lessonRoutes, ...portfolioRoutes]
}

