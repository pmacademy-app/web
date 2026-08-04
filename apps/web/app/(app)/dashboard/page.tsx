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
  ])

  const curriculumLessons = curriculum?.lessons ?? []
  const completedLessons = progressRows?.filter((p) => p.status === 'completed').length ?? 0

  // 3. Find next lesson in curriculum order
  let nextLesson: NextLessonData | null = null
  if (curriculumLessons.length > 0) {
    const completedIds = new Set(
      progressRows
        ?.filter((p) => p.status === 'completed')
        .map((p) => p.lesson_id) ?? []
    )
    const activeNext = curriculumLessons.find((l) => !completedIds.has(l.id))
    if (activeNext) {
      nextLesson = {
        id: activeNext.id,
        order: activeNext.order,
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
      title = 'Daily Streak Maintained'
      description = 'Logged daily study activity'
      type = 'streak_maintained'
    }

    const dateStr = new Date(event.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })

    return {
      id: event.id,
      type,
      title,
      description,
      xpAmount: event.xp_amount,
      timestamp: dateStr,
    }
  })

  // Determine completed modules count (modules with 100% completed lessons)
  const moduleLessonCounts = new Map<string, { total: number; completed: number }>()
  for (const lesson of curriculumLessons) {
    const current = moduleLessonCounts.get(lesson.module) || { total: 0, completed: 0 }
    const isCompleted = progressRows?.some(
      (p) => p.lesson_id === lesson.id && p.status === 'completed'
    )
    moduleLessonCounts.set(lesson.module, {
      total: current.total + 1,
      completed: current.completed + (isCompleted ? 1 : 0),
    })
  }

  let completedModules = 0
  for (const stats of moduleLessonCounts.values()) {
    if (stats.total > 0 && stats.completed === stats.total) {
      completedModules += 1
    }
  }

  const levelTitle = xpSummary.levelInfo.title

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold text-primary">
            Level {xpSummary.levelInfo.level} — {levelTitle}
          </span>
          <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground mt-1">
            Welcome back, {profile.name || 'Learner'} 👋
          </h1>
          {profile.goal && (
            <p className="text-xs text-muted-foreground/80 mt-1 uppercase tracking-wider font-medium">
              Goal: {profile.goal.replace('_', ' ')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-semibold">
            🔥 {streakStatus.effectiveCurrentStreak} Day Streak
          </div>
        </div>
      </div>

      {/* 1. Continue Learning (Hero CTA) */}
      <ContinueLearningCard
        nextLesson={nextLesson}
        totalLessonsCompleted={completedLessons}
      />

      {/* 2. Skill Radar (Primary Visual Hero Element) */}
      <SkillRadarCard
        skillValues={radarSummary.scores}
        breakdown={radarSummary.breakdown}
        overallScore={radarSummary.overallScore}
      />

      {/* 3, 4, 5. Three-Column Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ProgressRingCard
          completedLessons={completedLessons}
          totalLessons={90}
          completedModules={completedModules}
          totalModules={9}
        />

        <LevelCard
          level={xpSummary.levelInfo.level}
          totalXp={xpSummary.totalXp}
        />

        <StreakCard
          streakStatus={streakStatus}
        />
      </div>

      {/* 6. Recent Activity Feed */}
      <RecentActivityCard activities={recentActivities} />
    </div>
  )
}
