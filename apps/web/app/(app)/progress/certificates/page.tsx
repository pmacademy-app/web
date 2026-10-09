import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getUserCertificates, isTestCertificateCode } from '@/lib/certificates-db'
import {
  FULL_CURRICULUM_LESSON_COUNT,
  issueFullCurriculumCertificateIfEligible,
} from '@/lib/certificates/issue-flow'
import { CertificatesCard } from '@/components/progress/CertificatesCard'
import { GraduationCap } from 'lucide-react'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Certificates & Credentials | Progress',
  description: 'Verified certificates and product management credential verification.',
}

export default async function CertificatesProgressPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

  const [
    { data: progressRows },
    userCertificates,
  ] = await Promise.all([
    (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ lesson_id: string; status: string }> | null
    }>,
    getUserCertificates(supabase, user.id),
  ])

  const completedLessons = progressRows?.filter((p) => p.status === 'completed').length ?? 0
  const completedPercentage = Math.min(
    100,
    Math.round((completedLessons / FULL_CURRICULUM_LESSON_COUNT) * 100)
  )

  // Repair: a learner who finished every lesson before issuance moved into the
  // lesson-completion path (or whose issuance failed there) gets their real
  // full-curriculum certificate here. Module and admin TEST- certificates do not count.
  // Idempotent and announced only when this render created the row; never throws.
  let certificates = userCertificates
  const hasFullCurriculumCertificate = userCertificates.some(
    (c) => c.type === 'full_curriculum' && !isTestCertificateCode(c.certificate_code)
  )
  if (completedLessons >= FULL_CURRICULUM_LESSON_COUNT && !hasFullCurriculumCertificate) {
    try {
      const { certificate } = await issueFullCurriculumCertificateIfEligible(supabase, user.id, {
        email: user.email,
        name: user.user_metadata?.full_name || user.email?.split('@')[0],
      })
      if (certificate && !userCertificates.some((c) => c.id === certificate.id)) {
        certificates = [certificate, ...userCertificates]
      }
    } catch (e) {
      console.warn('Failed to auto-issue certificate:', e)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
      <div className="border-b border-border/60 pb-4">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
        >
          ← Back to Dashboard
        </Link>
        <div className="flex items-center gap-2 mt-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Verified Certificates &amp; Credentials
          </h1>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Cryptographically verifiable credentials shareable directly to LinkedIn and hiring managers upon curriculum completion.
        </p>
      </div>

      <CertificatesCard
        certificates={certificates}
        completedLessons={completedLessons}
        completedPercentage={completedPercentage}
      />
    </div>
  )
}
