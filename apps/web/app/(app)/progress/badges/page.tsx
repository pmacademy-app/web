import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getUserBadgesData } from '@/lib/badges-db'
import { BadgeShowcaseCard } from '@/components/progress/BadgeShowcaseCard'
import { Award } from 'lucide-react'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Badge Showcase | Progress',
  description: 'View earned milestone badges, habit awards, and PM achievements.',
}

export default async function BadgesProgressPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

  const [
    { data: progressRows },
    { data: capstoneRows },
  ] = await Promise.all([
    (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status, quiz_score, quiz_attempts')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ lesson_id: string; status: string; quiz_score: number | null; quiz_attempts: number }> | null
    }>,
    (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .select('module_slug, status')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ module_slug: string; status: string }> | null
    }>,
  ])

  const badgesData = await getUserBadgesData(supabase, user.id, {
    progressRows: progressRows || undefined,
    capstoneRows: capstoneRows || undefined,
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
          <Award className="w-5 h-5 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Badge Showcase &amp; Achievements
          </h1>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Proof of your consistent learning habits, capstone completions, and milestone achievements.
        </p>
      </div>

      <BadgeShowcaseCard
        unlockedCount={badgesData.totalEarned}
        totalBadges={badgesData.totalAvailable}
        badges={badgesData.allBadges}
      />
    </div>
  )
}
