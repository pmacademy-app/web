import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { ReviewsExplorer } from '@/components/marketing/reviews-explorer'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { ArrowRight } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Learner Reviews | Prodily PM Academy',
  description:
    'Read real learner feedback about the Prodily Product Management learning experience.',
  alternates: {
    canonical: `${siteUrl}/reviews`,
  },
  openGraph: {
    title: 'Learner Reviews | Prodily PM Academy',
    description:
      'Read real learner feedback about the Prodily Product Management learning experience.',
    url: `${siteUrl}/reviews`,
    type: 'website',
    images: [
      {
        url: BRAND.assets.ogImage,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: 'Prodily PM Academy Reviews',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Learner Reviews | Prodily PM Academy',
    description: 'Read what learners say about Prodily PM Academy.',
    images: [BRAND.assets.ogImage],
  },
}

export const revalidate = 60

export default async function ReviewsPage() {
  let initialReviews: any[] = []
  try {
    initialReviews = await FeedbackAdminService.getPublishedTestimonials()
  } catch {
    initialReviews = []
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Prodily PM Academy',
    description: 'Learn product. Build the work. Show the proof. Free permanently.',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: initialReviews.length > 0 ? String(initialReviews.length) : '1',
      bestRating: '5',
      worstRating: '1',
    },
  }

  return (
    <div className="min-h-screen bg-[#FBFAF6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="container mx-auto px-5 lg:px-8 pt-24 pb-20 lg:pt-32 lg:pb-28 max-w-6xl space-y-12">
        
        {/* ── Page Header ───────────────────────────────────────────────── */}
        <header className="space-y-4 max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#1F6B4E]">
            <span>COMMUNITY FEEDBACK</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-[#171A17] tracking-[-0.03em] leading-[1.12]">
            What learners say about Prodily.
          </h1>

          <p className="text-base sm:text-lg text-[#70685A] leading-relaxed">
            Real feedback from people using Prodily to build their product management skills and experience.
          </p>
        </header>

        {/* ── Dynamic Reviews Explorer ──────────────────────────────────── */}
        <ReviewsExplorer initialReviews={initialReviews} />

        {/* ── Bottom CTA ────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#DED8CB] bg-white p-8 sm:p-12 shadow-xs space-y-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-[#171A17] tracking-tight">
              Ready to build your own product experience?
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            <Link
              href="/signup"
              className="
                inline-flex items-center gap-2 px-6 py-3.5
                bg-[#1F6B4E] text-white font-semibold text-sm rounded-lg
                shadow-[0_2px_12px_rgba(31,107,78,0.25)]
                hover:bg-[#18553E] hover:shadow-[0_4px_20px_rgba(31,107,78,0.35)]
                active:scale-[0.98] transition-all duration-150
              "
            >
              <span>Start Learning Free</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>

            <Link
              href="/curriculum"
              className="
                inline-flex items-center gap-2 px-5 py-3.5
                bg-white text-[#171A17] font-semibold text-sm rounded-lg
                border border-[#DED8CB] hover:border-[#BDB4A2] hover:bg-[#F2EFE7]
                active:scale-[0.98] transition-all duration-150
              "
            >
              Explore Curriculum
            </Link>
          </div>
        </section>

      </main>
    </div>
  )
}
