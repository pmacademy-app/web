---
name: pm-academy-seo-performance
description: >
  PM Academy SEO and performance skill. Covers technical SEO, structured data,
  Lighthouse optimization, and the organic growth strategy for the lesson pages.
  Triggers on: SEO tasks, meta tags, structured data, Lighthouse scores, performance
  optimization, sitemap, robots.txt, or public-facing marketing/lesson page work.
---

# PM Academy — SEO & Performance

Load `00-pm-academy-core` alongside this skill.

---

## 1. Why SEO Matters Here

The 90 lesson topics map 1:1 to real search queries:
- "what is a PRD"
- "jobs to be done framework explained"
- "product-led growth definition"
- "what is product management"
- "user story vs job story"

Public lesson pages targeting these terms are the **largest organic acquisition channel by month 6–12**, even at near-zero launch-week contribution. This is a slow-compounding channel — treat every lesson page as a long-term SEO asset.

---

## 2. Technical SEO Requirements

### Every public page must have:
```typescript
// app/(marketing)/lessons/[slug]/page.tsx — example metadata
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const lesson = await getLessonJSON(params.slug)
  
  return {
    title: `${lesson.meta.title} | PM Academy`,
    description: lesson.summary.slice(0, 155), // max 155 chars for SERP
    keywords: [...lesson.meta.skill_clusters, 'product management', lesson.meta.title],
    openGraph: {
      title: `${lesson.meta.title} | PM Academy`,
      description: lesson.summary.slice(0, 155),
      type: 'article',
      url: `https://pmacademy.com/lessons/${params.slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${lesson.meta.title} | PM Academy`,
      description: lesson.summary.slice(0, 155),
    },
    alternates: {
      canonical: `https://pmacademy.com/lessons/${params.slug}`,
    },
  }
}
```

### Structured data (JSON-LD) on lesson pages
```typescript
// components/lesson/LessonStructuredData.tsx
// Add to every public lesson page
const courseSchema = {
  "@context": "https://schema.org",
  "@type": "Course",
  "name": lesson.meta.title,
  "description": lesson.summary,
  "provider": {
    "@type": "Organization",
    "name": "PM Academy",
    "url": "https://pmacademy.com"
  },
  "educationalLevel": lesson.meta.difficulty,
  "timeRequired": `PT${lesson.meta.est_minutes}M`,
  "about": lesson.meta.skill_clusters.join(', '),
  "isPartOf": {
    "@type": "Course",
    "name": "PM Academy — Complete Product Management Course"
  }
}

// Also add Article schema for blog-like content treatment
const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": lesson.meta.title,
  "description": lesson.summary,
  "author": { "@type": "Organization", "name": "PM Academy" }
}
```

---

## 3. SSR Requirements

These pages **must be server-rendered** (not client-side rendered or static-only):
- `app/(marketing)/lessons/[slug]/page.tsx` — ALL lesson pages
- `app/(marketing)/curriculum/page.tsx` — full curriculum listing
- `app/(marketing)/page.tsx` — home/landing page

Use `export const dynamic = 'force-static'` ONLY for pages that don't change between deploys and have no dynamic data needs. Lesson pages can be statically generated at build time since content comes from static JSON.

```typescript
// For lesson pages — generateStaticParams for ISR/SSG
export async function generateStaticParams() {
  const index = await getLessonsIndex()
  return index.lessons.map(l => ({ slug: l.slug }))
}
```

---

## 4. Semantic HTML Rules

```html
<!-- CORRECT heading hierarchy -->
<h1>What is a PRD? — PM Academy</h1>   <!-- ONE h1 per page -->
<h2>Theory</h2>
<h3>What Makes a Great PRD</h3>
<h2>Common Mistakes</h2>

<!-- CORRECT use of semantic elements -->
<article>...</article>           <!-- Lesson content -->
<nav aria-label="Lesson navigation">...</nav>
<aside aria-label="Key Takeaways">...</aside>
<main>...</main>                 <!-- Page main content -->
<header>...</header>
<footer>...</footer>
<section aria-labelledby="section-heading">...</section>

<!-- WRONG -->
<div class="h1-style">...</div>  <!-- div soup -->
<div class="article">...</div>
```

- One `<h1>` per page
- Logical heading hierarchy (no skipping from h2 to h4)
- `<article>` for lesson content
- `<nav>` for navigation blocks
- `<main>` wraps the primary page content

---

## 5. Sitemap & Robots

```typescript
// app/sitemap.ts — auto-generates sitemap.xml
import { getLessonsIndex } from '@/lib/content'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const index = await getLessonsIndex()
  
  const lessonEntries = index.lessons.map(lesson => ({
    url: `https://pmacademy.com/lessons/${lesson.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))
  
  return [
    { url: 'https://pmacademy.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: 'https://pmacademy.com/curriculum', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: 'https://pmacademy.com/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    ...lessonEntries,
  ]
}
```

```typescript
// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: '*', disallow: ['/api/', '/dashboard/', '/review/', '/progress/'] }
    ],
    sitemap: 'https://pmacademy.com/sitemap.xml',
  }
}
```

---

## 6. Lighthouse Performance Targets

**Target: ≥ 90 on all lesson and marketing pages.**

### Image optimization
```typescript
// Always use next/image
import Image from 'next/image'
<Image src="/hero.webp" alt="PM Academy skill radar" width={800} height={600} priority />
// priority={true} for above-the-fold images only
```

### Font optimization
```typescript
// app/layout.tsx — use next/font
import { Inter, Fraunces } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], variable: '--font-body' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-heading' })
```

### Core Web Vitals
- **LCP (Largest Contentful Paint):** Preload hero image on landing page. Lesson pages: `<h1>` is LCP candidate — ensure heading styles load fast.
- **CLS (Cumulative Layout Shift):** Always specify width/height on images. Use `min-h` on loading skeletons.
- **FID/INP:** Minimize JS bundle. Server components reduce client JS. Keep client-only code small.

### Bundle size
- Analyze with `ANALYZE=true npm run build` (add `@next/bundle-analyzer` if not installed)
- Keep client-side JS for lesson reading view minimal (it's mostly server-rendered)
- Framer Motion: import only needed components, not entire library
- Avoid importing all of lucide-react — import individual icons

---

## 7. Content SEO Strategy

### Priority keyword clusters (mapped to lessons)
Each lesson title should align with a real search query. Before writing lesson titles, verify:
1. Is this a query someone types in Google?
2. Does the title match natural language ("What is...?", "[Framework] explained", "How to write a...")?
3. Is there search intent alignment (informational for lessons, not transactional)?

### Curriculum page as SEO asset
`/curriculum` — publish the full 90-lesson, 9-module outline publicly (even pre-launch). This is:
- A credibility signal ("here's actual depth")
- A strong SEO asset (module/lesson titles = real search queries)
- Indexed by Google long before lesson pages rank

### Portfolio export as backlink engine
`/p/[username]` pages linked from LinkedIn profiles = backlinks + referral traffic.
- Footer of portfolio pages: "Built with PM Academy" (subtle, not heavy ad)
- Ensure `<meta name="robots" content="index,follow">` on public portfolio pages

---

## 8. Open Graph for Social Sharing

Every shared link (portfolio, lesson, etc.) should generate a compelling preview:

```typescript
// Lesson page OG image (can use Next.js @vercel/og)
// app/(marketing)/lessons/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'
export default async function OpenGraphImage({ params }) {
  const lesson = await getLessonJSON(params.slug)
  return new ImageResponse(
    <div style={{ /* skill cluster tags, lesson title, PM Academy branding */ }}>
      <h1>{lesson.meta.title}</h1>
      <p>PM Academy — {lesson.meta.skill_clusters.join(' · ')}</p>
    </div>
  )
}
```

---

## 9. Pre-launch SEO Checklist

Before going public:
- [ ] All 3–5 sample lesson pages have unique meta titles + descriptions
- [ ] Curriculum page is live and indexable
- [ ] `sitemap.xml` generates correctly and is submitted to Google Search Console
- [ ] `robots.txt` blocks `/api/`, `/dashboard/`, `/review/`, `/progress/`
- [ ] Structured data validates in Google's Rich Results Test
- [ ] No `noindex` accidentally on public pages
- [ ] Canonical URLs set on all public pages
- [ ] Open Graph images generate correctly (test in social debuggers)
- [ ] Lighthouse ≥ 90 on lesson page and home page
- [ ] Core Web Vitals passing in Chrome DevTools
- [ ] Google Analytics is tracking public page views
