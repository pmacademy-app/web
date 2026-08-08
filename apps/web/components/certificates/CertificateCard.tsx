'use client'

import React from 'react'
import { ShieldCheck, Award, CheckCircle2 } from 'lucide-react'
import type { VerifiedCertificatePayload } from '@/lib/certificates-db'
import { generateQrCodeSvg } from '@/lib/certificates'
import { StaticBrandLogo } from '@/components/brand/BrandLogo'
import { BRAND } from '@/lib/brand'

interface CertificateCardProps {
  certificate: VerifiedCertificatePayload
}

/**
 * Official Production Certificate Component
 * Features:
 * - Refreshed typography & dual-accent borders.
 * - Issuer attribution: "Issued by Prodigy · PM Academy".
 * - Verification QR code encoding exact /verify/[certificateId] URL.
 * - Authenticated credential status badge.
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

  // QR Code encodes direct verification URL for online scanning
  const qrCodeSvg = generateQrCodeSvg(verificationUrl, 96)

  return (
    <div className="certificate-print-container relative w-full bg-card text-foreground rounded-2xl border-4 border-primary/50 p-8 md:p-12 shadow-lg space-y-8 overflow-hidden select-none">
      {/* Decorative Inset Frame */}
      <div className="absolute inset-3 border-2 border-emerald-600/30 rounded-xl pointer-events-none" />

      {/* Watermark Crest */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
        <Award className="w-[420px] h-[420px] text-primary" />
      </div>

      {/* Header: Logo, Issuer Line & Verification Badge */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1">
          <StaticBrandLogo size="md" />
          <p className="text-[11px] font-semibold text-muted-foreground tracking-wide">
            {BRAND.certificateIssuerLine}
          </p>
        </div>

        <div className="sm:text-right space-y-1 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified Credential
          </span>
          <p className="text-xs font-mono text-muted-foreground">
            Credential ID: <strong className="text-foreground">{certificateCode}</strong>
          </p>
        </div>
      </div>

      {/* Certificate Body */}
      <div className="text-center space-y-6 py-6">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary block">
            Official Completion & Mastery Credential
          </span>
          <h2 className="text-sm font-medium text-muted-foreground">
            This credential certifies that
          </h2>
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-serif text-foreground tracking-tight py-1">
          {learnerName}
        </h1>

        <p className="text-xs md:text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          has successfully fulfilled all curriculum requirements, demonstrating mastery in product strategy, user discovery, data analytics, stakeholder leadership, and capstone execution.
        </p>

        {/* Level & Milestone Pill */}
        <div className="inline-flex flex-col items-center gap-1.5 px-8 py-4 rounded-2xl bg-primary/10 border border-primary/20 shadow-xs">
          <span className="text-xl md:text-2xl font-bold font-serif text-primary">
            {levelInfo.title} (Level {levelInfo.level})
          </span>
          <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
            <span>{lessonsCompleted} Lessons Completed</span>
            <span>•</span>
            <span>{modulesCompleted} Modules Mastered</span>
          </div>
        </div>
      </div>

      {/* Footer: Date, Board Signature & Verification QR Code */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-border pt-6">
        {/* Date */}
        <div className="text-center sm:text-left space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Date Granted
          </span>
          <span className="text-xs md:text-sm font-bold text-foreground">
            {formattedDate}
          </span>
        </div>

        {/* Board Signature */}
        <div className="text-center space-y-1 border-t sm:border-t-0 sm:border-x border-border px-8 pt-4 sm:pt-0">
          <div className="font-serif italic font-bold text-lg md:text-xl text-primary tracking-wide">
            {BRAND.fullName} Academic Board
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
            Official Credential Verification Signatory
          </span>
        </div>

        {/* Direct Verification QR Code */}
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
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Scan to Verify
            </div>
            <span className="text-[9px] text-muted-foreground font-mono truncate block max-w-[120px]">
              /verify/{certificateCode}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
