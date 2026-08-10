import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { ShieldCheck, Lock, Database, Mail, Cookie, RefreshCw } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Comprehensive Privacy Policy for Prodily PM Academy detailing Supabase RLS security, learner data collection, analytics practices, and account deletion rights.',
  openGraph: {
    title: 'Privacy Policy — Prodily PM Academy',
    description: 'Prodily PM Academy privacy policy, data protection, and learner rights.',
    url: `${siteUrl}/privacy`,
    type: 'website',
    images: [{ url: BRAND.assets.ogImage, width: BRAND.assets.ogImageDimensions.width, height: BRAND.assets.ogImageDimensions.height, alt: 'Prodily PM Academy' }],
  },
  twitter: { card: 'summary_large_image', title: 'Privacy Policy — Prodily PM Academy', images: [BRAND.assets.ogImage] },
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl space-y-10">
      {/* Header */}
      <div className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5" /> Data Protection & Privacy
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Privacy Policy
        </h1>
        <p className="text-xs text-muted-foreground">
          Last updated: August 2026 • Published by {BRAND.legalEntity} ({BRAND.fullName})
        </p>
      </div>

      {/* Main Content */}
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-foreground space-y-2">
          <p className="font-semibold text-sm">
            Core Privacy Principle
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {BRAND.fullName} is designed around learner data ownership and privacy. We do not sell, rent, or trade your personal data. Your learning progress, spaced-repetition (SRS) records, quiz answers, and private reflection notes belong strictly to you.
          </p>
        </div>

        {/* 1. Controller */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            1. Data Controller & Scope
          </h2>
          <p>
            This Privacy Policy applies to the web application, APIs, and educational services operated under {BRAND.fullName} (&quot;the Service&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;), an initiative of {BRAND.legalEntity}. It explains what information we collect when you access our platform ({BRAND.siteUrl}), how that data is stored and used, and the rights you have regarding your information.
          </p>
        </section>

        {/* 2. Information We Collect */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Database className="w-5 h-5 text-primary inline" /> 2. Information We Collect
          </h2>
          <p>
            To deliver an interactive, gamified 90-lesson Product Management learning experience, we process specific categories of data based on your platform interactions:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs">
            <li>
              <strong className="text-foreground">Authentication Credentials:</strong> When registering, we store your email address and authentication identity securely.
            </li>
            <li>
              <strong className="text-foreground">Learner Profile:</strong> Your optional display name, handle (username), avatar image, bio, target role, target company, career stage, and professional links (LinkedIn, GitHub, Twitter). Profiles are <strong className="text-foreground">private by default</strong> unless you explicitly enable public portfolio sharing.
            </li>
            <li>
              <strong className="text-foreground">Learning Activity & Progress:</strong> Completed lesson records, quiz attempt scores, total XP earned (recorded via an immutable progress ledger), active streaks, spaced-repetition (SRS) flashcard schedules, lesson bookmarks, and private self-reflection notes.
            </li>
            <li>
              <strong className="text-foreground">Capstones & Certificates:</strong> Draft and submitted module capstone projects, earned achievement badges, and issued completion certificates (`PMA-2026-XXXXXX`) with cryptographic verification hashes.
            </li>
            <li>
              <strong className="text-foreground">Support & Feedback:</strong> Messages and ratings submitted through our feedback tools or direct support communications.
            </li>
          </ul>
        </section>

        {/* 3. How We Use Data */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            3. How We Use Your Information
          </h2>
          <p>We process your data strictly to operate and improve the educational service:</p>
          <ul className="list-disc pl-5 space-y-2 text-xs">
            <li>Persisting your lesson progress, streak counters, and Skill Radar competency analytics across devices.</li>
            <li>Scheduling spaced-repetition (SRS) review queues for active flashcards.</li>
            <li>Issuing verifiable digital completion certificates and rendering optional public portfolios (`/p/[username]`).</li>
            <li>Sending essential transactional emails (account verification, password resets, level-up milestones, and weekly recaps) via Resend.</li>
            <li>Maintaining platform security, rate limiting, and preventing automated abuse.</li>
          </ul>
        </section>

        {/* 4. Security & RLS */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary inline" /> 4. Data Security & Row Level Security (RLS)
          </h2>
          <p>
            We implement industry-standard technical controls to ensure your data remains confidential and secure:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs">
            <li>
              <strong className="text-foreground">Row Level Security (RLS):</strong> 100% of user-owned database tables in Supabase enforce strict RLS policies. Your learning progress, reflection notes, and settings can only be accessed by your authenticated session.
            </li>
            <li>
              <strong className="text-foreground">Secure Cookie Transport:</strong> Authentication session tokens are stored in HTTP-only, encrypted cookies (`SameSite=Lax`, `Secure` in production) to prevent client-side XSS extraction.
            </li>
            <li>
              <strong className="text-foreground">Zero Client Secret Leaks:</strong> Administrative service keys are restricted strictly to server-side API routes and are never bundled into client browser JavaScript.
            </li>
          </ul>
        </section>

        {/* 5. Subprocessors & Analytics */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            5. Third-Party Service Subprocessors
          </h2>
          <p>We work with a minimal set of trusted cloud infrastructure providers:</p>
          <div className="grid grid-cols-1 gap-3 pt-1">
            <div className="p-3 rounded-lg border border-border bg-card/60 space-y-1">
              <span className="font-bold text-xs text-foreground">Supabase Inc. (Database & Auth Infrastructure)</span>
              <p className="text-xs">Stores encrypted user profiles, application state, and handles authentication sessions.</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/60 space-y-1">
              <span className="font-bold text-xs text-foreground">Resend Inc. (Transactional Email Delivery)</span>
              <p className="text-xs">Processes recipient email addresses strictly for delivering system notifications and transactional emails. We honor direct unsubscribe preferences on non-critical categories.</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card/60 space-y-1">
              <span className="font-bold text-xs text-foreground">Google Analytics 4 (Aggregate Usage Metrics)</span>
              <p className="text-xs">Measures anonymous navigation flows (`curriculum_view`, `hero_cta_click`). GA4 is configured with default IP anonymization and collects <strong className="text-foreground">zero PII</strong> (no emails, names, quiz responses, or reflection text).</p>
            </div>
          </div>
        </section>

        {/* 6. Cookies */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Cookie className="w-5 h-5 text-primary inline" /> 6. Cookies & Local Storage
          </h2>
          <p>
            We use minimal cookies and local browser storage essential for service operation:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong className="text-foreground">Essential Session Cookies:</strong> Encrypted authentication session cookies required to maintain your logged-in state across browser sessions.</li>
            <li><strong className="text-foreground">Local Storage Preferences:</strong> Storing UI theme selection (`dark`, `light`, `system`), active tab state, and client-side curriculum search index cache for fast search.</li>
          </ul>
        </section>

        {/* 7. Permanent Account Deletion */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary inline" /> 7. Permanent Account Deletion & Rights
          </h2>
          <p>
            You retain full right to access, export, or permanently delete your account data at any time:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs">
            <li>
              <strong className="text-foreground">Self-Service Permanent Deletion:</strong> Navigating to <strong className="text-foreground">Settings → Danger Zone → Delete Account</strong> triggers a hard cascading deletion. This permanently purges your user profile, progress rows, XP events, capstone drafts, SRS flashcards, reflection notes, and deletes your identity from Supabase Auth.
            </li>
            <li>
              <strong className="text-foreground">Data Export & Rectification:</strong> You may update your profile details at any time via Settings or contact support to request a copy of your personal data.
            </li>
          </ul>
        </section>

        {/* 8. Support Contact */}
        <section className="space-y-3 pt-4 border-t border-border">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary inline" /> 8. Contact & Privacy Inquiries
          </h2>
          <p>
            If you have any questions regarding this Privacy Policy or wish to exercise your privacy rights, please reach out directly:
          </p>
          <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-foreground">Support & Privacy Office</p>
              <p className="text-xs text-muted-foreground">{BRAND.fullName} ({BRAND.legalEntity})</p>
            </div>
            <a
              href={`mailto:${BRAND.supportEmail}`}
              className="text-xs font-bold text-primary hover:underline px-3 py-2 rounded-lg bg-primary/10 border border-primary/20"
            >
              {BRAND.supportEmail}
            </a>
          </div>
        </section>
      </div>

      {/* Footer link */}
      <div className="pt-6 border-t border-border flex items-center justify-between text-xs">
        <Link href="/" className="font-bold text-primary hover:underline">
          ← Back to Homepage
        </Link>
        <Link href="/terms" className="font-bold text-muted-foreground hover:text-foreground">
          View Terms of Service →
        </Link>
      </div>
    </div>
  )
}
