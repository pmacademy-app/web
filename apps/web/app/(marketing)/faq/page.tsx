import type { Metadata } from 'next'
import Link from 'next/link'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@/components/marketing/styles'
import { BRAND } from '@/lib/brand'
import { FAQ_ITEMS } from '@/config/content'
import { FAQExplorer } from '@/components/marketing/faq-explorer'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Product Management Academy FAQ | Prodily',
  description:
    "Answers about Prodily's curriculum, capstones, portfolio, access, learning experience, and who the program is designed for.",
  alternates: {
    canonical: `${siteUrl}/faq`,
  },
  openGraph: {
    title: 'Product Management Academy FAQ | Prodily',
    description:
      "Answers about Prodily's curriculum, capstones, portfolio, access, learning experience, and who the program is designed for.",
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
    title: 'Product Management Academy FAQ | Prodily',
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
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <div className="container mx-auto px-5 lg:px-8 pt-24 pb-20 lg:pt-32 lg:pb-28 max-w-4xl space-y-12">
        
        {/* ── Page Header ──────────────────────────────────────────────── */}
        <header className="space-y-4">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-primary">
            SUPPORT &amp; DETAILS
          </div>

          <h1 className="text-4xl sm:text-5xl font-semibold text-foreground tracking-[-0.03em] leading-tight">
            Frequently Asked Questions
          </h1>

          <p className="text-base sm:text-lg text-ink-muted leading-relaxed max-w-2xl">
            Everything you need to know about the curriculum, applied work, portfolio, and access.
          </p>
        </header>

        {/* ── Searchable FAQ Explorer ──────────────────────────────────── */}
        <FAQExplorer />

        {/* ── Still Have Questions & Contact Box ───────────────────────── */}
        <section className="rounded-2xl border border-border bg-surface p-8 sm:p-10 shadow-xs space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
              Still have a question?
            </h2>
            <p className="text-sm sm:text-base text-ink-muted leading-relaxed">
              Get in touch and we&apos;ll help you find the answer.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 pt-1">
            <Link
              href="/contact"
              className={BUTTON_PRIMARY}
            >
              <span>Get in Touch</span>
              <MessageCircle size={15} />
            </Link>

            <Link
              href="/curriculum"
              className={BUTTON_SECONDARY}
            >
              <span>Explore Curriculum</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>

      </div>
    </div>
  )
}
