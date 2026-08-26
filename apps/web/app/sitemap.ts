import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
import { fetchCurriculumData } from '@/lib/lesson-loader'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

/**
 * Build-time sitemap.xml generation.
 *
 * Includes:
 *  - All public marketing pages
 *  - All 90 public lesson preview pages (/lessons/lesson-001 ... /lessons/lesson-090)
 *
 * Excludes:
 *  - All authenticated app routes (/dashboard, /settings, /admin, /academy, etc.)
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

  return [...marketingRoutes, ...lessonRoutes]
}
