import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase'
import { verifyCertificate } from '@/lib/certificates-db'
import { generateCredentialJsonLd } from '@/lib/certificates'
import { CertificateCard } from '@/components/certificates/CertificateCard'
import { CertificateActions } from '@/components/certificates/CertificateActions'
import { VerificationBadge } from '@/components/certificates/VerificationBadge'
import { Award, AlertCircle, ArrowLeft, BookOpen, Layers, Zap, User } from 'lucide-react'
import { BRAND } from '@/lib/brand'

interface PageProps {
  params: Promise<{ certificateId: string }>
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { certificateId } = await params
  const supabase = createServiceRoleClient()
  const cert = await verifyCertificate(supabase, certificateId, SITE_ORIGIN)

  if (!cert) {
    return {
      title: 'Invalid Certificate Verification',
      description: `The requested ${BRAND.fullName} certificate code could not be verified.`,
      robots: { index: false, follow: false },
    }
  }

  const metaTitle = `Verified Certificate: ${cert.learnerName} — ${cert.levelInfo.title}`
  const metaDesc = `Official ${BRAND.fullName} Certificate of Completion for ${cert.learnerName} (${cert.levelInfo.title}, ${cert.lessonsCompleted} lessons completed). Certificate ID: ${cert.certificateCode}.`

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
  const supabase = createServiceRoleClient()
  const cert = await verifyCertificate(supabase, certificateId, SITE_ORIGIN)

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
            The certificate identifier <strong className="font-mono text-foreground">{certificateId}</strong> was not found in the official {BRAND.product} verification registry.
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
      {/* Schema.org Credential JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(credentialJsonLd) }}
      />

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Verification Status Badge */}
        <VerificationBadge
          certificateCode={cert.certificateCode}
          issuedAt={cert.issuedAt}
        />

        {/* Action Bar (Print, Share, Download PDF, Copy Link, Add to LinkedIn) */}
        <CertificateActions
          verificationUrl={cert.verificationUrl}
          portfolioUrl={cert.portfolioUrl}
          certificateCode={cert.certificateCode}
          careerTitle={cert.levelInfo.title}
          type={cert.type}
          issuedAt={cert.issuedAt}
        />

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
                  Credential Summary & Audit Trail
                </h2>
                <p className="text-xs text-muted-foreground">
                  Verified learning achievements backing this certificate.
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
              <span className="text-[10px] text-emerald-500 font-semibold">AST Verified</span>
            </div>

            <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary" /> Modules Mastered
              </span>
              <div className="text-xl font-bold text-foreground">{cert.modulesCompleted} / 9</div>
              <span className="text-[10px] text-emerald-500 font-semibold">Capstones Passed</span>
            </div>

            <div className="rounded-xl border border-border/80 bg-card/60 p-4 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" /> Verified Experience
              </span>
              <div className="text-xl font-bold text-foreground">{cert.totalXp.toLocaleString()} XP</div>
              <span className="text-[10px] text-primary font-bold">{cert.levelInfo.title}</span>
            </div>
          </div>
        </div>

        {/* Footer Branding */}
        <div className="no-print text-center pt-8 border-t border-border/60 text-xs text-muted-foreground space-y-1">
          <p>
            Official Verified Credential. {BRAND.certificateIssuerLine}.
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Immutable Verification Code: {cert.certificateCode} · 0 dark patterns.
          </p>
        </div>
      </div>
    </div>
  )
}
