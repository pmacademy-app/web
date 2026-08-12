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
          '/lessons/',
          '/p/',
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
          '/api/',
          '/academy/',
          '/login',
          '/app',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
