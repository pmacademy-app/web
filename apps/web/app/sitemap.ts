import type { MetadataRoute } from 'next'
import fs from 'fs'
import path from 'path'
import type { LessonMeta } from '@/types'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pmacademy.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
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
      url: `${siteUrl}/waitlist`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
  ]

  // Dynamically append all 90 lesson page routes
  try {
    const lessonsJsonPath = path.resolve(process.cwd(), 'public/content/lessons.json')
    if (fs.existsSync(lessonsJsonPath)) {
      const lessonsMeta: LessonMeta[] = JSON.parse(fs.readFileSync(lessonsJsonPath, 'utf-8'))
      const lessonRoutes = lessonsMeta.map((lesson) => ({
        url: `${siteUrl}/lessons/${lesson.slug}`,
        lastModified: new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      }))
      return [...staticRoutes, ...lessonRoutes]
    }
  } catch (err) {
    console.error('[sitemap] Error reading lessons.json for dynamic sitemap:', err)
  }

  return staticRoutes
}
