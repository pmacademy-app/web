import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLevelTitle } from '@/lib/xp'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import { ensureUserProfile, UserProfile, getServerUser } from '@/lib/auth'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { calculateSkillRadarScores, SKILL_CLUSTERS } from '@/lib/skillRadar'
import type { SkillCluster } from '@/types'

export const metadata: Metadata = {
  title: 'Dashboard | PM Academy',
  description: 'Track your skill radar, streak, and progress across the 90 PM Academy lessons.',
}

export default async function DashboardPage() {
  const authUser = await getServerUser()
  if (!authUser) {
    redirect('/login')
  }

  const supabase = createServerSupabaseClient()

  // Fetch the public.users record
  const { data: dbProfile, error: dbError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle()

  let profile = dbProfile as UserProfile | null

  if (dbError) {
    console.error('[dashboard] Error loading database profile:', dbError.message)
  }

  // Initialize profile if not found
  if (!profile) {
    profile = await ensureUserProfile(supabase, authUser)
    if (!profile) {
      throw new Error('Failed to initialize user profile.')
    }
  }

  // Fetch user lesson progress and curriculum details
  const { data: progressRows } = await supabase
    .from('user_lesson_progress')
    .select('*')
    .eq('user_id', authUser.id) as unknown as { data: Database['public']['Tables']['user_lesson_progress']['Row'][] | null }

  const curriculum = await fetchCurriculumData()
  const curriculumLessons = curriculum?.lessons ?? []

  const completedLessons = progressRows?.filter((p) => p.status === 'completed').length ?? 0

  // Find the first incomplete lesson in curriculum order
  let nextLesson = null
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

  // Helper to map module slugs to competency clusters (1-2 per lesson)
  const getClustersForModule = (moduleSlug: string): SkillCluster[] => {
    switch (moduleSlug) {
      case 'discovery':
        return ['discovery']
      case 'design':
        return ['design']
      case 'strategy':
        return ['strategy']
      case 'execution':
        return ['execution']
      case 'growth':
        return ['growth']
      case 'leadership':
        return ['leadership']
      case 'technical':
        return ['technical']
      case 'foundations':
        return ['discovery', 'strategy']
      case 'capstone':
        return ['execution', 'strategy']
      default:
        return []
    }
  }

  const radarInputs = curriculumLessons.map((lesson) => {
    const progress = progressRows?.find((p) => p.lesson_id === lesson.id)
    return {
      lessonSlug: lesson.slug,
      status: (progress?.status ?? 'not_started') as 'not_started' | 'in_progress' | 'completed',
      quizScore: progress?.quiz_score ?? null,
      skillClusters: getClustersForModule(lesson.module),
    }
  })

  const skillValues = calculateSkillRadarScores(radarInputs)

  const user = {
    name: profile.name || 'Learner',
    level: profile.level,
    title: getLevelTitle(profile.level),
    totalXp: profile.total_xp,
    streak: profile.current_streak,
    completedLessons,
    nextLesson,
    skillValues,
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border border-border rounded-xl p-6 shadow-sm">
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold text-primary">
            Level {user.level} — {user.title}
          </span>
          <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground mt-1">
            Welcome back, {user.name} 👋
          </h1>
          {profile.goal && (
            <p className="text-xs text-muted-foreground/80 mt-1 uppercase tracking-wider font-medium">
              Goal: {profile.goal.replace('_', ' ')}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {user.totalXp} XP • {user.completedLessons}/90 Lessons Completed
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-semibold">
            🔥 {user.streak} Day Streak
          </div>
        </div>
      </div>

      {/* Hero CTA: Next Lesson */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
        {user.nextLesson ? (
          <>
            <div>
              <span className="text-xs font-semibold uppercase text-primary tracking-wider">
                Up Next
              </span>
              <h2 className="text-xl font-bold font-serif text-foreground mt-1">
                Lesson {user.nextLesson.order}: {user.nextLesson.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Est. Time: {user.nextLesson.estimatedTime} • Theory + Practice Quiz
              </p>
            </div>
            <Link
              href={`/academy/${user.nextLesson.module}/${user.nextLesson.id}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              Start Lesson →
            </Link>
          </>
        ) : (
          <>
            <div>
              <span className="text-xs font-semibold uppercase text-primary tracking-wider">
                Congratulations!
              </span>
              <h2 className="text-xl font-bold font-serif text-foreground mt-1">
                All Lessons Completed 👑
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                You have completed all 90 lessons in the PM Academy curriculum!
              </p>
            </div>
            <Link
              href="/academy"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              Curriculum Board →
            </Link>
          </>
        )}
      </div>

      {/* Skill Radar Section (Primary Visual Focus) */}
      <div className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-bold font-serif text-foreground">
            Competency Skill Radar
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Your progress across 7 PM skill clusters, updated automatically as you complete quizzes & capstones.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {SKILL_CLUSTERS.map((cluster) => {
            const val = user.skillValues[cluster.id as keyof typeof user.skillValues] || 0
            return (
              <div key={cluster.id} className="rounded-lg bg-secondary/40 p-4 border border-border/50">
                <span className="text-xs font-semibold text-muted-foreground">
                  {cluster.label}
                </span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-bold text-primary">{val}%</span>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {val >= 70 ? 'Advanced' : val >= 30 ? 'Intermediate' : 'Beginner'}
                  </span>
                </div>
                <div className="w-full bg-border rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: `${val}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
