import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { ShieldCheck, Lock, Database, Cookie, RefreshCw, ArrowLeft, Scale } from 'lucide-react'
import { GRIEVANCE_CONTACT, LEGAL_OPERATOR, operatorAddressLabel, operatorDescription } from '@/lib/legal/legal-config'
import { LEGAL_DOCS_REVISION_LABEL, PRIVACY_VERSION } from '@/lib/legal/consent'
import { OPTIONAL_COOKIE_DISCLOSURES } from '@/lib/legal/cookie-consent'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Comprehensive Privacy Policy for Prodily PM Academy detailing Supabase RLS security, learner data collection, analytics practices, and account deletion rights.',
  alternates: {
    canonical: `${siteUrl}/privacy`,
  },
  openGraph: {
    title: 'Privacy Policy | Prodily PM Academy',
    description: 'Prodily PM Academy privacy policy, data protection, and learner rights.',
    url: `${siteUrl}/privacy`,
    type: 'website',
    images: [{ url: BRAND.assets.ogImage, width: BRAND.assets.ogImageDimensions.width, height: BRAND.assets.ogImageDimensions.height, alt: 'Prodily PM Academy' }],
  },
  twitter: { card: 'summary_large_image', title: 'Privacy Policy | Prodily PM Academy', images: [BRAND.assets.ogImage] },
}

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 pt-24 pb-16 lg:pt-28 lg:pb-20 max-w-3xl space-y-10">
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-3 py-1.5 -ml-3 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Home</span>
      </Link>

      {/* Header */}
      <div className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5" /> Data Protection & Privacy
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Privacy Policy
        </h1>
        <p className="text-xs text-muted-foreground">
          Last updated: {LEGAL_DOCS_REVISION_LABEL} • Version {PRIVACY_VERSION} • {BRAND.fullName}
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
            This Privacy Policy applies to the web application, APIs, and educational services operated under {BRAND.fullName} (&quot;the Service&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;). It explains what information we collect when you access our platform ({BRAND.siteUrl}), how that data is stored and used, and the rights you have regarding your information.
          </p>
          <div className="p-3 rounded-lg border border-border bg-card/60 space-y-1 text-xs">
            <p className="font-bold text-foreground">Who controls your data</p>
            <p>
              {operatorDescription(BRAND.fullName)}
              {LEGAL_OPERATOR.registrationId ? ` Registration number: ${LEGAL_OPERATOR.registrationId}.` : ''}
              {LEGAL_OPERATOR.address ? ` ${operatorAddressLabel()}: ${LEGAL_OPERATOR.address}.` : ''}
            </p>
          </div>
          <p className="text-xs">
            Accounts are created only by individuals who confirm at signup that they accept these documents and are of the minimum age stated in the{' '}
            <Link href="/terms" className="font-semibold text-primary hover:underline">Terms of Service</Link>. The acceptance is recorded with a timestamp and the version of the documents shown.
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
              <strong className="text-foreground">Capstones & Certificates:</strong> Draft and submitted module capstone projects, earned achievement badges, and issued completion certificates. Each certificate is identified by a unique, randomly generated certificate code (`PMA-2026-XXXXXX`). Verification works by looking that code up against our certificate registry — there is no cryptographic hash or signature embedded in a certificate, and the code itself is the identifier.
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
              <p className="text-xs">Measures anonymous navigation flows (`curriculum_view`, `hero_cta_click`). GA4 is configured with default IP anonymization and collects <strong className="text-foreground">zero PII</strong> (no emails, names, quiz responses, or reflection text). GA4 and Google Tag Manager are <strong className="text-foreground">not loaded at all</strong> unless you accept optional cookies — see §6.</p>
            </div>
          </div>
        </section>

        {/* 6. Cookies */}
        <section id="cookies" className="space-y-3 scroll-mt-24">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Cookie className="w-5 h-5 text-primary inline" /> 6. Cookies & Local Storage
          </h2>

          <p className="text-xs font-bold text-foreground">Strictly necessary — always on</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong className="text-foreground">Authentication session cookies</strong> (`sb-access-token`, `sb-refresh-token`): HTTP-only cookies required to keep you signed in. Without them the Service cannot function, so they are not subject to consent.</li>
            <li><strong className="text-foreground">Cookie preference cookie</strong> (`prodily_cookie_consent`): Records the choice you make in the cookie banner, for 180 days, so we do not ask again.</li>
            <li><strong className="text-foreground">Local storage preferences:</strong> UI theme selection (`dark`, `light`, `system`), active tab state, and a client-side curriculum search index cache. Stored in your browser only and never sent to us.</li>
          </ul>

          <p className="text-xs font-bold text-foreground pt-2">Optional — set only after you accept</p>
          <p className="text-xs">
            None of the following is loaded or set until you choose &quot;Accept optional&quot; in the cookie banner. If you reject, the scripts are never injected and the cookies are never written. You can change your choice at any time using the <strong className="text-foreground">Cookie preferences</strong> control in the site footer.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            {OPTIONAL_COOKIE_DISCLOSURES.map((cookie) => (
              <li key={cookie.name}>
                <strong className="text-foreground">{cookie.name}:</strong> {cookie.purpose} Duration: {cookie.duration}.
              </li>
            ))}
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

        {/* 8. Grievance & Privacy Contact */}
        <section id="grievance" className="space-y-3 pt-4 border-t border-border scroll-mt-24">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary inline" /> 8. Grievance & Privacy Contact
          </h2>
          <p>
            Questions about this Privacy Policy, requests to access, correct or delete your data, and complaints about how your data has been handled all go to the contact below. We acknowledge every request within {GRIEVANCE_CONTACT.acknowledgementDays} days of receipt and aim to resolve it within {GRIEVANCE_CONTACT.resolutionDays} days.
          </p>
          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div>
              <p className="text-xs font-bold text-foreground">
                {GRIEVANCE_CONTACT.officerTitle ?? 'Grievance & Privacy Contact'}
              </p>
              {GRIEVANCE_CONTACT.officerName ? (
                <p className="text-xs text-muted-foreground">{GRIEVANCE_CONTACT.officerName}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A named grievance officer has not yet been designated. Until one is, requests are handled directly by the Platform operator at the address below.
                </p>
              )}
              {LEGAL_OPERATOR.address && (
                <p className="text-xs text-muted-foreground">{LEGAL_OPERATOR.address}</p>
              )}
            </div>
            <a
              href={`mailto:${GRIEVANCE_CONTACT.email ?? BRAND.supportEmail}`}
              className="inline-block text-xs font-bold text-primary hover:underline px-3 py-2 rounded-lg bg-primary/10 border border-primary/20"
            >
              {GRIEVANCE_CONTACT.email ?? BRAND.supportEmail}
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This Privacy Policy reflects a September 2026 internal legal and privacy audit and is pending review by qualified counsel before the Platform&apos;s final public launch. It is the operator&apos;s current, good-faith description of how the Service handles data, not legal advice.
          </p>
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
