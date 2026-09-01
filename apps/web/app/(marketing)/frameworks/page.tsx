import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { FRAMEWORKS } from '@/lib/frameworks'
import { FrameworksExplorer } from '@/components/marketing/frameworks-explorer'
import { ArrowRight, BookOpen, Layers } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Original PM Frameworks & Mental Models — Prodily PM Academy',
  description:
    "Explore Prodily PM Academy's 12 original Product Management frameworks, including the Accountability Triangle, Decision Chain, Stakeholder Ledger, and Ownership Zones Model.",
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
            <span>Curriculum Mental Models</span>
            <span>·</span>
            <span>12 Diagnostic Frameworks</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-[#171A17] tracking-[-0.03em] leading-[1.12]">
            Original PM Frameworks &amp; Mental Models
          </h1>

          <p className="text-base sm:text-lg text-[#70685A] leading-relaxed">
            The 90-lesson curriculum introduces specific, reusable mental models designed to replace superficial blog tips with business-school caliber product judgment.
          </p>
        </header>

        {/* ── Interactive Frameworks Explorer ────────────────────────────── */}
        <FrameworksExplorer frameworks={FRAMEWORKS} />

        {/* ── Bottom Capstone Callout ─────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#DED8CB] bg-white p-8 sm:p-12 shadow-xs space-y-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-[#171A17] tracking-tight">
              Ready to apply these mental models in real scenarios?
            </h2>
            <p className="text-sm sm:text-base text-[#70685A] leading-relaxed">
              Explore all 90 lessons, 9 applied module capstones, and interactive spaced repetition flashcards with complete open access.
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
              <span>Explore Full 90-Lesson Curriculum</span>
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
