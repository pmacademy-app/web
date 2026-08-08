import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

/**
 * Build-time sitemap.xml generation.
 *
 * Includes:
 *  - All public marketing pages
 *  - The 3 public sample lessons accessible to logged-out visitors
 *
 * Excludes:
 *  - All authenticated app routes (/dashboard, /settings, /admin, etc.)
 *  - The remaining 87 auth-gated lessons (not indexable)
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // ── Marketing pages ────────────────────────────────────────────────────────
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

  // ── Public sample lessons (logged-out accessible) ──────────────────────────
  // Only the 3 lessons exempted in proxy.ts — the other 87 are auth-gated.
  const sampleLessonRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/academy/foundations/les_zoyq8a`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/academy/foundations/les_prrl23`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/academy/foundations/les_0q4aih`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]

  return [...marketingRoutes, ...sampleLessonRoutes]
}
