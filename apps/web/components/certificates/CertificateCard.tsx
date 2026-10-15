'use client'

import React from 'react'
import Image from 'next/image'
import { ShieldCheck, Award, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { VerifiedCertificatePayload } from '@/lib/certificates-db'
import { generateQrCodeSvg } from '@/lib/certificates'
import {
  getCertificatePresentation,
  TEST_CERTIFICATE_EXPLANATION,
} from '@/lib/certificates/presentation'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { BRAND } from '@/lib/brand'

interface CertificateCardProps {
  certificate: VerifiedCertificatePayload
}

/**
 * Official Production Certificate Component
 *
 * Designed to read as a genuine professional PM credential both on the
 * verification page and as a standalone printed/PDF export:
 * - Clear visual hierarchy: issuer → recipient → credential → milestones.
 * - Display type for the recipient name (`font-serif`, which maps to Inter).
 * - Double-frame border treatment with brand accent.
 * - Verification QR code encoding the exact /verify/[certificateId] URL.
 * - Print-safe: the whole card is wrapped in `.certificate-print-container`
 *   so the global print stylesheet prints only this element.
 * - Because only this element prints, an admin TEST- certificate is marked as
 *   such inside the card itself and makes no credential claim.
 */
export function CertificateCard({ certificate }: CertificateCardProps) {
  const {
    certificateCode,
    learnerName,
    levelInfo,
    lessonsCompleted,
    modulesCompleted,
    issuedAt,
    verificationUrl,
  } = certificate

  const formattedDate = new Date(issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // QR Code encodes the direct verification URL for online scanning
  const qrCodeSvg = generateQrCodeSvg(verificationUrl, 96)

  const { isTest, statusLabel } = getCertificatePresentation(certificateCode)

  return (
    <div className="certificate-print-container relative w-full bg-card text-foreground rounded-2xl border border-border shadow-lg overflow-hidden select-none">
      {/* Outer decorative frame */}
      <div className="absolute inset-2 border-2 border-primary/25 rounded-xl pointer-events-none" />
      <div className="absolute inset-3 border border-accent/30 rounded-lg pointer-events-none" />

      {/* Watermark Crest */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none">
        <Award className="w-[460px] h-[460px] text-primary" />
      </div>

      {/* Header: Logo, Issuer Line & Credential ID */}
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 sm:px-8 md:px-12 pt-6 sm:pt-8 md:pt-10 pb-6 border-b border-border">
        <div className="space-y-1.5">
          <BrandMarkProdily size="md" />
          <p className="text-[11px] font-semibold text-muted-foreground tracking-wide">
            {BRAND.certificateIssuerLine}
          </p>
        </div>

        <div className="sm:text-right space-y-1.5 shrink-0">
          {isTest ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/40 text-[11px] font-semibold">
              <AlertCircle className="w-3.5 h-3.5" /> {statusLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> {statusLabel}
            </span>
          )}
          <p className="text-xs font-mono text-muted-foreground">
            Credential ID: <strong className="text-foreground">{certificateCode}</strong>
          </p>
        </div>
      </div>

      {/* Certificate Body */}
      <div className="relative text-center px-4 sm:px-8 md:px-12 py-6 sm:py-8 md:py-10 space-y-6">
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary block">
            {isTest ? 'Test Certificate' : 'Certificate of Completion'}
          </span>
          <div className="flex items-center justify-center gap-3">
            <span className="h-px w-14 bg-primary/30" />
            <span className="text-primary/50 text-xs">✦</span>
            <span className="h-px w-14 bg-primary/30" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {isTest ? 'This test certificate was generated for' : 'This credential certifies that'}
          </p>
        </div>

        {certificate.avatarUrl && (
          <div className="flex justify-center mb-4 relative h-20 w-20 mx-auto">
            <Image 
              src={certificate.avatarUrl} 
              alt={learnerName} 
              fill
              className="rounded-full border-4 border-card shadow-sm object-cover"
              unoptimized
            />
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-foreground tracking-tight leading-tight break-words">
          {learnerName}
        </h1>

        <p className="text-xs md:text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {isTest ? (
            TEST_CERTIFICATE_EXPLANATION
          ) : (
            <>
              has successfully fulfilled all curriculum requirements, demonstrating mastery in product
              strategy, user discovery, data analytics, stakeholder leadership, and capstone execution.
            </>
          )}
        </p>

        {/* Level & Milestone Pill */}
        <div className="inline-flex flex-col items-center gap-2 px-4 sm:px-8 md:px-12 py-3.5 sm:py-4 md:py-5 rounded-2xl bg-primary/10 border border-primary/20 shadow-xs max-w-full">
          <span className="text-lg sm:text-xl md:text-2xl font-bold font-serif text-primary">
            {levelInfo.title}
          </span>
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
            Level {levelInfo.level} · {lessonsCompleted} Lessons Completed · {modulesCompleted}{' '}
            Modules Mastered
          </span>
        </div>
      </div>

      {/* Footer: Date, Signatory & Verification QR */}
      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6 px-4 sm:px-8 md:px-12 pt-6 pb-6 sm:pb-8 md:pb-10 border-t border-border">
        {/* Date Granted */}
        <div className="text-center sm:text-left space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Date Granted
          </span>
          <span className="text-xs md:text-sm font-bold text-foreground">{formattedDate}</span>
        </div>

        {/* Signatory */}
        <div className="text-center space-y-1 px-4">
          <div className="font-serif italic font-bold text-lg md:text-xl text-primary tracking-wide">
            {BRAND.certificateSignatory.name}
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
            {isTest ? 'Not a valid credential' : BRAND.certificateSignatory.title}
          </span>
        </div>

        {/* Verification QR */}
        <div className="flex items-center gap-3">
          <div
            className="w-20 h-20 rounded-xl bg-background border border-border p-1.5 shadow-xs flex items-center justify-center shrink-0"
            title="Scan QR code to verify credential online"
            dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
          />
          <div className="text-left space-y-0.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              QR Verification
            </span>
            {isTest ? (
              <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" /> Test only
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" /> Scan to Verify
              </div>
            )}
            <span className="text-[9px] text-muted-foreground font-mono truncate block max-w-[130px]">
              {verificationUrl.replace(/^https?:\/\//, '')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
