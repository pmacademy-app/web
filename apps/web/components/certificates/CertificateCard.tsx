'use client'

import React from 'react'
import { ShieldCheck, Award } from 'lucide-react'
import type { VerifiedCertificatePayload } from '@/lib/certificates-db'
import { generateQrCodeSvg } from '@/lib/certificates'
import { StaticBrandLogo } from '@/components/brand/BrandLogo'

interface CertificateCardProps {
  certificate: VerifiedCertificatePayload
}

export function CertificateCard({ certificate }: CertificateCardProps) {
  const {
    certificateCode,
    learnerName,
    levelInfo,
    lessonsCompleted,
    modulesCompleted,
    issuedAt,
    portfolioUrl,
  } = certificate

  const formattedDate = new Date(issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const qrCodeSvg = generateQrCodeSvg(portfolioUrl, 84)

  return (
    <div className="certificate-print-container relative w-full bg-card text-foreground rounded-2xl border-4 border-primary/40 p-8 md:p-12 shadow-md space-y-8 overflow-hidden select-none">
      {/* Outer Decorative Double Gold/Navy Border */}
      <div className="absolute inset-2 border border-primary/20 rounded-xl pointer-events-none" />

      {/* Background Watermark Crest */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
        <Award className="w-96 h-96 text-primary" />
      </div>

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/80 pb-6">
        <div className="flex items-center gap-3">
          <StaticBrandLogo size="md" />
        </div>

        <div className="text-right space-y-0.5">
          <span className="text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded bg-primary/10 text-primary border border-primary/20">
            Official Credential
          </span>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            ID: <strong className="text-foreground">{certificateCode}</strong>
          </p>
        </div>
      </div>

      {/* Main Certificate Title & Body */}
      <div className="text-center space-y-4 py-4">
        <span className="text-xs font-bold uppercase tracking-widest text-primary block">
          Certificate of Completion & Craft Mastery
        </span>

        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold font-serif text-foreground tracking-tight py-2">
          {learnerName}
        </h1>

        <p className="text-xs md:text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          has successfully demonstrated product management rigor, passing theory evaluations, quiz standards, and applied capstone deliverables to attain the level of
        </p>

        <div className="inline-flex flex-col items-center gap-1 px-6 py-3 rounded-xl bg-primary/10 border border-primary/20">
          <span className="text-lg md:text-xl font-bold font-serif text-primary">
            {levelInfo.title} (Level {levelInfo.level})
          </span>
          <span className="text-[11px] text-muted-foreground font-medium">
            {lessonsCompleted} Lessons Completed • {modulesCompleted} Modules Mastered
          </span>
        </div>
      </div>

      {/* Footer Details: Issue Date, Signature & Portfolio QR Code */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-border/80 pt-6">
        {/* Left: Issue Date */}
        <div className="text-center sm:text-left space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Date Issued
          </span>
          <span className="text-xs md:text-sm font-semibold text-foreground">
            {formattedDate}
          </span>
        </div>

        {/* Center: Official Signature */}
        <div className="text-center space-y-1 border-t sm:border-t-0 sm:border-x border-border/60 px-6 pt-2 sm:pt-0">
          <div className="font-serif italic font-bold text-base md:text-lg text-primary tracking-wide">
            PM Academy Academic Board
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
            Verified Verification Signatory
          </span>
        </div>

        {/* Right: Portfolio QR Code & Link */}
        <div className="flex items-center gap-3">
          <div
            className="w-16 h-16 rounded-lg bg-background border border-border p-1 shadow-xs flex items-center justify-center shrink-0"
            dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
          />
          <div className="text-left space-y-0.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Portfolio Verification
            </span>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified Valid
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
