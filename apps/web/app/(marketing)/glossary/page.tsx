import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'
import { getGlossaryDefinedTermSetSchema } from '@/lib/schema'
import {
  fetchGlossaryData,
  groupGlossaryByLetter,
  ALPHABET,
} from '@/lib/glossary'
import { ArrowUpRight, BookOpen, Layers } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: { absolute: 'Product Management Glossary: 470+ Terms & Mental Models | Prodily' },
  description:
    'Comprehensive A to Z product management glossary defining 470+ product concepts, frameworks, discovery techniques, metrics, and failure patterns taught in Prodily.',
  alternates: {
    canonical: `${siteUrl}/glossary`,
  },
  openGraph: {
    title: { absolute: 'Product Management Glossary: 470+ Terms & Mental Models | Prodily' },
    description:
      'Comprehensive A to Z product management glossary defining 470+ product concepts, frameworks, discovery techniques, metrics, and failure patterns.',
    url: `${siteUrl}/glossary`,
    type: 'website',
    images: [
      {
        url: BRAND.assets.ogImage,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: 'Prodily Product Management Glossary',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: { absolute: 'Product Management Glossary: 470+ Terms & Mental Models | Prodily' },
    description:
      'Explore 470+ product management terms, mental models, and failure patterns taught in the Prodily curriculum.',
    images: [BRAND.assets.ogImage],
  },
}

export default async function GlossaryPage() {
  const terms = await fetchGlossaryData()
  const grouped = groupGlossaryByLetter(terms)

  const jsonLd = getGlossaryDefinedTermSetSchema(
    terms.map((t) => ({
      term: t.term,
      definition: t.definition,
      slug: t.slug,
      lessonNumber: t.firstTaughtLesson,
    }))
  )

  return (
    <div className="min-h-screen bg-transparent">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <div className="container mx-auto px-5 lg:px-8 pt-24 pb-20 lg:pt-32 lg:pb-28 max-w-6xl space-y-12">
        {/* Header */}
        <header className="space-y-4 max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-primary">
            <BookOpen size={14} aria-hidden="true" />
            <span>PRODUCT VOCABULARY &amp; CONCEPTS</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-foreground tracking-[-0.03em] leading-[1.12]">
            Product Management Glossary
          </h1>

          <p className="text-base sm:text-lg text-ink-muted leading-relaxed">
            A comprehensive reference of {terms.length} terms, mental models, discovery habits, metrics, and failure patterns taught across the Prodily 90-lesson curriculum.
          </p>

          <p className="text-sm text-ink-muted leading-relaxed">
            Looking for structured decision models? Explore our{' '}
            <Link href="/frameworks" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
              <span>Frameworks &amp; Mental Models</span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>{' '}
            collection.
          </p>
        </header>

        {/* Sticky A-Z Navigation */}
        <nav
          aria-label="Alphabetical index"
          className="sticky top-16 z-20 py-3 px-4 rounded-xl border border-border bg-background/95 backdrop-blur-md shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-1.5 text-xs sm:text-sm font-mono">
            {ALPHABET.map((letter) => {
              const count = grouped[letter]?.length ?? 0
              if (count > 0) {
                return (
                  <a
                    key={letter}
                    href={`#letter-${letter}`}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-foreground font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
                    title={`${letter}: ${count} terms`}
                  >
                    {letter}
                  </a>
                )
              }
              return (
                <span
                  key={letter}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-ink-muted/30 cursor-not-allowed select-none"
                  aria-hidden="true"
                >
                  {letter}
                </span>
              )
            })}
          </div>
        </nav>

        {/* Glossary Terms List */}
        <div className="space-y-16">
          {ALPHABET.map((letter) => {
            const letterTerms = grouped[letter] ?? []
            if (letterTerms.length === 0) return null

            return (
              <section
                key={letter}
                id={`letter-${letter}`}
                className="space-y-6 scroll-mt-36"
                aria-labelledby={`heading-letter-${letter}`}
              >
                <div className="flex items-baseline justify-between border-b border-border pb-3">
                  <h2
                    id={`heading-letter-${letter}`}
                    className="text-2xl sm:text-3xl font-bold font-mono text-primary tracking-tight"
                  >
                    {letter}
                  </h2>
                  <span className="text-xs font-mono text-ink-muted">
                    {letterTerms.length} {letterTerms.length === 1 ? 'term' : 'terms'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {letterTerms.map((item) => (
                    <article
                      key={item.slug}
                      id={item.slug}
                      className="p-5 rounded-xl border border-border bg-surface/60 hover:border-primary/40 transition-colors flex flex-col justify-between space-y-3 scroll-mt-36"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-semibold text-foreground tracking-tight leading-snug">
                            <a
                              href={`#${item.slug}`}
                              className="hover:text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-primary rounded-sm"
                            >
                              {item.name}
                            </a>
                          </h3>

                          {item.badge && (
                            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-muted text-ink-muted border border-border">
                              {item.badge}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-ink-muted leading-relaxed">
                          {item.definition}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-border/40 flex items-center justify-between text-xs text-ink-muted">
                        <Link
                          href={`/lessons/${item.lessonSlug}`}
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          <span>Lesson {item.firstTaughtLesson}</span>
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </Link>

                        {item.related && (
                          <span
                            className="text-[11px] text-ink-muted truncate max-w-[200px]"
                            title={`Related: ${item.related}`}
                          >
                            Related: {item.related}
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        {/* Footer Callout */}
        <section className="rounded-2xl border border-border bg-surface p-8 sm:p-10 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-primary">
            <Layers size={14} aria-hidden="true" />
            <span>LEARN IN DEPTH</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
            Put vocabulary into structured practice.
          </h2>

          <p className="text-sm sm:text-base text-ink-muted max-w-2xl leading-relaxed">
            Every glossary term connects directly to our hands-on curriculum with interactive quizzes, mental models, and real-world product assignments.
          </p>

          <div className="pt-2 flex flex-wrap gap-4">
            <Link
              href="/curriculum"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Explore the 90 Lessons
            </Link>
            <Link
              href="/frameworks"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold border border-border bg-surface hover:bg-muted text-foreground transition-colors"
            >
              Explore Frameworks
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
