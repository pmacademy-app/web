import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getUserCertificates, issueCertificate } from '@/lib/certificates-db'
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
  const completedPercentage = Math.min(100, Math.round((completedLessons / 90) * 100))

  let certificates = userCertificates
  if (completedLessons >= 90 && userCertificates.length === 0) {
    try {
      const issued = await issueCertificate(supabase, user.id, 'full_curriculum')
      certificates = [issued]
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
