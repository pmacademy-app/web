import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BRAND } from '@/lib/brand'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'
import { getFrameworkDetailSchema, getBreadcrumbSchema } from '@/lib/schema'
import {
  getFrameworkBySlug,
  getAllFrameworkSlugs,
} from '@/config/frameworks'
import { ArrowLeft, ArrowUpRight, BookOpen, CheckCircle2, ChevronRight, ExternalLink } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getAllFrameworkSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const framework = getFrameworkBySlug(slug)

  if (!framework) {
    return { title: 'Framework Not Found | Prodily' }
  }

  const pageUrl = `${siteUrl}/frameworks/${framework.slug}`
  const pageTitle = `${framework.title}: Guide, Example & When to Use | Prodily`

  return {
    title: { absolute: pageTitle },
    description: framework.summary,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title: { absolute: pageTitle },
      description: framework.summary,
      url: pageUrl,
      type: 'article',
      images: [
        {
          url: BRAND.assets.ogImage,
          width: BRAND.assets.ogImageDimensions.width,
          height: BRAND.assets.ogImageDimensions.height,
          alt: framework.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: { absolute: pageTitle },
      description: framework.summary,
      images: [BRAND.assets.ogImage],
    },
  }
}

export default async function FrameworkDetailPage({ params }: PageProps) {
  const { slug } = await params
  const framework = getFrameworkBySlug(slug)

  if (!framework) {
    notFound()
  }

  const jsonLd = getFrameworkDetailSchema(framework)
  const breadcrumbJsonLd = getBreadcrumbSchema([
    { name: 'Home', url: siteUrl },
    { name: 'Frameworks', url: `${siteUrl}/frameworks` },
    { name: framework.title, url: `${siteUrl}/frameworks/${framework.slug}` },
  ])

  return (
    <div className="min-h-screen bg-transparent">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />

      <div className="container mx-auto px-5 lg:px-8 pt-24 pb-20 lg:pt-32 lg:pb-28 max-w-4xl space-y-12">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono text-ink-muted">
          <Link href="/" className="hover:text-primary transition-colors">
            Home
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <Link href="/frameworks" className="hover:text-primary transition-colors">
            Frameworks
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span className="text-foreground font-medium truncate" aria-current="page">
            {framework.title}
          </span>
        </nav>

        {/* Back Link */}
        <div>
          <Link
            href="/frameworks"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-muted hover:text-primary transition-colors"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>All Mental Models &amp; Frameworks</span>
          </Link>
        </div>

        {/* Header */}
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-muted text-primary border border-border">
            <span>PRODUCT MANAGEMENT FRAMEWORK</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-foreground tracking-[-0.03em] leading-tight">
            {framework.title}
          </h1>

          <p className="text-base sm:text-lg text-ink-muted leading-relaxed">
            {framework.summary}
          </p>
        </header>

        {/* Source Attribution Box */}
        <section
          aria-labelledby="source-attribution-heading"
          className="p-5 sm:p-6 rounded-xl border border-border bg-surface/60 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-primary">
            <BookOpen size={14} aria-hidden="true" />
            <h2 id="source-attribution-heading">Source Attribution &amp; Origin</h2>
          </div>

          <p className="text-sm text-ink-muted leading-relaxed">
            <strong className="text-foreground font-medium">{framework.citation.author}</strong> ({framework.citation.year || 'Origins'}).{' '}
            <span className="italic">{framework.citation.source}</span>.
          </p>

          <p className="text-xs text-ink-muted leading-relaxed">
            Prodily teaches and adapts this model in our product management curriculum. We did not invent it, and we credit the original authors and practitioners for their contribution to the product discipline.
          </p>

          {framework.citation.url && (
            <div className="pt-1">
              <a
                href={framework.citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
              >
                <span>Read original publication</span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </div>
          )}
        </section>

        {/* When to Use */}
        <section aria-labelledby="when-to-use-heading" className="space-y-3">
          <h2 id="when-to-use-heading" className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
            When to Use
          </h2>
          <div className="p-5 rounded-xl border border-border bg-surface/40">
            <p className="text-sm sm:text-base text-ink-muted leading-relaxed">
              {framework.whenToUse}
            </p>
          </div>
        </section>

        {/* Worked Mini-Example */}
        <section aria-labelledby="worked-example-heading" className="space-y-4">
          <h2 id="worked-example-heading" className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
            Worked Mini-Example
          </h2>

          <div className="p-6 rounded-xl border border-border bg-surface space-y-5">
            <div className="space-y-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                Scenario
              </span>
              <p className="text-sm text-foreground leading-relaxed">
                {framework.workedExample.scenario}
              </p>
            </div>

            <div className="space-y-1.5 border-t border-border/50 pt-4">
              <span className="text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                Application
              </span>
              <p className="text-sm text-ink-muted leading-relaxed">
                {framework.workedExample.application}
              </p>
            </div>

            <div className="space-y-1.5 border-t border-border/50 pt-4">
              <span className="text-xs font-mono uppercase tracking-wider text-primary font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-success" aria-hidden="true" />
                <span>Outcome</span>
              </span>
              <p className="text-sm text-foreground font-medium leading-relaxed">
                {framework.workedExample.outcome}
              </p>
            </div>
          </div>
        </section>

        {/* Related Lessons */}
        <section aria-labelledby="related-lessons-heading" className="space-y-4">
          <h2 id="related-lessons-heading" className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
            Taught in Prodily Curriculum
          </h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            See how this model is applied in end-to-end case studies and exercises:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {framework.relatedLessons.map((lesson) => (
              <Link
                key={lesson.slug}
                href={`/lessons/${lesson.slug}`}
                className="p-5 rounded-xl border border-border bg-surface hover:border-primary/50 transition-colors flex items-center justify-between group"
              >
                <div className="space-y-1">
                  <span className="text-xs font-mono text-primary font-semibold">
                    Lesson {lesson.lessonNumber}
                  </span>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {lesson.title}
                  </h3>
                </div>
                <ArrowUpRight size={16} className="text-ink-muted group-hover:text-primary transition-colors shrink-0" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        {/* Navigation Between Frameworks and Glossary */}
        <section className="pt-6 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <Link
            href="/frameworks"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            <span>View All Frameworks</span>
          </Link>

          <Link
            href="/glossary"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <span>Browse 470+ Terms in Glossary</span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  )
}
