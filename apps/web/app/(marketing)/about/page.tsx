import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { CheckCircle2, ArrowRight } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'About — Free Product Management Academy',
  description: 'Learn why Prodily PM Academy was created to offer a 90-lesson, business-school caliber Product Management education for free.',
  alternates: {
    canonical: `${siteUrl}/about`,
  },
  openGraph: {
    title: 'About — Prodily PM Academy',
    description: 'Learn why Prodily PM Academy was created to offer a 90-lesson, business-school caliber Product Management education for free.',
    url: `${siteUrl}/about`,
    type: 'website',
    images: [{
      url: BRAND.assets.ogImage,
      width: BRAND.assets.ogImageDimensions.width,
      height: BRAND.assets.ogImageDimensions.height,
      alt: 'Prodily PM Academy — Learn Product Management Free',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About — Prodily PM Academy',
    description: '90 lessons. 9 modules. Free forever. No paywalls.',
    images: [BRAND.assets.ogImage],
  },
}

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 pt-24 pb-16 lg:pt-28 lg:pb-20 max-w-4xl space-y-12">
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          Our Mission &amp; Philosophy
        </span>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Why {BRAND.fullName} is Free Forever
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          Product management education should be accessible to everyone—built with the academic rigor of a business school and the habit-building power of modern software.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-8 md:p-12 space-y-8 shadow-xs">
        <div className="space-y-4 text-foreground/90 leading-relaxed">
          <p className="text-lg font-medium text-foreground">
            A career switcher or ambitious builder learning product management today faces a broken choice: either wade through fragmented blog posts with zero structure, or pay $200 to $2,000 for superficial bootcamps.
          </p>

          <p className="text-sm md:text-base">
            We built {BRAND.fullName} to fill this gap. A complete 90-lesson curriculum organized into 9 progressive modules, 9 portfolio capstones, and interactive spaced-repetition flashcards—completely free with zero paywalled content.
          </p>
        </div>

        <div className="border-t border-border pt-8 space-y-6">
          <h2 className="text-2xl font-bold font-serif text-foreground">
            Our Four Product Principles
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>1. Academic Depth Over Gimmicks</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Gamification serves memory retention and daily study habits—it never replaces rigorous product management strategy.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>2. 100% Free Forever</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No credit cards, no fake free trials, no locked lesson 11 onward. The entire core curriculum is open for all.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>3. Proof of Skill, Not Just Certificates</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Every module ends with an applied capstone project you can publish and present directly in job interviews.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>4. Respect the Learner&apos;s Time</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Clear estimated reading times, self-paced progression, and structured learning paths built for busy professionals.
              </p>
            </div>
          </div>
        </div>

        {/* Creator & Support Box */}
        <div className="pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground font-serif">
              Built by Aditya Gangwani
            </h3>
            <p className="text-xs text-muted-foreground">
              Dedicated to democratizing serious product judgment and craft.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={BRAND.social.buyMeACoffee}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
            >
              <span>☕ Support on Buy Me a Coffee</span>
            </Link>

            <Link
              href="/signup"
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all flex items-center gap-1.5"
            >
              <span>Start Learning Free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
