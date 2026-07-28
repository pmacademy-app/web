import type { Metadata } from 'next'
import Link from 'next/link'

interface PageProps {
  params: Promise<{
    moduleSlug: string
    lessonSlug: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lessonSlug } = await params
  return {
    title: `Lesson View: ${lessonSlug} | PM Academy`,
    description: 'Interactive lesson viewer, quiz flow, and spaced repetition flashcards.',
  }
}

export default async function AuthenticatedLessonPage({ params }: PageProps) {
  const { moduleSlug, lessonSlug } = await params

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <div className="border-b border-border pb-4">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground mt-4">
          Lesson View
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Path: {moduleSlug} / {lessonSlug}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-foreground/80 leading-relaxed">
          Interactive lesson view and quiz system (Phase 1 core learning loop MVP). This page is scaffolded and ready for implementation.
        </p>
      </div>
    </div>
  )
}
