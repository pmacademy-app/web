import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getSkillRadarSummary } from '@/lib/skillRadar'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { SkillRadarCard } from '@/components/dashboard/SkillRadarCard'
import { Radar } from 'lucide-react'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Skill Radar & Competency | Progress',
  description: 'Track your product management competencies across Discovery, Delivery, Strategy, and Growth.',
}

export default async function SkillRadarProgressPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

  const [{ data: progressRows }, curriculum] = await Promise.all([
    (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status, quiz_score, quiz_attempts')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ lesson_id: string; status: 'not_started' | 'in_progress' | 'completed'; quiz_score: number | null; quiz_attempts: number }> | null
    }>,
    fetchCurriculumData().catch(() => null),
  ])

  const lessonModuleMap = new Map<string, string>(
    (curriculum?.lessons || []).map((l) => [l.id, l.module])
  )

  const radarSummary = await getSkillRadarSummary(supabase, user.id, {
    progressRows: progressRows || undefined,
    lessonModuleMap,
  })

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
          <Radar className="w-5 h-5 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Skill Radar &amp; PM Competency
          </h1>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Dynamic radar visualizing your real-world PM capability scores computed from theory completion and scenario mastery.
        </p>
      </div>

      <SkillRadarCard
        skillValues={radarSummary.scores}
        breakdown={radarSummary.breakdown}
        overallScore={radarSummary.overallScore}
      />
    </div>
  )
}
