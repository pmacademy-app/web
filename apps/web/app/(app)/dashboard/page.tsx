import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile, getServerUser, getCurrentUserProfile } from '@/lib/auth'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { getLessonPosition } from '@/lib/curriculum/lesson-position'
import { getUserStreakStatus, notStartedStreakStatus } from '@/lib/streaks-db'
import { logSystemError } from '@/lib/monitoring/logger'
import { getWeeklyLeaderboard } from '@/lib/leaderboard-db'
import { getReviewQueueData } from '@/lib/flashcards-service'
import { getAllCapstoneDefinitions, getCurriculumModuleForCapstone } from '@/config/capstones'
import {
  getCapstoneThresholdConfig,
  getCapstoneThresholdVariant,
  getRequiredLessonsForVariant,
} from '@/lib/capstone-threshold-experiment'
import { NextLessonPanel, type NextLessonPanelData } from '@/components/dashboard/home/NextLessonPanel'
import { StreakGoalPanel } from '@/components/dashboard/home/StreakGoalPanel'
import { TodaysPlan, type PlanItem } from '@/components/dashboard/home/TodaysPlan'
import { RecentXpStrip, type XpStripItem } from '@/components/dashboard/home/RecentXpStrip'
import { calculateLevel, XP_VALUES } from '@/lib/xp/xp'
import { STREAK_RULES } from '@/lib/streaks/streaks'
import { getUserLocalTime } from '@/lib/notifications/timezone'
import { firstName, greetingFor, nextFreezeDay, relativeDayLabel, weekStrip, xpSourceLabel } from '@/lib/dashboard/home'
import { PortfolioProofCard } from '@/components/dashboard/PortfolioProofCard'
import { hasFullCurriculumCertificate } from '@/lib/dashboard/proof-card'
import { derivePortfolioState } from '@/lib/dashboard/proof-card'
import { loadProofExtras } from '@/lib/dashboard/proof-extras-db'
import { ProofExtrasSkeleton } from '@/components/dashboard/ProofExtrasRow'
import { ProofExtrasSlot } from './ProofExtrasSlot'
import {
  resolvePersonalizedPath,
  resolveStartLearningTarget,
} from '@/lib/personalization/path-resolver'
import { isModuleEntryUnlockTreatment } from '@/lib/academy/module-entry-unlock'
import { LeaderboardWidgetSkeleton } from '@/components/dashboard/DashboardLeaderboardWidget'
import { LeaderboardWidgetSlot } from './LeaderboardWidgetSlot'
import { lessonPath } from '@/lib/curriculum/lesson-url'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Action-oriented dashboard for Prodily learners. Continue your next lesson, review flashcards, and submit capstones.',
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
  const leaderboardPromise = getWeeklyLeaderboard(supabase, authUser.id, undefined, { skipIfOptedOut: true }).catch((error: unknown) => {
    console.error('[dashboard] weekly leaderboard widget failed to load', error)
    return null
  })

  // Read once, shared. The page's own sections and the proof card's lower row await the same
  // requests instead of each issuing their own. A Supabase builder re-runs its request every time
  // it is awaited, so each is wrapped once in a real Promise (Promise.resolve calls then() once).
  const profilePromise = getCurrentUserProfile()
  // A failed progress read throws (CQ-07) instead of standing in as "no lessons": the review
  // queue reuses these rows, and it must never show every card as locked on a DB blip.
  const progressPromise = Promise.resolve(
    supabase
      .from('user_lesson_progress')
      .select('lesson_id, status, quiz_score, quiz_attempts, completed_at')
      .eq('user_id', authUser.id),
  ).then(({ data, error }) => {
    if (error) throw new Error(`[dashboard] user_lesson_progress read failed: ${error.message}`, { cause: error })
    return data ?? []
  })
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
    // CQ-01: a failed streak read degrades to the not-started card instead of a 500.
    // Perf item 8: the streak and review loaders reuse the profile and progress rows read above
    // instead of re-reading `users` (twice) and `user_lesson_progress`.
    getUserStreakStatus(supabase, authUser.id, { profile: profilePromise }).catch((err) => {
      after(() =>
        logSystemError({
          severity: 'error',
          category: 'db',
          operation: 'dashboard_streak_read',
          message: String(err),
          userId: authUser.id,
        }),
      )
      return notStartedStreakStatus()
    }),
    getReviewQueueData(supabase, authUser.id, { profile: profilePromise, progressRows: progressPromise }),
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

  // 3. Resolve Goal-Driven Personalization & Next Lesson CTA
  // Uses the identical resolver onboarding uses (resolveStartLearningTarget)
  const personalizedPath = resolvePersonalizedPath(profile)

  const accessContext = {
    completedIds: completedLessonIds,
    treatment: isModuleEntryUnlockTreatment({
      id: authUser.id,
      createdAt: profile.created_at ?? null,
    }),
  }
  const startLearningTarget = resolveStartLearningTarget(
    personalizedPath,
    curriculumLessons,
    accessContext
  )

  let nextLesson: NextLessonPanelData | null = null
  if (startLearningTarget) {
    const activeNext = startLearningTarget.lesson
    const position = getLessonPosition(activeNext, curriculum)
    nextLesson = {
      id: activeNext.id,
      positionLabel: position.label,
      title: activeNext.title,
      module: activeNext.module,
      moduleTitle: position.moduleTitle,
      estimatedTime: `${activeNext.estimatedReadingTime} min`,
      moduleDone: curriculumLessons.filter((l) => l.module === activeNext.module && completedLessonIds.has(l.id)).length,
      moduleTotal: curriculumLessons.filter((l) => l.module === activeNext.module).length,
      started: progressRows.some((p) => p.lesson_id === activeNext.id && p.status !== 'not_started'),
    }
  } else if (curriculumLessons.length > 0) {
    const activeNextIndex = curriculumLessons.findIndex((l) => !completedLessonIds.has(l.id))
    if (activeNextIndex !== -1) {
      const activeNext = curriculumLessons[activeNextIndex]
      // Module-local numbering ("Module 2 · Lesson 3"), never the global 1..90 index (W1).
      const position = getLessonPosition(activeNext, curriculum)
      nextLesson = {
        id: activeNext.id,
        positionLabel: position.label,
        title: activeNext.title,
        module: activeNext.module,
        moduleTitle: position.moduleTitle,
        estimatedTime: `${activeNext.estimatedReadingTime} min`,
        moduleDone: curriculumLessons.filter((l) => l.module === activeNext.module && completedLessonIds.has(l.id)).length,
        moduleTotal: curriculumLessons.filter((l) => l.module === activeNext.module).length,
        started: progressRows.some((p) => p.lesson_id === activeNext.id && p.status !== 'not_started'),
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

  // The prompt uses the same unlock rule the server enforces (lib/capstones-db.ts
  // resolveCapstoneThreshold): N completed module lessons, where N comes from the Phase 7
  // threshold experiment (8 by default). The profile row already carries users.created_at.
  const thresholdConfig = getCapstoneThresholdConfig()
  const requiredCapstoneLessons = getRequiredLessonsForVariant(
    getCapstoneThresholdVariant({ id: authUser.id, createdAt: profile.created_at ?? null }, thresholdConfig),
    thresholdConfig,
  )

  // Curriculum order (Module 1..9), so "first eligible" means the earliest module.
  const capstoneDefs = getAllCapstoneDefinitions()
  for (const cap of capstoneDefs) {
    const status = capstoneStatusMap.get(cap.moduleSlug) || 'not_started'
    const isDone = status === 'submitted' || status === 'reviewed'

    if (!isDone) {
      const curriculumModule = getCurriculumModuleForCapstone(cap.moduleSlug)
      const moduleLessons = curriculumLessons.filter((l) => l.module === curriculumModule)
      const completedInModule = moduleLessons.filter((l) => completedLessonIds.has(l.id)).length
      const isEligible = moduleLessons.length > 0 && completedInModule >= requiredCapstoneLessons

      if (isEligible) {
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

  // 5. Learner-local time, level and this week's lessons
  const local = getUserLocalTime(profile.timezone)
  const totalXp = Math.max(0, profile.total_xp ?? 0)
  const level = calculateLevel(totalXp)
  const weekStartIso = weekStrip(local.localDate, 0, null)[0].date
  const lessonsThisWeek = progressRows.filter(
    (p) => p.status === 'completed' && typeof p.completed_at === 'string' && localDateOf(p.completed_at, profile.timezone) >= weekStartIso,
  ).length

  // 6. Today's plan: the next lesson, due flashcards, an open capstone
  const plan: PlanItem[] = []
  if (nextLesson) {
    plan.push({
      key: 'lesson',
      icon: 'lesson',
      title: `${nextLesson.started ? 'Finish' : 'Start'} ${nextLesson.title}`,
      detail: `${nextLesson.positionLabel} · ${nextLesson.estimatedTime}`,
      reward: level.xpRemaining > 0 ? `Toward Level ${level.level + 1}` : 'Keeps your streak',
      action: nextLesson.started ? 'Resume' : 'Start',
      href: lessonPath(nextLesson.module, nextLesson.id),
      primary: true,
    })
  }
  const due = reviewQueue.dueCards.length
  if (due > 0) {
    plan.push({
      key: 'review',
      icon: 'review',
      title: `Review ${due} flashcard${due === 1 ? '' : 's'}`,
      detail: 'Spaced review keeps earlier lessons fresh',
      reward: `+${due * XP_VALUES.FLASHCARD_REVIEW} XP`,
      action: 'Start review',
      href: '/review',
    })
  }
  if (nextCapstonePrompt) {
    plan.push({
      key: 'capstone',
      icon: 'capstone',
      title: `Start the Module ${nextCapstonePrompt.moduleNumber} capstone`,
      detail: nextCapstonePrompt.title,
      reward: `+${XP_VALUES.CAPSTONE_SUBMITTED} XP`,
      action: 'Open brief',
      href: `/capstones/${nextCapstonePrompt.moduleSlug}`,
    })
  }

  // 7. Recent XP, every source labelled
  const zone = safeZone(profile.timezone)
  const recentXp: XpStripItem[] = (recentXpEvents || []).map((event) => {
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(new Date(event.created_at))
    return {
      id: event.id,
      when: relativeDayLabel(localDateOf(event.created_at, zone), local.localDate, time),
      label: xpSourceLabel(event.source_type),
      amount: event.xp_amount,
    }
  })

  const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone }).format(new Date())

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{dateLabel}</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight">
            {greetingFor(local.localHour)}, {firstName(profile.name, profile.username)}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-border bg-surface px-3 py-1 tabular-nums text-ink-muted">
            {completedLessonsCount} of {curriculumLessons.length} lessons
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1 tabular-nums text-ink-muted">
            {submittedCapstonesCount} of {capstoneDefs.length} capstones
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <NextLessonPanel lesson={nextLesson} level={level} totalXp={totalXp} firstSession={completedLessonsCount === 0 && nextLesson?.started === false} />
        <StreakGoalPanel
          streak={streakStatus.effectiveCurrentStreak}
          best={streakStatus.longestStreak}
          studiedToday={streakStatus.isTodayCompleted}
          week={weekStrip(local.localDate, streakStatus.effectiveCurrentStreak, streakStatus.lastActivityDate || null)}
          freezes={streakStatus.streakFreezesAvailable}
          maxFreezes={STREAK_RULES.MAX_FREEZES}
          nextFreezeDay={nextFreezeDay(streakStatus.effectiveCurrentStreak)}
          weeklyGoal={profile.weekly_goal_lessons ?? null}
          lessonsThisWeek={lessonsThisWeek}
        />
      </div>

      {/* Flex, not grid: if the leaderboard widget renders nothing (opted out), the plan fills the row. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <TodaysPlan items={plan} />
        </div>
        {/* Streamed: the roster-wide leaderboard aggregation must not block the page. */}
        <Suspense fallback={<LeaderboardWidgetSkeleton />}>
          <LeaderboardWidgetSlot payloadPromise={leaderboardPromise} />
        </Suspense>
      </div>

      <RecentXpStrip items={recentXp} />

      {/* Portfolio & Proof: desktop only. On phones it lives in the More menu (approved mobile design). */}
      <div className="hidden lg:block">
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
      </div>
    </div>
  )
}

function safeZone(tz: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC' })
    return tz || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** YYYY-MM-DD of an instant in the learner's time zone. */
function localDateOf(iso: string, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: safeZone(tz) }).format(new Date(iso))
}
