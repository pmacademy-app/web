import type { Metadata } from 'next'
import Link from 'next/link'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/marketing/styles'
import { BRAND } from '@/lib/brand'
import { FRAMEWORKS } from '@/lib/frameworks'
import { FrameworksExplorer } from '@/components/marketing/frameworks-explorer'
import { ArrowRight } from 'lucide-react'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: { absolute: 'Product Management Frameworks & Mental Models | Prodily' },
  description:
    'Explore practical product management mental models for discovery, prioritization, strategy, execution, leadership, and product decision-making.',
  alternates: {
    canonical: `${siteUrl}/frameworks`,
  },
  openGraph: {
    title: { absolute: 'Product Management Frameworks & Mental Models | Prodily' },
    description:
      'Explore practical product management mental models for discovery, prioritization, strategy, execution, leadership, and product decision-making.',
    url: `${siteUrl}/frameworks`,
    type: 'website',
    images: [
      {
        url: BRAND.assets.ogImage,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: 'Prodily Frameworks',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: { absolute: 'Product Management Frameworks & Mental Models | Prodily' },
    description: 'Explore practical product management mental models for decision-making.',
    images: [BRAND.assets.ogImage],
  },
}

/**
 * Sources for the well-known frameworks the lessons build on. Prodily teaches and adapts these;
 * it did not invent them, so the page credits them instead of presenting them as its own.
 */
const FRAMEWORK_SOURCES: { idea: string; credit: string }[] = [
  { idea: 'Desirability, feasibility and viability', credit: 'IDEO (design thinking)' },
  { idea: 'Continuous discovery and opportunity solution trees', credit: 'Teresa Torres, Continuous Discovery Habits' },
  { idea: 'RICE prioritization (Reach, Impact, Confidence, Effort)', credit: 'Sean McBride at Intercom' },
  { idea: 'MoSCoW prioritization', credit: 'Dai Clegg, later adopted by DSDM' },
  { idea: 'North Star Metric', credit: 'Popularized by Sean Ellis and the Amplitude North Star Framework' },
]

export default function FrameworksPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${siteUrl}/frameworks#termset`,
    name: 'Product Management Frameworks & Mental Models taught in Prodily',
    description:
      'Product management frameworks and mental models taught in the Prodily 90-lesson curriculum. Well-known industry frameworks are credited to their original authors.',
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
    <div className="min-h-screen bg-transparent">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      {/* Main Content Area */}
      <div className="container mx-auto px-5 lg:px-8 pt-24 pb-20 lg:pt-32 lg:pb-28 max-w-6xl space-y-12">
        
        {/* ── Architectural Header ───────────────────────────────────────── */}
        <header className="space-y-4 max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-primary">
            <span>PRODUCT MENTAL MODELS</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-foreground tracking-[-0.03em] leading-[1.12]">
            The frameworks you use to think through product decisions.
          </h1>

          <p className="text-base sm:text-lg text-ink-muted leading-relaxed">
            Prodily&apos;s curriculum introduces reusable mental models for framing problems, making decisions, prioritizing opportunities, understanding trade-offs, and communicating product thinking.
          </p>

          <p className="text-sm sm:text-base text-ink-muted leading-relaxed">
            These aren&apos;t tips to memorize. They&apos;re tools to help you reason through product problems.
            Some are Prodily&apos;s own teaching models; many build on well-known industry frameworks, credited below.
          </p>
        </header>

        {/* ── Interactive Frameworks Explorer ────────────────────────────── */}
        <FrameworksExplorer frameworks={FRAMEWORKS} />

        {/* Credits for the established frameworks the lessons build on. */}
        <section aria-labelledby="framework-sources-heading" className="max-w-3xl space-y-3">
          <h2 id="framework-sources-heading" className="text-lg font-semibold text-foreground tracking-tight">
            Where these ideas come from
          </h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            Several of these models adapt established work from across the product community. We teach and
            apply them; we did not invent them.
          </p>
          <ul className="space-y-1.5 text-sm text-ink-muted leading-relaxed list-disc pl-5">
            {FRAMEWORK_SOURCES.map((source) => (
              <li key={source.idea}>
                <span className="font-medium text-foreground">{source.idea}:</span> {source.credit}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Bottom Capstone Callout ─────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-surface p-8 sm:p-12 shadow-xs space-y-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
              Build the thinking behind the frameworks.
            </h2>
            <p className="text-sm sm:text-base text-ink-muted leading-relaxed">
              Explore the full curriculum and put these mental models into practice.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            <Link
              href="/curriculum"
              className={BUTTON_PRIMARY}
            >
              <span>Explore Full Curriculum</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>

            <Link
              href="/signup"
              className={BUTTON_SECONDARY}
            >
              Start Learning Free
            </Link>
          </div>
        </section>

      </div>
    </div>
  )
}
