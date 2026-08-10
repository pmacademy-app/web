import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { fetchCompiledLesson, fetchCurriculumData, resolveSlugToId } from '@/lib/lesson-loader'
import { BlockTreeRenderer } from '@/renderer/block-tree-renderer'
import { BRAND } from '@/lib/brand'

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getLessonBySlug(slug: string) {
  const lessonId = await resolveSlugToId(slug)
  if (!lessonId) return null
  return await fetchCompiledLesson(lessonId)
}

function formatModuleName(moduleSlug: string): string {
  const nameMap: Record<string, string> = {
    'foundations': 'Product Thinking Foundations',
    'discovery': 'Users, Problems & Discovery',
    'strategy': 'Defining Products & PRDs',
    'execution': 'Prioritization & Roadmaps',
    'design': 'Design, UX & Prototyping',
    'growth': 'Metrics, Growth & Experiments',
    'technical': 'Technical Fluency for PMs',
    'leadership': 'Stakeholders & Leadership',
    'capstone': 'Capstone & Career Portfolio',
  }
  return nameMap[moduleSlug] ?? moduleSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export async function generateStaticParams() {
  const curriculum = await fetchCurriculumData()
  if (!curriculum) return []
  return curriculum.lessons.map((lesson) => ({
    slug: lesson.slug,
  }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const [lesson, curriculum] = await Promise.all([
    getLessonBySlug(slug),
    fetchCurriculumData(),
  ])
  if (!lesson) return { title: 'Lesson Not Found' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl
  const globalIdx = curriculum?.lessons.findIndex((l) => l.slug === slug || l.id === lesson.id) ?? -1
  const globalOrder = globalIdx >= 0 ? globalIdx + 1 : (parseInt(slug.replace(/^lesson-/, ''), 10) || lesson.order)
  const canonicalUrl = `${siteUrl}/lessons/${slug}`
  const pageTitle = `Lesson ${globalOrder}: ${lesson.title}`
  const description = `Read Lesson ${globalOrder} of ${BRAND.product}. ${lesson.title} — Module: ${formatModuleName(lesson.module)}.`

  return {
    title: pageTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${pageTitle} | ${BRAND.fullName}`,
      description: `Free Product Management lesson: ${lesson.title}`,
      url: canonicalUrl,
      type: 'article',
      images: [{
        url: `${siteUrl}${BRAND.assets.ogImage}`,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: lesson.title,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
      images: [`${siteUrl}${BRAND.assets.ogImage}`],
    },
  }
}

export default async function PublicLessonPage({ params }: PageProps) {
  const { slug } = await params

  // Auth check - if user is authenticated, redirect to the full interactive lesson
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value
  if (accessToken) {
    const lessonId = await resolveSlugToId(slug)
    if (lessonId) {
      const lessonMeta = await fetchCompiledLesson(lessonId)
      if (lessonMeta) {
        redirect(`/academy/${lessonMeta.module}/${lessonId}`)
      }
    }
  }

  const [lesson, curriculum] = await Promise.all([
    getLessonBySlug(slug),
    fetchCurriculumData(),
  ])

  if (!lesson) {
    notFound()
  }

  const globalIdx = curriculum?.lessons.findIndex((l) => l.slug === slug || l.id === lesson.id) ?? -1
  const globalOrder = globalIdx >= 0 ? globalIdx + 1 : (parseInt(slug.replace(/^lesson-/, ''), 10) || lesson.order)

  const prevLesson = globalIdx > 0 ? curriculum?.lessons[globalIdx - 1] : null
  const nextLesson = globalIdx >= 0 && globalIdx < (curriculum?.lessons.length ?? 0) - 1 ? curriculum?.lessons[globalIdx + 1] : null

  // LearningResource JSON-LD Schema
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: `Lesson ${globalOrder}: ${lesson.title}`,
    description: `Read Lesson ${globalOrder} of ${BRAND.product}. ${lesson.title} — Module: ${formatModuleName(lesson.module)}.`,
    learningResourceType: 'Lesson',
    educationalLevel: 'Intermediate',
    url: `${siteUrl}/lessons/${slug}`,
    isPartOf: {
      '@type': 'Course',
      name: 'Prodily PM Academy Product Management Curriculum',
      url: `${siteUrl}/curriculum`,
      provider: {
        '@type': 'Organization',
        name: BRAND.fullName,
        sameAs: siteUrl,
      },
    },
  }

  // Slice first 8 theory-related blocks to construct a preview
  const previewBlocks = lesson.blocks
    .filter((b) => !['quiz', 'flashcardDeck', 'reflection', 'connections'].includes(b.type))
    .slice(0, 8)

  return (
    <article className="container mx-auto px-4 py-12 max-w-4xl space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div>
        <Link
          href="/curriculum"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
        >
          ← Back to Curriculum
        </Link>
        <div className="flex items-center gap-3 mt-4 text-sm text-muted-foreground">
          <span>Module: {formatModuleName(lesson.module)}</span>
          <span>•</span>
          <span>Lesson {globalOrder}</span>
          <span>•</span>
          <span>{lesson.estimatedReadingTime} min read</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold font-serif text-foreground mt-2 leading-tight">
          {lesson.title}
        </h1>
      </div>

      {/* Theory preview blocks rendered via v2 BlockTreeRenderer */}
      <div className="prose dark:prose-invert max-w-none">
        <BlockTreeRenderer blocks={previewBlocks} lessonId={lesson.id} />
        <div className="h-24 bg-gradient-to-t from-background to-transparent pointer-events-none -mt-24 relative z-10" />
      </div>

      {/* Quiz Preview CTA */}
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm max-w-2xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold font-serif text-foreground leading-tight">
          Ready to test your product judgment?
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
          Take the interactive practice quiz for Lesson {globalOrder} and build your skill radar dashboard.
        </p>
        <div className="flex justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all"
          >
            Start Lesson {globalOrder} Free →
          </Link>
        </div>
      </div>

      {/* Lesson Navigation Footer */}
      <div className="flex justify-between items-center pt-6 border-t border-border/60 text-xs">
        {prevLesson ? (
          <Link
            href={`/lessons/${prevLesson.slug}`}
            className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Previous Lesson
          </Link>
        ) : (
          <div />
        )}
        <Link
          href="/curriculum"
          className="font-semibold text-primary hover:underline"
        >
          View Full Curriculum
        </Link>
        {nextLesson ? (
          <Link
            href={`/lessons/${nextLesson.slug}`}
            className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Next Lesson →
          </Link>
        ) : (
          <div />
        )}
      </div>
    </article>
  )
}
