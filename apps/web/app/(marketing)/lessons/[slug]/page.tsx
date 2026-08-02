import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { fetchCompiledLesson, resolveSlugToId } from '@/lib/lesson-loader'
import { BlockTreeRenderer } from '@/renderer/block-tree-renderer'

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getLessonBySlug(slug: string) {
  const lessonId = await resolveSlugToId(slug)
  if (!lessonId) return null
  return await fetchCompiledLesson(lessonId)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const lesson = await getLessonBySlug(slug)
  if (!lesson) return { title: 'Lesson Not Found | PM Academy' }

  return {
    title: `Lesson ${lesson.order}: ${lesson.title} | PM Academy`,
    description: `Read Lesson ${lesson.order} of PM Academy. ${lesson.title} — Module ${lesson.module}.`,
    openGraph: {
      title: `Lesson ${lesson.order}: ${lesson.title}`,
      description: `Free Product Management lesson: ${lesson.title}`,
      type: 'article',
    },
  }
}

function formatModuleName(moduleSlug: string): string {
  const nameMap: Record<string, string> = {
    'foundations': 'Foundations',
    'discovery': 'Discovery & User Research',
    'strategy': 'Product Strategy',
    'execution': 'Product Execution',
    'growth': 'Growth & Metrics',
    'leadership': 'PM Leadership',
    'technical': 'Technical Fundamentals',
    'design': 'Design Thinking',
    'capstone': 'Capstone Projects',
  }
  return nameMap[moduleSlug] ?? moduleSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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

  const lesson = await getLessonBySlug(slug)

  if (!lesson) {
    notFound()
  }

  // Course JSON-LD Schema
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: `Lesson ${lesson.order}: ${lesson.title}`,
    description: `Module: ${formatModuleName(lesson.module)}`,
    provider: {
      '@type': 'Organization',
      name: 'PM Academy',
      sameAs: 'https://pmacademy.com',
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
          <span>Lesson {lesson.order}</span>
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
          Take the interactive practice quiz for Lesson {lesson.order} and build your skill radar dashboard.
        </p>
        <div className="flex justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all"
          >
            Start Lesson 1 Free →
          </Link>
        </div>
      </div>
    </article>
  )
}
