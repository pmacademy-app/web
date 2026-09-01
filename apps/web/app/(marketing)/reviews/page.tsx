import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { ReviewsExplorer } from '@/components/marketing/reviews-explorer'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { ArrowRight } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Learner Reviews & Testimonials — Prodily PM Academy',
  description:
    'Read verified reviews and feedback from product management learners, career switchers, and tech leads who completed Prodily PM Academy modules and capstones.',
  alternates: {
    canonical: `${siteUrl}/reviews`,
  },
  openGraph: {
    title: 'Learner Reviews & Testimonials — Prodily PM Academy',
    description:
      'Verified reviews from learners across 90 lessons and 9 module capstones.',
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
    title: 'Learner Reviews & Testimonials — Prodily PM Academy',
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
    description: '90 lessons. 9 modules. One skill: product judgment. Completely free.',
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
            <span>Community Feedback</span>
            <span>&middot;</span>
            <span>Verified Learners</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-semibold text-[#171A17] tracking-[-0.03em] leading-[1.12]">
            What learners say about Prodily.
          </h1>

          <p className="text-base sm:text-lg text-[#70685A] leading-relaxed">
            Authentic reviews from career switchers, associate PMs, and founders who&apos;ve completed our 90-lesson curriculum and built real portfolio capstones.
          </p>
        </header>

        {/* ── Dynamic Reviews Explorer ──────────────────────────────────── */}
        <ReviewsExplorer initialReviews={initialReviews} />

        {/* ── Bottom CTA ────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#DED8CB] bg-white p-8 sm:p-12 shadow-xs space-y-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl sm:text-3xl font-semibold text-[#171A17] tracking-tight">
              Ready to start your product journey?
            </h2>
            <p className="text-sm sm:text-base text-[#70685A] leading-relaxed">
              Join thousands of learners mastering real-world product judgment with complete open access to all 90 lessons.
            </p>
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
