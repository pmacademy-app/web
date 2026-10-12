import Link from 'next/link'
import { Award as CertIcon, ExternalLink } from 'lucide-react'
import type { CertificateRow } from '@/lib/certificates-db'
import {
  TEST_CERTIFICATE_EXPLANATION,
  getCertificatePresentation,
  getCertificateRowCopy,
} from '@/lib/certificates/presentation'

interface CertificatesCardProps {
  certificates: CertificateRow[]
  completedLessons: number
  completedPercentage: number
}

/**
 * An admin dev TEST- row. Listed so it can be opened and checked, but never worded or
 * styled as a credential.
 */
function TestCertificateRow({ cert, statusLabel }: { cert: CertificateRow; statusLabel: string }) {
  return (
    <div className="p-6 rounded-2xl border border-dashed border-border bg-muted/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="space-y-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
          {statusLabel} • {cert.certificate_code}
        </span>
        <h3 className="text-lg font-bold font-serif text-foreground">
          Admin Test Certificate
        </h3>
        <p className="text-xs text-muted-foreground">
          Created on {new Date(cert.issued_at).toLocaleDateString()}. {TEST_CERTIFICATE_EXPLANATION}
        </p>
      </div>

      <Link
        href={`/verify/${encodeURIComponent(cert.certificate_code)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-border bg-card text-foreground font-bold text-xs hover:bg-muted transition-all shrink-0"
      >
        <span>View Test Certificate</span>
        <ExternalLink className="w-4 h-4" />
      </Link>
    </div>
  )
}

export function CertificatesCard({ certificates, completedLessons, completedPercentage }: CertificatesCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-6 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <CertIcon className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-bold font-serif text-foreground">
            Official Certificates &amp; Credentials
          </h2>
        </div>
      </div>

      {certificates.length > 0 ? (
        <div className="space-y-4">
          {certificates.map((cert) => {
            const { isTest, statusLabel } = getCertificatePresentation(cert.certificate_code)
            if (isTest) {
              return <TestCertificateRow key={cert.id} cert={cert} statusLabel={statusLabel} />
            }

            const copy = getCertificateRowCopy(cert)
            return (
              <div
                key={cert.id}
                className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 block">
                    {statusLabel} • {cert.certificate_code}
                  </span>
                  <h3 className="text-lg font-bold font-serif text-foreground">
                    {copy.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {copy.detail}
                  </p>
                </div>

                <Link
                  href={`/verify/${encodeURIComponent(cert.certificate_code)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 text-white font-bold text-xs shadow-sm hover:bg-amber-600 transition-all shrink-0"
                >
                  <span>View Verified Certificate</span>
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="p-6 rounded-2xl border border-border bg-card/60 space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold font-serif text-foreground">
              Certificate Eligibility &amp; Progress
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Earn your official PM Academy Completion Certificate by completing all 90 lessons across the 9 core modules.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs font-bold font-mono">
              <span className="text-foreground">Full Curriculum Certificate Eligibility</span>
              <span className="text-primary">{completedLessons} / 90 Lessons ({completedPercentage}%)</span>
            </div>
            <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${completedPercentage}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
