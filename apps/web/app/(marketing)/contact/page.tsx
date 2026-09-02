import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactForm } from '@/components/contact/ContactForm'
import { BRAND } from '@/lib/brand'
import { Mail, Heart, ArrowRight } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Contact Prodily PM Academy',
  description:
    'Have a question, need support, or want to share feedback? Contact the Prodily PM Academy team.',
  alternates: {
    canonical: `${siteUrl}/contact`,
  },
  openGraph: {
    title: 'Contact Prodily PM Academy',
    description:
      'Have a question, need support, or want to share feedback? Contact the Prodily PM Academy team.',
    url: `${siteUrl}/contact`,
    type: 'website',
    images: [{
      url: BRAND.assets.ogImage,
      width: BRAND.assets.ogImageDimensions.width,
      height: BRAND.assets.ogImageDimensions.height,
      alt: 'Prodily PM Academy',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Prodily PM Academy',
    description: 'Get in touch with the Prodily PM Academy team.',
    images: [BRAND.assets.ogImage],
  },
}

export default function ContactPage() {
  return (
    <div className="container mx-auto px-4 pt-24 pb-16 lg:pt-28 lg:pb-20 max-w-3xl space-y-12">
      <div className="text-center space-y-4 max-w-xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          GET IN TOUCH
        </span>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Have a question? Let&apos;s talk.
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Questions about the curriculum, a technical issue, feedback, or something else? Send us a message and we&apos;ll get back to you.
        </p>
      </div>

      {/* Contact Form */}
      <ContactForm />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Support Email Box */}
        <div className="p-8 rounded-2xl border border-border bg-card space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold font-serif text-foreground">
              Need direct support?
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Email us if you&apos;re stuck, found a problem, or have a question about the curriculum.
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
              {BRAND.fullName} is 100% free. If our curriculum helped you build product skills or start your career, consider supporting us.
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
        <h3 className="text-base font-bold text-foreground">
          Looking for a quick answer?
        </h3>
        <p className="text-xs text-muted-foreground">
          Browse the most common questions about Prodily.
        </p>
        <Link
          href="/faq"
          className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
        >
          <span>View FAQs</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}
