import fs from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ParsedLesson } from '../../../../../scripts/parse-content'

interface PageProps {
  params: Promise<{ slug: string }>
}

function getLessonData(slug: string): ParsedLesson | null {
  const filePath = path.resolve(process.cwd(), `public/content/lessons/${slug}.json`)
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const lesson = getLessonData(slug)
  if (!lesson) return { title: 'Lesson Not Found | PM Academy' }

  return {
    title: `Lesson ${lesson.meta.number}: ${lesson.meta.title} | PM Academy`,
    description: `Read Lesson ${lesson.meta.number} of PM Academy. ${lesson.meta.title} — Module ${lesson.meta.moduleNumber}: ${lesson.meta.moduleName}.`,
    openGraph: {
      title: `Lesson ${lesson.meta.number}: ${lesson.meta.title}`,
      description: `Free Product Management lesson: ${lesson.meta.title}`,
      type: 'article',
    },
  }
}

export default async function PublicLessonPage({ params }: PageProps) {
  const { slug } = await params
  const lesson = getLessonData(slug)

  if (!lesson) {
    notFound()
  }

  // Course JSON-LD Schema
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: `Lesson ${lesson.meta.number}: ${lesson.meta.title}`,
    description: `Module ${lesson.meta.moduleNumber}: ${lesson.meta.moduleName}`,
    provider: {
      '@type': 'Organization',
      name: 'PM Academy',
      sameAs: 'https://pmacademy.com',
    },
  }

  return (
    <article className="container mx-auto px-4 py-12 max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mb-8">
        <Link
          href="/curriculum"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
        >
          ← Back to Curriculum
        </Link>
        <div className="flex items-center gap-3 mt-4 text-sm text-muted-foreground">
          <span>Module {lesson.meta.moduleNumber}: {lesson.meta.moduleName}</span>
          <span>•</span>
          <span>{lesson.meta.estMinutesReading} min read</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold font-serif text-foreground mt-2">
          Lesson {lesson.meta.number}: {lesson.meta.title}
        </h1>
      </div>

      {/* Objectives */}
      {lesson.learningObjectives && lesson.learningObjectives.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 mb-8">
          <h2 className="text-base font-bold text-foreground mb-3">Learning Objectives</h2>
          <ul className="space-y-2 text-sm text-foreground/80 list-disc list-inside">
            {lesson.learningObjectives.map((obj, i) => (
              <li key={i}>{obj}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Theory preview / prose */}
      <div className="prose prose-neutral dark:prose-invert max-w-none mb-12">
        <div className="whitespace-pre-line text-foreground/90 leading-relaxed">
          {lesson.theory.slice(0, 3000)}
          {lesson.theory.length > 3000 && '...'}
        </div>
      </div>

      {/* Quiz Preview CTA */}
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h2 className="text-2xl font-bold font-serif text-foreground mb-2">
          Ready to test your product judgment?
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
          Take the 15-question interactive quiz for Lesson {lesson.meta.number} and start building your skill radar.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Start Lesson 1 Free →
        </Link>
      </div>
    </article>
  )
}
