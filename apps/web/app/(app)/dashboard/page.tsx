import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile, getServerUser, getCurrentUserProfile } from '@/lib/auth'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { getUserStreakStatus } from '@/lib/streaks-db'
import { getWeeklyLeaderboard } from '@/lib/leaderboard-db'
import { getReviewQueueData } from '@/lib/flashcards-service'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'
import { ContinueLearningCard, NextLessonData } from '@/components/dashboard/ContinueLearningCard'
import { StreakCard } from '@/components/dashboard/StreakCard'
import { RecentActivityCard, ActivityItem } from '@/components/dashboard/RecentActivityCard'
import { FlashcardReviewPromptCard } from '@/components/dashboard/FlashcardReviewPromptCard'
import { NextCapstonePromptCard } from '@/components/dashboard/NextCapstonePromptCard'
import { PortfolioProofCard } from '@/components/dashboard/PortfolioProofCard'
import { hasFullCurriculumCertificate } from '@/lib/dashboard/proof-card'
import { derivePortfolioState } from '@/lib/dashboard/proof-card'
import { loadProofExtras } from '@/lib/dashboard/proof-extras-db'
import { ProofExtrasSkeleton } from '@/components/dashboard/ProofExtrasRow'
import { ProofExtrasSlot } from './ProofExtrasSlot'
import { resolvePersonalizedPath, resolveNextRecommendedMilestone } from '@/lib/personalization/path-resolver'
import { PersonalizedGoalBanner } from '@/components/dashboard/PersonalizedGoalBanner'
import { LeaderboardWidgetSkeleton } from '@/components/dashboard/DashboardLeaderboardWidget'
import { LeaderboardWidgetSlot } from './LeaderboardWidgetSlot'

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

  // Started now so it runs alongside the page's own data, but awaited only inside the
  // widget's <Suspense> boundary below: the roster-wide aggregation never blocks the page.
  // The catch is attached immediately so a failure can never become an unhandled
  // rejection; the widget renders its "unavailable" state for `null`.
  const leaderboardPromise = getWeeklyLeaderboard(supabase, authUser.id).catch((error: unknown) => {
    console.error('[dashboard] weekly leaderboard widget failed to load', error)
    return null
  })

  // Read once, shared. The page's own sections and the proof card's lower row await the same
  // requests instead of each issuing their own. A Supabase builder re-runs its request every time
  // it is awaited, so each is wrapped once in a real Promise (Promise.resolve calls then() once).
  const profilePromise = getCurrentUserProfile()
  const progressPromise = Promise.resolve(
    supabase
      .from('user_lesson_progress')
      .select('lesson_id, status, quiz_score, quiz_attempts')
      .eq('user_id', authUser.id),
  ).then(({ data }) => data ?? [])
  const capstonesPromise = Promise.resolve(
    supabase.from('capstone_submissions').select('id, module_slug, status, is_public').eq('user_id', authUser.id),
  ).then(({ data }) => data ?? [])

  // Streamed like the leaderboard: started now, awaited only inside its <Suspense> boundary, so
  // the badge and Fellow reads never block the page. Never rejects (cells resolve to null).
  const proofExtrasPromise = loadProofExtras(supabase, authUser.id, {
    profile: profilePromise,
    progressRows: progressPromise,
    capstoneRows: capstonesPromise,
  }).catch((error: unknown) => {
    console.error('[dashboard] proof card extras failed to load', error)
    return null
  })

  // Parallel data fetching with lean column projection.
  // The users profile comes from the request-memoized resolver so it reuses the
  // SELECT already issued by the (app) layout instead of duplicating it.
  const [
    dbProfile,
    progressRows,
    curriculum,
    streakStatus,
    reviewQueue,
    capstoneRows,
    { data: recentXpEvents },
    certificateResult,
  ] = await Promise.all([
    profilePromise,
    progressPromise,
    fetchCurriculumData(),
    getUserStreakStatus(supabase, authUser.id),
    getReviewQueueData(supabase, authUser.id),
    capstonesPromise,
    (supabase
      .from('xp_events') as unknown as DBChain)
      .select('id, source_type, xp_amount, source_id, created_at')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(5) as unknown as Promise<{
      data: Array<{ id: string; source_type: string; xp_amount: number; source_id: string; created_at: string }> | null
    }>,
    // Read-only existence check for the full-curriculum certificate (never issues one).
    // Admin-generated TEST- rows are not credentials and must not count as earned.
    (supabase
      .from('certificates') as unknown as DBChain)
      .select('id')
      .eq('user_id', authUser.id)
      .eq('type', 'full_curriculum')
      .not('certificate_code', 'like', 'TEST-%')
      .limit(1) as unknown as Promise<{
      data: Array<{ id: string }> | null
      error: unknown
    }>,
  ])

  let profile = dbProfile

  if (!profile) {
    profile = await ensureUserProfile(supabase, authUser)
    if (!profile) {
      throw new Error('Failed to initialize user profile.')
    }
  }

  const curriculumLessons = curriculum?.lessons ?? []
  const completedLessonIds = new Set(
    progressRows
      ?.filter((p) => p.status === 'completed')
      .map((p) => p.lesson_id) ?? []
  )
  const completedLessonsCount = completedLessonIds.size

  // A failed or empty certificate lookup reads as "not earned yet".
  const hasCertificate = hasFullCurriculumCertificate(certificateResult)

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

  // 6. Resolve Goal-Driven Personalization (Phase 3)
  const personalizedPath = resolvePersonalizedPath(profile)
  const recommendedMilestone = resolveNextRecommendedMilestone(
    personalizedPath,
    completedLessonIds,
    curriculumLessons
  )

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* 0. Personalized Goal Header (Phase 3) */}
      <PersonalizedGoalBanner
        path={personalizedPath}
        milestone={recommendedMilestone}
      />

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

      {/* 3. Portfolio & Proof: primitives only, never the profile row */}
      <PortfolioProofCard
        username={profile.username ?? null}
        isPortfolioPublic={profile.is_portfolio_public === true}
        completedLessons={completedLessonsCount}
        hasCertificate={hasCertificate}
      >
        {/* Streamed: badges and Fellow state must not block the page. */}
        <Suspense fallback={<ProofExtrasSkeleton />}>
          <ProofExtrasSlot
            extrasPromise={proofExtrasPromise}
            portfolioState={derivePortfolioState(profile.username, profile.is_portfolio_public === true)}
          />
        </Suspense>
      </PortfolioProofCard>

      {/* 4. Recent-XP Activity Ticker + weekly leaderboard summary */}
      {/* Flex, not grid: if the widget renders nothing (opted out), the activity card fills the row. */}
      <div className="flex flex-col md:flex-row gap-6 md:items-start">
        <div className="min-w-0 flex-1">
          <RecentActivityCard activities={recentActivities} />
        </div>
        {/* Streamed: the roster-wide leaderboard aggregation must not block the page. */}
        <Suspense fallback={<LeaderboardWidgetSkeleton />}>
          <LeaderboardWidgetSlot payloadPromise={leaderboardPromise} />
        </Suspense>
      </div>
    </div>
  )
}
