import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { Mail, Heart, ArrowRight } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Contact Us — Prodigy PM Academy',
  description: 'Get in touch with the Prodigy PM Academy team for support, feedback, or inquiries.',
  openGraph: {
    title: 'Contact — Prodigy PM Academy',
    description: 'Get in touch with the PM Academy team for support, feedback, or questions.',
    url: `${siteUrl}/contact`,
    type: 'website',
    images: [{
      url: BRAND.assets.ogImage,
      width: BRAND.assets.ogImageDimensions.width,
      height: BRAND.assets.ogImageDimensions.height,
      alt: 'Prodigy PM Academy',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact — Prodigy PM Academy',
    description: 'Get in touch with the PM Academy team.',
    images: [BRAND.assets.ogImage],
  },
}

export default function ContactPage() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl space-y-12">
      <div className="text-center space-y-4 max-w-xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          Get in Touch
        </span>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Contact {BRAND.shortName}
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Have a question, feedback, or issue? We are here to help you get the most out of your PM learning journey.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Support Email Box */}
        <div className="p-8 rounded-2xl border border-border bg-card space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold font-serif text-foreground">
              Direct Support Email
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Send us an email directly for account help, bugs, or general feedback.
            </p>
          </div>

          <a
            href={`mailto:${BRAND.supportEmail}`}
            className="text-sm font-bold text-primary hover:underline inline-flex items-center gap-1.5 pt-2"
          >
            <span>{BRAND.supportEmail}</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Support Creator Box */}
        <div className="p-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Heart className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold font-serif text-foreground">
              Support Our Mission
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {BRAND.product} is 100% free. If our curriculum helped you land a job or build a product, consider supporting us.
            </p>
          </div>

          <Link
            href={BRAND.social.buyMeACoffee}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-all self-start"
          >
            <span>☕ Buy Me a Coffee</span>
          </Link>
        </div>
      </div>

      {/* FAQs shortcut */}
      <div className="p-8 rounded-2xl border border-border bg-card/60 text-center space-y-3">
        <h3 className="text-base font-bold font-serif text-foreground">
          Looking for quick answers?
        </h3>
        <p className="text-xs text-muted-foreground">
          Check out our frequently asked questions on the homepage.
        </p>
        <Link
          href="/#faq"
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
        >
          <span>View Frequently Asked Questions</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}
