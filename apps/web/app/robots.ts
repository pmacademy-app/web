import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const PUBLIC_ALLOW_PATHS = [
  '/',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/curriculum',
  '/frameworks',
  '/lessons/',
  '/glossary',
  '/p/',
  // Public OG image generator must stay crawlable even though /api/ is disallowed.
  '/api/og/',
]

export const PRIVATE_DISALLOW_PATHS = [
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
]

export const AI_CRAWLER_USER_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'PerplexityBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'cohere-ai',
] as const

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: PUBLIC_ALLOW_PATHS,
        disallow: PRIVATE_DISALLOW_PATHS,
      },
      ...AI_CRAWLER_USER_AGENTS.map((crawler) => ({
        userAgent: crawler,
        allow: PUBLIC_ALLOW_PATHS,
        disallow: PRIVATE_DISALLOW_PATHS,
      })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
