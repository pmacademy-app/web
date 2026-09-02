import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { FRAMEWORKS } from '@/lib/frameworks'
import { FrameworksExplorer } from '@/components/marketing/frameworks-explorer'
import { ArrowRight } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Product Management Frameworks & Mental Models | Prodily',
  description:
    'Explore practical product management mental models for discovery, prioritization, strategy, execution, leadership, and product decision-making.',
  alternates: {
    canonical: `${siteUrl}/frameworks`,
  },
  openGraph: {
    title: 'Product Management Frameworks & Mental Models | Prodily',
    description:
      'Explore practical product management mental models for discovery, prioritization, strategy, execution, leadership, and product decision-making.',
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
    title: 'Product Management Frameworks & Mental Models | Prodily',
    description: 'Explore practical product management mental models for decision-making.',
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
    <div className="min-h-screen bg-[#FBFAF6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Main Content Area */}
      <main className="container mx-auto px-5 lg:px-8 pt-24 pb-20 lg:pt-32 lg:pb-28 max-w-6xl space-y-12">
        
        {/* ── Architectural Header ───────────────────────────────────────── */}
        <header className="space-y-4 max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#1F6B4E]">
            <span>PRODUCT MENTAL MODELS</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-[#171A17] tracking-[-0.03em] leading-[1.12]">
            The frameworks you use to think through product decisions.
          </h1>

          <p className="text-base sm:text-lg text-[#70685A] leading-relaxed">
            Prodily&apos;s curriculum introduces reusable mental models for framing problems, making decisions, prioritizing opportunities, understanding trade-offs, and communicating product thinking.
          </p>

          <p className="text-sm sm:text-base text-[#70685A] leading-relaxed">
            These aren&apos;t tips to memorize. They&apos;re tools to help you reason through product problems.
          </p>
        </header>

        {/* ── Interactive Frameworks Explorer ────────────────────────────── */}
        <FrameworksExplorer frameworks={FRAMEWORKS} />

        {/* ── Bottom Capstone Callout ─────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#DED8CB] bg-white p-8 sm:p-12 shadow-xs space-y-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-[#171A17] tracking-tight">
              Build the thinking behind the frameworks.
            </h2>
            <p className="text-sm sm:text-base text-[#70685A] leading-relaxed">
              Explore the full curriculum and put these mental models into practice.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            <Link
              href="/curriculum"
              className="
                inline-flex items-center gap-2 px-6 py-3.5
                bg-[#1F6B4E] text-white font-semibold text-sm rounded-lg
                shadow-[0_2px_12px_rgba(31,107,78,0.25)]
                hover:bg-[#18553E] hover:shadow-[0_4px_20px_rgba(31,107,78,0.35)]
                active:scale-[0.98] transition-all duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F80ED]
              "
            >
              <span>Explore Full Curriculum</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>

            <Link
              href="/signup"
              className="
                inline-flex items-center gap-2 px-5 py-3.5
                bg-white text-[#171A17] font-semibold text-sm rounded-lg
                border border-[#DED8CB] hover:border-[#BDB4A2] hover:bg-[#F2EFE7]
                active:scale-[0.98] transition-all duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F80ED]
              "
            >
              Start Learning Free
            </Link>
          </div>
        </section>

      </main>
    </div>
  )
}
