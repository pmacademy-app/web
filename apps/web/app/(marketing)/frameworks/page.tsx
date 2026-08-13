import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { FRAMEWORKS } from '@/lib/frameworks'
import { ArrowRight, Sparkles } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Original PM Frameworks & Mental Models — Prodily PM Academy',
  description:
    "Explore Prodily PM Academy's original Product Management frameworks, including the Accountability Triangle, Decision Chain, Stakeholder Ledger, and Ownership Zones Model.",
  alternates: {
    canonical: `${siteUrl}/frameworks`,
  },
  openGraph: {
    title: 'Original PM Frameworks & Mental Models — Prodily PM Academy',
    description:
      'Master business-school caliber Product Management mental models built for real-world product judgment.',
    url: `${siteUrl}/frameworks`,
    type: 'website',
    images: [
      {
        url: BRAND.assets.ogImage,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: 'Prodily PM Academy Frameworks',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Original PM Frameworks & Mental Models — Prodily PM Academy',
    description: '12 original PM mental models taught across 90 free lessons.',
    images: [BRAND.assets.ogImage],
  },
}

export default function FrameworksPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${siteUrl}/frameworks#termset`,
    name: 'Prodily PM Academy Original Frameworks & Mental Models',
    description:
      'Proprietary Product Management frameworks and diagnostic models taught in the Prodily PM Academy 90-lesson curriculum.',
    url: `${siteUrl}/frameworks`,
    hasDefinedTerm: FRAMEWORKS.map((fw) => ({
      '@type': 'DefinedTerm',
      name: fw.name,
      description: fw.definition,
      url: `${siteUrl}/lessons/${fw.lessonSlug}`,
      inDefinedTermSet: `${siteUrl}/frameworks#termset`,
    })),
  }

  return (
    <div className="container mx-auto px-4 pt-24 pb-16 lg:pt-28 lg:pb-20 max-w-5xl space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20 inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Product Craft Architecture</span>
        </span>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Original PM Frameworks &amp; Mental Models
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          The 90-lesson curriculum introduces specific, reusable mental models designed to replace generic blog advice with business-school caliber product judgment.
        </p>
      </div>

      {/* Frameworks Index */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {FRAMEWORKS.map((fw) => (
          <article
            key={fw.slug}
            id={fw.slug}
            className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-4 flex flex-col justify-between shadow-xs transition-all hover:border-primary/50"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary px-2.5 py-0.5 rounded-md bg-primary/10">
                  Lesson {fw.lessonNumber}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  Module {fw.moduleNumber}: {fw.moduleTitle}
                </span>
              </div>

              <h2 className="text-xl md:text-2xl font-bold font-serif text-foreground">
                <dfn className="not-italic">{fw.name}</dfn>
              </h2>

              <p className="text-sm text-foreground/90 leading-relaxed">
                {fw.definition}
              </p>
            </div>

            <div className="pt-4 border-t border-border space-y-3">
              <div className="text-xs text-muted-foreground">
                <strong className="font-semibold text-foreground">Key Craft Takeaway:</strong>{' '}
                {fw.keyTakeaway}
              </div>

              <div className="pt-1 flex items-center justify-between">
                <Link
                  href={`/lessons/${fw.lessonSlug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline group"
                >
                  <span>Read Lesson {fw.lessonNumber} Framework Guide</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="rounded-3xl border border-border bg-card/60 p-8 md:p-12 text-center max-w-3xl mx-auto space-y-6">
        <h3 className="text-2xl font-bold font-serif text-foreground">
          Ready to apply these mental models in real scenarios?
        </h3>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Explore all 90 lessons, 9 applied module capstones, and interactive spaced-repetition flashcards—100% free with no paywalls.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/curriculum"
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all inline-flex items-center gap-2"
          >
            <span>Explore Full 90-Lesson Curriculum</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/signup"
            className="px-6 py-3 rounded-xl border border-border bg-background text-foreground font-bold text-sm hover:bg-muted transition-all"
          >
            Start Learning Free
          </Link>
        </div>
      </div>
    </div>
  )
}
