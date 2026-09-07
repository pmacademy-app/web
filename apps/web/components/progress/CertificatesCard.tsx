import Link from 'next/link'
import { Award as CertIcon, ExternalLink } from 'lucide-react'
import type { CertificateRow } from '@/lib/certificates-db'

interface CertificatesCardProps {
  certificates: CertificateRow[]
  completedLessons: number
  completedPercentage: number
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
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 block">
                  Verified Credential • {cert.certificate_code}
                </span>
                <h3 className="text-lg font-bold font-serif text-foreground">
                  Prodily PM Academy Full Curriculum Completion Certificate
                </h3>
                <p className="text-xs text-muted-foreground">
                  Issued on {new Date(cert.issued_at).toLocaleDateString()} for mastering 90 lessons and achieving Level {cert.level} ({cert.career_title}).
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
          ))}
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
            <div className="flex justify-between text-xs font-bold font-mono">
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
