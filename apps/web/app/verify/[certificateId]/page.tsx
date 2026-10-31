import type { Metadata } from 'next'
import Link from 'next/link'
import { getDedupedVerifiedCertificate } from '@/lib/certificates-db'
import { generateCredentialJsonLd } from '@/lib/certificates'
import { CertificateCard } from '@/components/certificates/CertificateCard'
import { CertificateActions } from '@/components/certificates/CertificateActions'
import { VerificationBadge } from '@/components/certificates/VerificationBadge'
import { Award, AlertCircle, ArrowLeft, BookOpen, Layers, Zap, User } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'
import {
  CERTIFICATE_REQUIREMENT_STATEMENT,
  MODULE_CERTIFICATE_REQUIREMENT_STATEMENT,
  TEST_CERTIFICATE_EXPLANATION,
  TEST_CERTIFICATE_LABEL,
  getVerifyPageCopy,
} from '@/lib/certificates/presentation'

interface PageProps {
  params: Promise<{ certificateId: string }>
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl

/**
 * Issued certificates are effectively immutable, so this page is cached rather than
 * rendered per request.
 *
 * Evidence, not assumption: the `certificates` table has no revocation, status or
 * validity column — its columns are career_title, certificate_code, id, issued_at,
 * learner_name, lessons_completed, level, module_slug, modules_completed, total_xp,
 * type and user_id — and no migration adds one. Nothing in the app updates a
 * certificate after issuance: the admin dev test-certificate generator only inserts
 * its own `TEST-` rows. There is consequently no revocation to propagate.
 *
 * A `TEST-` row resolves here like any other, so the page words it as a test
 * certificate (see `getVerifyPageCopy`) rather than as a verified credential.
 *
 * The one genuinely live part is the display join: `verifyCertificate()` resolves the
 * holder's current `name`, `username` and `avatar_url`. An hour bounds how long a
 * renamed holder shows their previous name — cosmetic, and nothing about the
 * verification verdict depends on it.
 *
 * Nothing private is embedded: the payload is the certificate plus public profile
 * display fields, the page reads no cookies or headers, and it performs no mutation
 * and no view counting.
 */
export const revalidate = 3600

/**
 * `revalidate` alone does not cache a dynamic segment — the first build of this
 * change still reported the route as dynamic with no revalidate value, because Next
 * has no params to prerender and so never establishes a cache entry. Declaring an
 * empty `generateStaticParams` with `dynamicParams` is the documented way to say
 * "prerender none at build, generate and then cache each one on first request".
 * Certificate IDs are unbounded and mostly never visited, so prerendering any of them
 * at build time would be waste.
 */
export const dynamicParams = true
export async function generateStaticParams(): Promise<Array<{ certificateId: string }>> {
  return []
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { certificateId } = await params
  const cert = await getDedupedVerifiedCertificate(certificateId, SITE_ORIGIN)

  if (!cert) {
    return {
      title: 'Invalid Certificate Verification',
      description: `The requested ${BRAND.fullName} certificate code could not be verified.`,
      robots: { index: false, follow: false },
    }
  }

  const copy = getVerifyPageCopy({
    certificateCode: cert.certificateCode,
    learnerName: cert.learnerName,
    careerTitle: cert.levelInfo.title,
    lessonsCompleted: cert.lessonsCompleted,
  })
  const metaTitle = copy.metaTitle
  const metaDesc = copy.metaDescription

  // A test certificate is never indexed, canonicalised or previewed as a credential.
  if (!copy.indexable) {
    return {
      title: metaTitle,
      description: metaDesc,
      robots: { index: false, follow: false },
      openGraph: { type: 'website', title: metaTitle, description: metaDesc },
      twitter: { card: 'summary', title: metaTitle, description: metaDesc },
    }
  }

  return {
    title: metaTitle,
    description: metaDesc,
    alternates: {
      canonical: cert.verificationUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: 'article',
      title: metaTitle,
      description: metaDesc,
      url: cert.verificationUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description: metaDesc,
    },
  }
}

export default async function CertificateVerificationPage({ params }: PageProps) {
  const { certificateId } = await params
  const cert = await getDedupedVerifiedCertificate(certificateId, SITE_ORIGIN)

  if (!cert) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4 shadow-sm">
          <div className="p-3 rounded-2xl bg-destructive/10 text-destructive w-fit mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold font-serif text-foreground">
            Certificate Code Unverified
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The certificate identifier <strong className="font-mono text-foreground">{certificateId}</strong> was not found in the official {BRAND.company} verification registry.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors pt-2"
          >
            <ArrowLeft className="w-4 h-4" /> Return to {BRAND.fullName}
          </Link>
        </div>
      </div>
    )
  }

  const copy = getVerifyPageCopy({
    certificateCode: cert.certificateCode,
    learnerName: cert.learnerName,
    careerTitle: cert.levelInfo.title,
    lessonsCompleted: cert.lessonsCompleted,
  })

  const credentialJsonLd = generateCredentialJsonLd({
    certificateCode: cert.certificateCode,
    learnerName: cert.learnerName,
    careerTitle: cert.levelInfo.title,
    issuedAt: cert.issuedAt,
    verificationUrl: cert.verificationUrl,
    portfolioUrl: cert.portfolioUrl,
    siteOrigin: SITE_ORIGIN,
  })

  return (
    <div className="min-h-screen bg-background text-foreground py-8 md:py-12 px-4">
      {/* Schema.org Credential JSON-LD (real credentials only) */}
      {copy.isShareableCredential && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(credentialJsonLd) }}
        />
      )}

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Verification Status Badge, or the test-certificate notice. Print shows only the
            certificate card, so the card carries its own test marking (CertificateCard). */}
        {copy.isTest ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center justify-between gap-4 text-amber-700 dark:text-amber-400"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm">{TEST_CERTIFICATE_LABEL}</p>
                <p className="text-[11px] opacity-90 mt-0.5 font-sans">{TEST_CERTIFICATE_EXPLANATION}</p>
              </div>
            </div>

            <div className="text-right font-mono text-[11px] font-bold shrink-0 hidden sm:block">
              Code: {cert.certificateCode}
            </div>
          </div>
        ) : (
          <VerificationBadge
            certificateCode={cert.certificateCode}
            issuedAt={cert.issuedAt}
          />
        )}

        {/* Action Bar (Print, Share, Download PDF, Copy Link, Add to LinkedIn).
            Not offered for a test certificate: it must not be shared as a credential. */}
        {copy.isShareableCredential && (
          <CertificateActions
            verificationUrl={cert.verificationUrl}
            portfolioUrl={cert.portfolioUrl}
            certificateCode={cert.certificateCode}
            careerTitle={cert.levelInfo.title}
            type={cert.type}
            issuedAt={cert.issuedAt}
          />
        )}

        {/* Official Printable Certificate Layout */}
        <CertificateCard certificate={cert} />

        {/* Summary Breakdown Grid */}
        <div className="no-print rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold font-serif text-foreground">
                  Credential Summary
                </h2>
                <p className="text-xs text-muted-foreground">
                  {cert.type === 'module_completion' || cert.type === 'module'
                    ? MODULE_CERTIFICATE_REQUIREMENT_STATEMENT
                    : CERTIFICATE_REQUIREMENT_STATEMENT}
                </p>
              </div>
            </div>

            <Link
              href={cert.portfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-primary hover:underline"
            >
              View Full Portfolio →
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" /> Credential Holder
              </span>
              <div className="text-base font-bold text-foreground truncate">{cert.learnerName}</div>
              <span className="text-[10px] text-muted-foreground font-mono">@{cert.username}</span>
            </div>

            <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-primary" /> Lessons Completed
              </span>
              <div className="text-xl font-bold text-foreground">{cert.lessonsCompleted} / 90</div>
            </div>

            <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" /> Modules Completed
              </span>
              <div className="text-xl font-bold text-foreground">{cert.modulesCompleted} / 9</div>
              <span className="text-[10px] text-emerald-500 font-semibold">Every lesson finished</span>
            </div>

            <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" /> XP Earned
              </span>
              <div className="text-xl font-bold text-foreground">{cert.totalXp.toLocaleString()} XP</div>
              <span className="text-[10px] text-primary font-bold">{cert.levelInfo.title}</span>
            </div>
          </div>
        </div>

        {/* Footer Branding */}
        <div className="no-print text-center pt-8 border-t border-border/60 text-xs text-muted-foreground space-y-1">
          <p>
            {copy.footerLine}
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Immutable Verification Code: {cert.certificateCode} · 0 dark patterns.
          </p>
        </div>
      </div>
    </div>
  )
}
