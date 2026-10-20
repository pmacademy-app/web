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
          '/frameworks',
          '/lessons/',
          '/p/',
          // Public OG image generator must stay crawlable even though /api/ is disallowed.
          '/api/og/',
        ],
        disallow: [
          '/dashboard',
          // `$` anchors the match so the public /reviews page stays crawlable.
          '/review$',
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
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
