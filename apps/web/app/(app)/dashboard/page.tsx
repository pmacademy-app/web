import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import { ensureUserProfile, UserProfile, getServerUser } from '@/lib/auth'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { getUserXpSummary } from '@/lib/xp-service'
import { getUserStreakStatus } from '@/lib/streaks-db'
import { getSkillRadarSummary } from '@/lib/skillRadar'
import { ContinueLearningCard, NextLessonData } from '@/components/dashboard/ContinueLearningCard'
import { SkillRadarCard } from '@/components/dashboard/SkillRadarCard'
import { ProgressRingCard } from '@/components/dashboard/ProgressRingCard'
import { LevelCard } from '@/components/dashboard/LevelCard'
import { StreakCard } from '@/components/dashboard/StreakCard'
import { RecentActivityCard, ActivityItem } from '@/components/dashboard/RecentActivityCard'
import { DashboardLeaderboardWidget } from '@/components/dashboard/DashboardLeaderboardWidget'
import { DashboardNotificationsWidget } from '@/components/notifications/DashboardNotificationsWidget'
import { getWeeklyLeaderboard } from '@/lib/leaderboard-db'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Dashboard 2.0 | PM Academy',
  description: 'Track your skill radar, streak, XP rank, and curriculum progress across PM Academy.',
}

export default async function DashboardPage() {
  const authUser = await getServerUser()
  if (!authUser) {
    redirect('/login')
  }

  const supabase = createServerSupabaseClient()

  // 1. Fetch & ensure user profile
  const { data: dbProfile, error: dbError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle()

  let profile = dbProfile as UserProfile | null

  if (dbError) {
    console.error('[dashboard] Error loading database profile:', dbError.message)
  }

  if (!profile) {
    profile = await ensureUserProfile(supabase, authUser)
    if (!profile) {
      throw new Error('Failed to initialize user profile.')
    }
  }

  // 2. Parallel data fetching from Services
  const [
    { data: progressRows },
    curriculum,
    xpSummary,
    streakStatus,
    radarSummary,
    { data: recentXpEvents },
    weeklyLeaderboard,
  ] = await Promise.all([
    supabase
      .from('user_lesson_progress')
      .select('*')
      .eq('user_id', authUser.id) as unknown as {
      data: Database['public']['Tables']['user_lesson_progress']['Row'][] | null
    },
    fetchCurriculumData(),
    getUserXpSummary(supabase, authUser.id),
    getUserStreakStatus(supabase, authUser.id),
    getSkillRadarSummary(supabase, authUser.id),
    (supabase
      .from('xp_events') as unknown as DBChain)
      .select('*')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(5) as unknown as {
      data: { id: string; source_type: string; xp_amount: number; source_id: string; created_at: string }[] | null
    },
    getWeeklyLeaderboard(supabase, authUser.id),
  ])

  const curriculumLessons = curriculum?.lessons ?? []
  const completedLessons = progressRows?.filter((p) => p.status === 'completed').length ?? 0

  // 3. Find next lesson in global curriculum order (1 to 90)
  let nextLesson: NextLessonData | null = null
  if (curriculumLessons.length > 0) {
    const completedIds = new Set(
      progressRows
        ?.filter((p) => p.status === 'completed')
        .map((p) => p.lesson_id) ?? []
    )
    const activeNextIndex = curriculumLessons.findIndex((l) => !completedIds.has(l.id))
    if (activeNextIndex !== -1) {
      const activeNext = curriculumLessons[activeNextIndex]
      nextLesson = {
        id: activeNext.id,
        order: activeNextIndex + 1, // Global 1-indexed lesson order (1..90)
        title: activeNext.title,
        module: activeNext.module,
        estimatedTime: `${activeNext.estimatedReadingTime} min`,
      }
    }
  }

  // 4. Map recent activity items
  const recentActivities: ActivityItem[] = (recentXpEvents || []).map((event) => {
    let title = 'XP Earned'
    let description = `Earned ${event.xp_amount} XP`
    let type: ActivityItem['type'] = 'xp_earned'

    if (event.source_type === 'theory_read') {
      title = 'Lesson Theory Read'
      description = 'Completed engaged theory reading'
      type = 'lesson_completed'
    } else if (event.source_type === 'quiz_correct') {
      title = 'Quiz Score Awarded'
      description = 'Passed practice quiz question'
      type = 'quiz_completed'
    } else if (event.source_type === 'streak') {
      title = 'Streak Milestone'
      description = 'Maintained active daily study streak'
      type = 'streak_maintained'
    }

    return {
      id: event.id,
      title,
      description,
      timestamp: event.created_at,
      type,
    }
  })

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Continue Learning Header CTA */}
      <ContinueLearningCard
        nextLesson={nextLesson}
        totalLessonsCompleted={completedLessons}
      />

      {/* Primary Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <LevelCard level={xpSummary.levelInfo.level} totalXp={xpSummary.totalXp} />
        <StreakCard streakStatus={streakStatus} />
        <ProgressRingCard
          completedLessons={completedLessons}
          totalLessons={90}
        />
      </div>

      {/* Leaderboard Widget & Skill Radar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <DashboardLeaderboardWidget
            rank={weeklyLeaderboard.personalEntry?.rank ?? null}
            daysStudied={weeklyLeaderboard.personalEntry?.daysStudied ?? 0}
          />
        </div>
        <div className="md:col-span-2">
          <SkillRadarCard
            skillValues={radarSummary.scores}
            breakdown={radarSummary.breakdown}
            overallScore={radarSummary.overallScore}
          />
        </div>
      </div>

      {/* Notifications & Recent Activity */}
      <DashboardNotificationsWidget />
      <RecentActivityCard activities={recentActivities} />
    </div>
  )
}
