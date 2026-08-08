import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { ShieldCheck } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Privacy Policy — Prodigy PM Academy',
  description: 'Privacy Policy for Prodigy PM Academy.',
  openGraph: {
    title: 'Privacy Policy — Prodigy PM Academy',
    description: 'Prodigy PM Academy privacy policy and data handling practices.',
    url: `${siteUrl}/privacy`,
    type: 'website',
    images: [{ url: BRAND.assets.ogImage, width: BRAND.assets.ogImageDimensions.width, height: BRAND.assets.ogImageDimensions.height, alt: 'Prodigy PM Academy' }],
  },
  twitter: { card: 'summary_large_image', title: 'Privacy Policy — Prodigy PM Academy', images: [BRAND.assets.ogImage] },
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl space-y-8">
      <div className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5" /> Legal Notice
        </div>
        <h1 className="text-4xl font-bold font-serif text-foreground">
          Privacy Policy
        </h1>
        <p className="text-xs text-muted-foreground">
          Last updated: August 2026 • {BRAND.fullName}
        </p>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
        <p className="text-base text-foreground font-medium">
          {BRAND.fullName} is committed to protecting your privacy and ensuring a secure learning environment.
        </p>

        <p>
          We do not sell or monetize personal learner data. Your learning progress, SRS review records, capstones, and badges belong strictly to you.
        </p>

        <h2 className="text-xl font-bold font-serif text-foreground pt-4">
          Information We Collect
        </h2>
        <p>
          When you register for an account, we collect your email address and basic profile information to authenticate your session and persist your progress.
        </p>

        <h2 className="text-xl font-bold font-serif text-foreground pt-4">
          Data Security
        </h2>
        <p>
          All data is protected using Row Level Security (RLS) policies in Supabase, preventing cross-tenant access. Session tokens are stored in secure httpOnly cookies.
        </p>

        <h2 className="text-xl font-bold font-serif text-foreground pt-4">
          Contact Us
        </h2>
        <p>
          If you have any questions regarding your data or wish to delete your account, you can use the Permanent Delete Account tool in your Settings or email us at{' '}
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
