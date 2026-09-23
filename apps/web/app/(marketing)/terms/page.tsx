import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { FileText, CheckCircle2, ShieldAlert, Award, FileCode, AlertCircle, ArrowLeft, Scale } from 'lucide-react'
import { GRIEVANCE_CONTACT, LEGAL_OPERATOR, operatorAddressLabel, operatorDescription } from '@/lib/legal/legal-config'
import { LEGAL_DOCS_REVISION_LABEL, MINIMUM_SIGNUP_AGE, TERMS_VERSION } from '@/lib/legal/consent'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Prodily PM Academy outlining free-forever curriculum commitment, acceptable use, intellectual property, certificates, and learner guidelines.',
  alternates: {
    canonical: `${siteUrl}/terms`,
  },
  openGraph: {
    title: 'Terms of Service | Prodily PM Academy',
    description: 'Prodily PM Academy terms of service, acceptable use, and platform policies.',
    url: `${siteUrl}/terms`,
    type: 'website',
    images: [{ url: BRAND.assets.ogImage, width: BRAND.assets.ogImageDimensions.width, height: BRAND.assets.ogImageDimensions.height, alt: 'Prodily PM Academy' }],
  },
  twitter: { card: 'summary_large_image', title: 'Terms of Service | Prodily PM Academy', images: [BRAND.assets.ogImage] },
}

export default function TermsPage() {
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
          <FileText className="w-3.5 h-3.5" /> Platform Terms & Rules
        </div>
        <h1 className="text-4xl md:text-5xl font-bold font-serif text-foreground">
          Terms of Service
        </h1>
        <p className="text-xs text-muted-foreground">
          Last updated: {LEGAL_DOCS_REVISION_LABEL} • Version {TERMS_VERSION} • {BRAND.fullName}
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
            By creating an account, accessing, or using {BRAND.fullName} (&quot;the Service&quot;, &quot;the Platform&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;), you agree to comply with and be legally bound by these Terms of Service (&quot;Terms&quot;). If you do not agree with these Terms, you must not access or use the Platform.
          </p>
          <p>
            Agreement is captured explicitly: the signup form requires you to tick a box confirming you have read and accept these Terms and the{' '}
            <Link href="/privacy" className="font-semibold text-primary hover:underline">Privacy Policy</Link>{' '}
            before an account can be created, and that acceptance is recorded with a timestamp and the version of the documents you were shown.
          </p>
          <div className="p-3 rounded-lg border border-border bg-card/60 space-y-1 text-xs">
            <p className="font-bold text-foreground">Who operates this Service</p>
            <p>
              {operatorDescription(BRAND.fullName)}
              {LEGAL_OPERATOR.registrationId ? ` Registration number: ${LEGAL_OPERATOR.registrationId}.` : ''}
              {LEGAL_OPERATOR.address ? ` ${operatorAddressLabel()}: ${LEGAL_OPERATOR.address}.` : ''}
            </p>
          </div>
        </section>

        {/* 2. Eligibility & Accounts */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            2. Account Eligibility & Responsibilities
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-xs">
            <li>
              <strong className="text-foreground">Minimum Age ({MINIMUM_SIGNUP_AGE}+):</strong> Self-service registration is available only to individuals who are at least {MINIMUM_SIGNUP_AGE} years of age, or older where your jurisdiction requires a higher age. You must confirm this at signup. We do not knowingly create accounts for anyone under {MINIMUM_SIGNUP_AGE} and we do not operate a verifiable parental-consent process, so the Platform is not available to under-{MINIMUM_SIGNUP_AGE} learners at this time. If we learn that an account belongs to someone under {MINIMUM_SIGNUP_AGE}, we will delete it.
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
              <strong className="text-foreground font-semibold">Platform Materials:</strong> All 90 curriculum lessons, structured text, interactive quiz banks, SVG diagrams, compiler code, site graphics, trademarks ({BRAND.company}, {BRAND.product}), and brand assets are the exclusive intellectual property of the Platform operator and protected by copyright and intellectual property laws.
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
              <strong className="text-foreground">&quot;As-Is&quot; Provision:</strong> The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind, whether express or implied. To the maximum extent permitted by law, the Platform operator disclaims all warranties.
            </li>
            <li>
              <strong className="text-foreground">Limitation of Liability:</strong> In no event shall the Platform operator or its contributors be liable for any indirect, incidental, or consequential damages arising out of your access to or inability to access the Platform.
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

        {/* 8. Grievance & Legal Contact */}
        <section id="grievance" className="space-y-3 pt-4 border-t border-border scroll-mt-24">
          <h2 className="text-xl font-bold font-serif text-foreground flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary inline" /> 8. Grievance & Legal Contact
          </h2>
          <p className="text-xs">
            Complaints about these Terms, about content on the Platform, or about how your data is handled go to the contact below. We acknowledge every grievance within {GRIEVANCE_CONTACT.acknowledgementDays} days of receipt and aim to resolve it within {GRIEVANCE_CONTACT.resolutionDays} days.
          </p>
          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div>
              <p className="text-xs font-bold text-foreground">
                {GRIEVANCE_CONTACT.officerTitle ?? 'Grievance & Legal Contact'}
              </p>
              {GRIEVANCE_CONTACT.officerName ? (
                <p className="text-xs text-muted-foreground">{GRIEVANCE_CONTACT.officerName}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A named grievance officer has not yet been designated. Until one is, grievances are handled directly by the Platform operator at the address below.
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
            These Terms reflect a September 2026 internal legal and privacy audit and are pending review by qualified counsel before the Platform&apos;s final public launch. They are the operator&apos;s current, good-faith statement of how the Service works, not legal advice.
          </p>
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
