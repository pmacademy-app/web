import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getUserXpSummary } from '@/lib/xp-service'
import { getUserStreakStatus, notStartedStreakStatus } from '@/lib/streaks-db'
import { logSystemError } from '@/lib/monitoring/logger'
import { LevelCard } from '@/components/dashboard/LevelCard'
import { StreakCard } from '@/components/dashboard/StreakCard'
import { ProgressRingCard } from '@/components/dashboard/ProgressRingCard'
import { BarChart3 } from 'lucide-react'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Core Metrics | Progress',
  description: 'Your level, XP total, learning streak, and curriculum completion metrics.',
}

export default async function MetricsProgressPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

  const [
    { data: progressRows },
    xpSummary,
    streakStatus,
  ] = await Promise.all([
    (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ lesson_id: string; status: 'not_started' | 'in_progress' | 'completed' }> | null
    }>,
    getUserXpSummary(supabase, user.id),
    // CQ-01: a failed streak read degrades to the not-started card instead of a 500.
    getUserStreakStatus(supabase, user.id).catch((err) => {
      void logSystemError({
        severity: 'error',
        category: 'db',
        operation: 'progress_metrics_streak_read',
        message: String(err),
        userId: user.id,
      })
      return notStartedStreakStatus()
    }),
  ])

  const completedLessons = progressRows?.filter((p) => p.status === 'completed').length ?? 0

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
          <BarChart3 className="w-5 h-5 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Core Performance Metrics
          </h1>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Real-time summary of your current XP level, active daily streak, and overall lesson completion rate.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <LevelCard level={xpSummary.levelInfo.level} totalXp={xpSummary.totalXp} />
        <StreakCard streakStatus={streakStatus} />
        <ProgressRingCard completedLessons={completedLessons} totalLessons={90} />
      </div>
    </div>
  )
}
