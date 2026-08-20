'use client'

import React from 'react'
import Link from 'next/link'
import { FileBadge, ExternalLink, User, Zap, Layers, CalendarDays, ArrowRight } from 'lucide-react'
import { AdminDrawer } from './AdminDrawer'
import { AdminEmptyState } from './AdminEmptyState'
import { CertificateCard } from '@/components/certificates/CertificateCard'
import { calculateLevel } from '@/lib/xp/xp'
import type { VerifiedCertificatePayload } from '@/lib/certificates-db'
import type { AdminCertificateDetail } from '@/lib/admin/achievements-service'

interface CertificateDetailDrawerProps {
  certificateId: string | null
  certificate: AdminCertificateDetail | null
  isOpen: boolean
  onClose: () => void
}

/**
 * Maps the admin certificate row onto the public verification payload for
 * preview. Uses the level/career title stored on the certificate at issuance
 * time (not recomputed from current XP), so the preview matches the real
 * credential even if the learner has earned more XP since.
 */
function toVerifiedPayload(cert: AdminCertificateDetail): VerifiedCertificatePayload {
  const computed = calculateLevel(cert.totalXp)
  return {
    id: cert.id,
    certificateCode: cert.code,
    type: cert.type,
    moduleSlug: null,
    learnerName: cert.learnerName,
    username: '',
    levelInfo: {
      level: cert.level,
      title: cert.careerTitle,
      progress: computed.progress,
      progressRatio: computed.progressRatio,
      xpRemaining: computed.xpRemaining,
      currentLevelMinXp: computed.currentLevelMinXp,
      nextLevelMinXp: computed.nextLevelMinXp,
    },
    totalXp: cert.totalXp,
    lessonsCompleted: cert.lessonsCompleted,
    modulesCompleted: cert.modulesCompleted,
    issuedAt: cert.issuedAt,
    isValid: true,
    verificationUrl: cert.verificationUrl,
    avatarUrl: null,
    portfolioUrl: '',
  }
}

export function CertificateDetailDrawer({
  certificateId,
  certificate,
  isOpen,
  onClose,
}: CertificateDetailDrawerProps) {
  return (
    <AdminDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={certificate ? `Certificate ${certificate.code}` : 'Certificate'}
      description={certificate ? `${certificate.type.replace('_', ' ')} credential` : undefined}
      size="lg"
    >
      {certificate ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Certificate Preview */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-admin-fg-muted flex items-center gap-1.5">
              <FileBadge className="w-3.5 h-3.5" /> Certificate Preview
            </h3>
            <CertificateCard certificate={toVerifiedPayload(certificate)} />
          </div>

          {/* Certificate Information */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-admin-fg-muted flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Certificate Information
            </h3>
            <div className="rounded-xl bg-admin-surface-raised border border-admin-border p-4 space-y-1">
              <span className="text-[11px] font-semibold text-admin-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-admin-accent" /> Learner
              </span>
              <p className="text-sm font-bold text-admin-fg truncate">{certificate.learnerName}</p>
              <Link
                href={`/admin/users?userId=${encodeURIComponent(certificate.userId)}`}
                className="inline-flex items-center gap-1 text-[11px] text-admin-info hover:text-admin-info/80 font-semibold"
              >
                View learner <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="rounded-xl bg-admin-surface-raised border border-admin-border p-4 space-y-1">
              <span className="text-[11px] font-semibold text-admin-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-admin-info" /> Credential Type
              </span>
              <p className="text-sm font-bold text-admin-fg capitalize">{certificate.type.replace('_', ' ')}</p>
              <p className="text-[11px] text-admin-fg-muted">{certificate.careerTitle || '—'}</p>
            </div>
            <div className="rounded-xl bg-admin-surface-raised border border-admin-border p-4 space-y-1">
              <span className="text-[11px] font-semibold text-admin-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-admin-success" /> Issue Date
              </span>
              <p className="text-sm font-bold text-admin-fg">
                {new Date(certificate.issuedAt).toLocaleDateString()}
              </p>
              <p className="text-[11px] font-mono text-admin-fg-muted">{certificate.code}</p>
            </div>
            <div className="rounded-xl bg-admin-surface-raised border border-admin-border p-4 space-y-1">
              <span className="text-[11px] font-semibold text-admin-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-admin-warning" /> Milestones
              </span>
              <p className="text-sm font-bold text-admin-fg">
                {certificate.lessonsCompleted} lessons · {certificate.modulesCompleted} modules
              </p>
              <p className="text-[11px] text-admin-fg-muted">{certificate.totalXp.toLocaleString()} XP</p>
            </div>

            {/* Public verification link */}
            <a
              href={certificate.verificationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-admin-info-soft text-admin-info text-xs font-bold border border-admin-info/25 transition-colors hover:bg-admin-info/20"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open public verification page
            </a>
          </div>
        </div>
      ) : (
        <AdminEmptyState
          icon={FileBadge}
          title="Certificate not found"
          description={
            certificateId
              ? `No certificate matches id "${certificateId}".`
              : 'Select a certificate to view its details.'
          }
        />
      )}
    </AdminDrawer>
  )
}