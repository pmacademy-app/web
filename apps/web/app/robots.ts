import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/about',
          '/contact',
          '/privacy',
          '/terms',
          '/curriculum',
          '/waitlist',
          // 3 public sample lessons accessible to logged-out visitors
          '/academy/foundations/les_zoyq8a',
          '/academy/foundations/les_prrl23',
          '/academy/foundations/les_0q4aih',
        ],
        disallow: [
          '/dashboard',
          '/review',
          '/progress',
          '/settings',
          '/leaderboard',
          '/admin',
          '/onboarding',
          '/capstones',
          '/badges',
          '/p/',
          '/api/',
          // All authenticated academy routes (individual lessons not in sample set)
          '/academy/',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
