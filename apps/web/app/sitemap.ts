import type { MetadataRoute } from 'next'
import fs from 'fs'
import path from 'path'

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
    const curriculumPath = path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'curriculum.json')
    if (fs.existsSync(curriculumPath)) {
      const raw = fs.readFileSync(curriculumPath, 'utf-8')
      const curriculum = JSON.parse(raw) as { lessons: { slug: string }[] }
      const lessonRoutes = curriculum.lessons.map((lesson) => ({
        url: `${siteUrl}/lessons/${lesson.slug}`,
        lastModified: new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      }))
      return [...staticRoutes, ...lessonRoutes]
    }
  } catch (err) {
    console.error('[sitemap] Error reading curriculum.json for dynamic sitemap:', err)
  }

  return staticRoutes
}
