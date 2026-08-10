import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { FileText, CheckCircle2, ShieldAlert, Award, FileCode, AlertCircle, Mail } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Prodily PM Academy outlining free-forever curriculum commitment, acceptable use, intellectual property, certificates, and learner guidelines.',
  openGraph: {
    title: 'Terms of Service — Prodily PM Academy',
    description: 'Prodily PM Academy terms of service, acceptable use, and platform policies.',
    url: `${siteUrl}/terms`,
    type: 'website',
    images: [{ url: BRAND.assets.ogImage, width: BRAND.assets.ogImageDimensions.width, height: BRAND.assets.ogImageDimensions.height, alt: 'Prodily PM Academy' }],
  },
  twitter: { card: 'summary_large_image', title: 'Terms of Service — Prodily PM Academy', images: [BRAND.assets.ogImage] },
}

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl space-y-10">
      {/* Header */}
      <div className="space-y-3 border-b border-border pb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" /> Platform Terms & Rules
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Terms of Service
        </h1>
        <p className="text-xs text-muted-foreground">
          Last updated: August 2026 • Published by {BRAND.legalEntity} ({BRAND.fullName})
        </p>
      </div>

      {/* Main Content */}
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm text-muted-foreground leading-relaxed">
        {/* Core Guarantee */}
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-foreground space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-primary">
            <CheckCircle2 className="w-4 h-4" /> Free-Forever Core Curriculum Commitment
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {BRAND.fullName} provides the complete 90-lesson Product Management curriculum, interactive quizzes, spaced-repetition flashcards, skill radar analytics, capstones, and completion certificates <strong className="text-foreground font-semibold">100% free of charge</strong>. There are no mandatory subscriptions, hidden paywalls, paywalled lesson locks, or credit card requirements to complete the core curriculum.
          </p>
        </div>

        {/* 1. Agreement */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            1. Acceptance of Terms
          </h2>
          <p>
            By creating an account, accessing, or using {BRAND.fullName} (&quot;the Service&quot;, &quot;the Platform&quot;), operated by {BRAND.legalEntity} (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), you agree to comply with and be legally bound by these Terms of Service (&quot;Terms&quot;). If you do not agree with these Terms, you must not access or use the Platform.
          </p>
        </section>

        {/* 2. Eligibility & Accounts */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            2. Account Eligibility & Responsibilities
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-xs">
            <li>
              <strong className="text-foreground">Minimum Age:</strong> You must be at least 13 years of age (or the minimum legal age required in your jurisdiction) to register for an account.
            </li>
            <li>
              <strong className="text-foreground">Registration Accuracy:</strong> You agree to provide accurate, current information when creating an account.
            </li>
            <li>
              <strong className="text-foreground">Credential Security:</strong> You are responsible for safeguarding your login credentials and for all learning activity, progress updates, or submissions taking place under your account.
            </li>
          </ul>
        </section>

        {/* 3. Acceptable Use */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary inline" /> 3. Acceptable Use & Conduct Guidelines
          </h2>
          <p>
            You agree to use the Platform strictly for lawful educational and career development purposes. You must not engage in any of the following prohibited activities:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs">
            <li>Attempting to bypass, probe, or breach platform security, authentication APIs, or rate-limiting controls.</li>
            <li>Using automated bots, scrapers, or scripts to bulk-extract curriculum content, quiz question banks, or platform code.</li>
            <li>Uploading malicious code, unauthorized scripts, or harmful input into reflection notes, feedback forms, or capstone text.</li>
            <li>Submitting plagiarized, offensive, or fraudulent content for capstones or feedback moderation.</li>
            <li>Impersonating another learner, administrator, or misrepresenting your identity or certificate status.</li>
          </ul>
        </section>

        {/* 4. Intellectual Property */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <FileCode className="w-5 h-5 text-primary inline" /> 4. Intellectual Property Rights
          </h2>
          <div className="space-y-3 text-xs">
            <p>
              <strong className="text-foreground font-semibold">Platform Materials:</strong> All 90 curriculum lessons, structured text, interactive quiz banks, SVG diagrams, compiler code, site graphics, trademarks ({BRAND.company}, {BRAND.product}), and brand assets are the exclusive intellectual property of {BRAND.legalEntity} and protected by copyright and intellectual property laws.
            </p>
            <p>
              <strong className="text-foreground font-semibold">Learner-Generated Content:</strong> You retain 100% ownership of your written capstone projects, self-reflection responses, and portfolio summaries. By setting your portfolio to public, you grant {BRAND.fullName} a non-exclusive, worldwide license to render and display your public portfolio page.
            </p>
          </div>
        </section>

        {/* 5. Certificates */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Award className="w-5 h-5 text-primary inline" /> 5. Certificates & Credentials
          </h2>
          <p className="text-xs leading-relaxed">
            Completion certificates issued by {BRAND.fullName} (`PMA-2026-XXXXXX`) represent digital badges of accomplishment based on curriculum progress. Certificates are non-transferable. We reserve the right to revoke or invalidate any certificate if it was obtained through automated exploits, dishonest submissions, or severe policy violations.
          </p>
        </section>

        {/* 6. Disclaimers */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-primary inline" /> 6. Service Disclaimers & Limitations
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-xs">
            <li>
              <strong className="text-foreground">Educational Nature:</strong> The Service provides self-paced educational materials for professional development. Completion of lessons or earning certificates does not constitute formal university accreditation or guarantee employment, job placement, or salary increases.
            </li>
            <li>
              <strong className="text-foreground">&quot;As-Is&quot; Provision:</strong> The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind, whether express or implied. To the maximum extent permitted by law, {BRAND.legalEntity} disclaims all warranties.
            </li>
            <li>
              <strong className="text-foreground">Limitation of Liability:</strong> In no event shall {BRAND.legalEntity} or its contributors be liable for any indirect, incidental, or consequential damages arising out of your access to or inability to access the Platform.
            </li>
          </ul>
        </section>

        {/* 7. Termination */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            7. Termination & Account Cancellation
          </h2>
          <p className="text-xs leading-relaxed">
            You may terminate your account at any time via <strong className="text-foreground">Settings → Danger Zone → Delete Account</strong>. We reserve the right to suspend or terminate access to the Service for users who violate these Terms or threaten platform integrity.
          </p>
        </section>

        {/* 8. Support Contact */}
        <section className="space-y-3 pt-4 border-t border-border">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary inline" /> 8. Support & Legal Inquiries
          </h2>
          <p className="text-xs">
            If you have questions or concerns regarding these Terms, please contact our support team:
          </p>
          <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-foreground">Legal & Support Office</p>
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

      {/* Footer links */}
      <div className="pt-6 border-t border-border flex items-center justify-between text-xs">
        <Link href="/" className="font-bold text-primary hover:underline">
          ← Back to Homepage
        </Link>
        <Link href="/privacy" className="font-bold text-muted-foreground hover:text-foreground">
          View Privacy Policy →
        </Link>
      </div>
    </div>
  )
}
