import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { FileText } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Terms of Service — Prodily PM Academy',
  description: 'Terms of Service for Prodily PM Academy.',
  openGraph: {
    title: 'Terms of Service — Prodily PM Academy',
    description: 'Prodily PM Academy terms of service and usage policies.',
    url: `${siteUrl}/terms`,
    type: 'website',
    images: [{ url: BRAND.assets.ogImage, width: BRAND.assets.ogImageDimensions.width, height: BRAND.assets.ogImageDimensions.height, alt: 'Prodily PM Academy' }],
  },
  twitter: { card: 'summary_large_image', title: 'Terms of Service — Prodily PM Academy', images: [BRAND.assets.ogImage] },
}

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl space-y-8">
      <div className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" /> Legal Notice
        </div>
        <h1 className="text-4xl font-bold font-serif text-foreground">
          Terms of Service
        </h1>
        <p className="text-xs text-muted-foreground">
          Last updated: August 2026 • {BRAND.fullName}
        </p>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
        <p className="text-base text-foreground font-medium">
          Welcome to {BRAND.fullName}. By accessing or using our platform, you agree to these Terms of Service.
        </p>

        <h2 className="text-xl font-bold font-serif text-foreground pt-4">
          Free Forever Commitment
        </h2>
        <p>
          {BRAND.fullName} provides a complete 90-lesson Product Management curriculum free of charge. There are no paywalls, hidden fees, or subscription charges for access to the core educational content.
        </p>

        <h2 className="text-xl font-bold font-serif text-foreground pt-4">
          Acceptable Use
        </h2>
        <p>
          Learners agree to use the platform for lawful educational purposes and refrain from attempting to disrupt service integrity, submit malicious input, or misrepresent capstone authorship.
        </p>

        <h2 className="text-xl font-bold font-serif text-foreground pt-4">
          Intellectual Property
        </h2>
        <p>
          All curriculum materials, interactive exercises, and brand marks are owned by {BRAND.legalEntity}. Your submitted capstone projects remain your own intellectual property.
        </p>

        <h2 className="text-xl font-bold font-serif text-foreground pt-4">
          Contact Us
        </h2>
        <p>
          For questions regarding these Terms, contact us at{' '}
          <a href={`mailto:${BRAND.supportEmail}`} className="text-primary underline">
            {BRAND.supportEmail}
          </a>.
        </p>
      </div>

      <div className="pt-8 border-t border-border">
        <Link href="/" className="text-xs font-bold text-primary hover:underline">
          ← Back to Homepage
        </Link>
      </div>
    </div>
  )
}
