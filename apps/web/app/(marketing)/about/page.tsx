import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { getAboutPageSchema } from '@/lib/schema'
import { CheckCircle2, ArrowRight } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'About Prodily PM Academy',
  description:
    "Learn why Prodily exists and how we're making structured product management education more accessible.",
  alternates: {
    canonical: `${siteUrl}/about`,
  },
  openGraph: {
    title: 'About Prodily PM Academy',
    description:
      "Learn why Prodily exists and how we're making structured product management education more accessible.",
    url: `${siteUrl}/about`,
    type: 'website',
    images: [{
      url: BRAND.assets.ogImage,
      width: BRAND.assets.ogImageDimensions.width,
      height: BRAND.assets.ogImageDimensions.height,
      alt: 'About Prodily PM Academy',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Prodily PM Academy',
    description: 'Learn why Prodily exists and our mission to make PM education accessible.',
    images: [BRAND.assets.ogImage],
  },
}

export default function AboutPage() {
  const aboutSchema = getAboutPageSchema()

  return (
    <div className="container mx-auto px-4 pt-24 pb-16 lg:pt-28 lg:pb-20 max-w-4xl space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          OUR MISSION
        </span>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Make serious product management education accessible to everyone.
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          Prodily PM Academy exists to give aspiring product managers a structured way to learn, practice, and build proof of their product thinking without putting the core curriculum behind a paywall.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-8 md:p-12 space-y-8 shadow-xs">
        <div className="space-y-4 text-foreground/90 leading-relaxed">
          <p className="text-lg font-medium text-foreground">
            Learning product management shouldn&apos;t require choosing between scattered free resources and an expensive program before you can even discover whether product is the right path for you.
          </p>

          <p className="text-sm md:text-base">
            Prodily brings the structure of a complete curriculum together with interactive practice and applied capstones, so learning doesn&apos;t stop at understanding a framework — it continues into doing the work.
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
                <span>1. Depth over gimmicks</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Interactive mechanics support serious product thinking. The goal is better judgment, not more badges.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>2. Free access to the core curriculum</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The core 90-lesson curriculum is free, permanently, without paywalled lessons blocking the learning path.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>3. Proof of skill</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Learning should leave you with work you can explain, refine, and showcase — not only a completion credential.
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-2">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>4. Respect the learner&apos;s time</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Clear progression, estimated reading times, and focused learning formats help learners make steady progress without unnecessary friction.
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
              Prodily is an independent effort to make serious product management education more accessible and more practical.
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
              className="px-5 py-2.5 rounded-xl bg-primary text-white hover:text-white font-bold text-xs hover:bg-primary/90 transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:text-white"
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
