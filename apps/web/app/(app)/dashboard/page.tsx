import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import { ensureUserProfile, UserProfile, getServerUser } from '@/lib/auth'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { getUserStreakStatus } from '@/lib/streaks-db'
import { getReviewQueueData } from '@/lib/flashcards-service'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'
import { ContinueLearningCard, NextLessonData } from '@/components/dashboard/ContinueLearningCard'
import { StreakCard } from '@/components/dashboard/StreakCard'
import { RecentActivityCard, ActivityItem } from '@/components/dashboard/RecentActivityCard'
import { FlashcardReviewPromptCard } from '@/components/dashboard/FlashcardReviewPromptCard'
import { NextCapstonePromptCard } from '@/components/dashboard/NextCapstonePromptCard'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Action-oriented dashboard for Prodily PM Academy learners. Continue your next lesson, review flashcards, and submit capstones.',
}

export default async function DashboardPage() {
  const authUser = await getServerUser()
  if (!authUser) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

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

  // 2. Parallel data fetching with lean column projection
  const [
    { data: progressRows },
    curriculum,
    streakStatus,
    reviewQueue,
    { data: capstoneRows },
    { data: recentXpEvents },
  ] = await Promise.all([
    (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status')
      .eq('user_id', authUser.id) as unknown as Promise<{
      data: Array<{ lesson_id: string; status: string }> | null
    }>,
    fetchCurriculumData(),
    getUserStreakStatus(supabase, authUser.id),
    getReviewQueueData(supabase, authUser.id),
    (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .select('module_slug, status')
      .eq('user_id', authUser.id) as unknown as Promise<{
      data: Array<{ module_slug: string; status: string }> | null
    }>,
    (supabase
      .from('xp_events') as unknown as DBChain)
      .select('id, source_type, xp_amount, source_id, created_at')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(5) as unknown as Promise<{
      data: Array<{ id: string; source_type: string; xp_amount: number; source_id: string; created_at: string }> | null
    }>,
  ])

  const curriculumLessons = curriculum?.lessons ?? []
  const completedLessonIds = new Set(
    progressRows
      ?.filter((p) => p.status === 'completed')
      .map((p) => p.lesson_id) ?? []
  )
  const completedLessonsCount = completedLessonIds.size

  // 3. Determine Next Lesson CTA
  let nextLesson: NextLessonData | null = null
  if (curriculumLessons.length > 0) {
    const activeNextIndex = curriculumLessons.findIndex((l) => !completedLessonIds.has(l.id))
    if (activeNextIndex !== -1) {
      const activeNext = curriculumLessons[activeNextIndex]
      nextLesson = {
        id: activeNext.id,
        order: activeNextIndex + 1,
        title: activeNext.title,
        module: activeNext.module,
        estimatedTime: `${activeNext.estimatedReadingTime} min`,
      }
    }
  }

  // 4. Determine Next Capstone Prompt
  // Find completed modules where capstone is not yet submitted or reviewed
  const capstoneStatusMap = new Map<string, string>()
  if (capstoneRows) {
    for (const sub of capstoneRows) {
      capstoneStatusMap.set(sub.module_slug, sub.status)
    }
  }

  const submittedCapstonesCount = Array.from(capstoneStatusMap.values()).filter(
    (s) => s === 'submitted' || s === 'reviewed'
  ).length

  let nextCapstonePrompt: {
    moduleSlug: string
    moduleNumber: number
    title: string
    deliverableType: string
  } | null = null

  const capstoneDefs = Object.values(CAPSTONE_DEFINITIONS)
  for (const cap of capstoneDefs) {
    const status = capstoneStatusMap.get(cap.moduleSlug) || 'not_started'
    const isDone = status === 'submitted' || status === 'reviewed'

    if (!isDone) {
      // Check if all lessons in this module are completed
      const moduleLessons = curriculumLessons.filter((l) => l.module === cap.moduleSlug)
      const allModuleLessonsDone = moduleLessons.length > 0 && moduleLessons.every((l) => completedLessonIds.has(l.id))

      if (allModuleLessonsDone) {
        nextCapstonePrompt = {
          moduleSlug: cap.moduleSlug,
          moduleNumber: cap.moduleNumber,
          title: cap.title,
          deliverableType: cap.deliverableType,
        }
        break
      }
    }
  }

  // 5. Map recent XP activity items for small ticker
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
      {/* 1. Continue Learning Header CTA */}
      <ContinueLearningCard
        nextLesson={nextLesson}
        totalLessonsCompleted={completedLessonsCount}
      />

      {/* 2. Action Prompts Grid: "What should I do next?" */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FlashcardReviewPromptCard
          dueCount={reviewQueue.dueCards.length}
          totalUnlocked={reviewQueue.allUnlockedCards.length}
        />
        <NextCapstonePromptCard
          prompt={nextCapstonePrompt}
          submittedCount={submittedCapstonesCount}
        />
        <StreakCard streakStatus={streakStatus} />
      </div>

      {/* 3. Small Recent-XP Activity Ticker */}
      <RecentActivityCard activities={recentActivities} />
    </div>
  )
}
