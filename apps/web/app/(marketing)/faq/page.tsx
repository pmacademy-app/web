import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { FAQ_ITEMS } from '@/config/content'
import { FAQExplorer } from '@/components/marketing/faq-explorer'
import { ArrowRight, MessageCircle } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Frequently Asked Questions — Prodily PM Academy',
  description:
    'Answers to common questions about Prodily PM Academy: free curriculum, career switcher suitability, capstone deliverables, portfolio building, and certification.',
  alternates: {
    canonical: `${siteUrl}/faq`,
  },
  openGraph: {
    title: 'Frequently Asked Questions — Prodily PM Academy',
    description:
      'Everything you need to know about Prodily PM Academy, 100% free product management curriculum, and career deliverables.',
    url: `${siteUrl}/faq`,
    type: 'website',
    images: [
      {
        url: BRAND.assets.ogImage,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: 'Prodily PM Academy FAQ',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Frequently Asked Questions — Prodily PM Academy',
    description: 'Frequently asked questions about the free 90-lesson PM Academy curriculum.',
    images: [BRAND.assets.ogImage],
  },
}

export default function FAQPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <div className="min-h-screen bg-[#FBFAF6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <main className="container mx-auto px-5 lg:px-8 pt-24 pb-20 lg:pt-32 lg:pb-28 max-w-4xl space-y-12">
        
        {/* ── Page Header ──────────────────────────────────────────────── */}
        <header className="space-y-4">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#1F6B4E]">
            Support &amp; Details
          </div>

          <h1 className="text-4xl sm:text-5xl font-semibold text-[#171A17] tracking-[-0.03em] leading-tight">
            Frequently Asked Questions
          </h1>

          <p className="text-base sm:text-lg text-[#70685A] leading-relaxed max-w-2xl">
            Everything you need to know about the 90-lesson curriculum, practical capstones, portfolio artifacts, and free access.
          </p>
        </header>

        {/* ── Searchable FAQ Explorer ──────────────────────────────────── */}
        <FAQExplorer />

        {/* ── Still Have Questions & Contact Box ───────────────────────── */}
        <section className="rounded-2xl border border-[#DED8CB] bg-white p-8 sm:p-10 shadow-xs space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-semibold text-[#171A17] tracking-tight">
              Still have a question?
            </h2>
            <p className="text-sm sm:text-base text-[#70685A] leading-relaxed">
              Can&apos;t find what you are looking for? Reach out directly or check the full curriculum syllabus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 pt-1">
            <Link
              href="/contact"
              className="
                inline-flex items-center gap-2 px-5 py-3
                bg-[#1F6B4E] text-white font-semibold text-sm rounded-lg
                shadow-[0_2px_12px_rgba(31,107,78,0.25)]
                hover:bg-[#18553E] hover:shadow-[0_4px_20px_rgba(31,107,78,0.35)]
                active:scale-[0.98] transition-all duration-150
              "
            >
              <span>Get in Touch</span>
              <MessageCircle size={15} />
            </Link>

            <Link
              href="/curriculum"
              className="
                inline-flex items-center gap-2 px-5 py-3
                bg-white text-[#171A17] font-semibold text-sm rounded-lg
                border border-[#DED8CB] hover:border-[#BDB4A2] hover:bg-[#F2EFE7]
                active:scale-[0.98] transition-all duration-150
              "
            >
              <span>Explore Curriculum</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

      </main>
    </div>
  )
}
