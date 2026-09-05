import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser, type UserProfile } from '@/lib/auth'
import { getUserXpSummary } from '@/lib/xp-service'
import { getUserStreakStatus } from '@/lib/streaks-db'
import { getSkillRadarSummary } from '@/lib/skillRadar'
import { getUserCertificates, issueCertificate } from '@/lib/certificates-db'
import { getUserBadgesData } from '@/lib/badges-db'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { resolvePersonalizedPath, resolveNextRecommendedMilestone } from '@/lib/personalization/path-resolver'
import { LevelCard } from '@/components/dashboard/LevelCard'
import { StreakCard } from '@/components/dashboard/StreakCard'
import { ProgressRingCard } from '@/components/dashboard/ProgressRingCard'
import { SkillRadarCard } from '@/components/dashboard/SkillRadarCard'
import { BadgeShowcaseCard } from '@/components/progress/BadgeShowcaseCard'
import { RecommendedActionCard } from '@/components/progress/RecommendedActionCard'
import { CapstonesOverviewCard } from '@/components/progress/CapstonesOverviewCard'
import { CertificatesCard } from '@/components/progress/CertificatesCard'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'My Progress & Competency Dashboard',
  description: 'Single source of truth for your PM skills, competency radar, lesson progress, capstones, XP rank, and certificates.',
}

export default async function ProgressPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

  // Batch 1: shared raw data reused by multiple sections below. Fetching
  // `user_lesson_progress` and curriculum data ONCE here (instead of letting the
  // skill-radar and badges services each fetch their own copies) removes what
  // was previously 3x duplicate lesson-progress queries and 2x curriculum loads
  // on this single page render.
  const [
    { data: progressRows },
    { data: capstoneRows },
    { data: personalizationRow },
    xpSummary,
    streakStatus,
    userCertificates,
    curriculum,
  ] = await Promise.all([
    (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status, quiz_score, quiz_attempts')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ lesson_id: string; status: 'not_started' | 'in_progress' | 'completed'; quiz_score: number | null; quiz_attempts: number }> | null
    }>,
    (supabase
      .from('capstone_submissions') as unknown as DBChain)
      .select('module_slug, status')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ module_slug: string; status: string }> | null
    }>,
    (supabase
      .from('users') as unknown as DBChain)
      .select('goal, career_role, onboarding_topics, onboarding_preference, learning_purpose')
      .eq('id', user.id)
      .maybeSingle() as unknown as Promise<{ data: Pick<UserProfile, 'goal' | 'career_role' | 'onboarding_topics' | 'onboarding_preference' | 'learning_purpose'> | null }>,
    getUserXpSummary(supabase, user.id),
    getUserStreakStatus(supabase, user.id),
    getUserCertificates(supabase, user.id),
    fetchCurriculumData().catch(() => null),
  ])

  const lessonModuleMap = new Map<string, string>(
    (curriculum?.lessons || []).map((l) => [l.id, l.module])
  )

  // Batch 2: sections that reuse the rows/map fetched above instead of re-querying.
  const [radarSummary, badgesData] = await Promise.all([
    getSkillRadarSummary(supabase, user.id, { progressRows: progressRows || undefined, lessonModuleMap }),
    getUserBadgesData(supabase, user.id, { progressRows: progressRows || undefined, capstoneRows: capstoneRows || undefined }),
  ])

  const completedLessons = progressRows?.filter((p) => p.status === 'completed').length ?? 0
  const completedPercentage = Math.min(100, Math.round((completedLessons / 90) * 100))

  // Recommended Next Action: goal-aware milestone (never skips/reorders lessons —
  // same personalization engine already used on the Dashboard).
  const completedLessonIds = new Set((progressRows || []).filter((p) => p.status === 'completed').map((p) => p.lesson_id))
  const allLessons = curriculum?.lessons || []
  const personalizedPath = resolvePersonalizedPath(personalizationRow)
  const recommendedMilestone = resolveNextRecommendedMilestone(personalizedPath, completedLessonIds, allLessons)

  // Auto-issue certificate if 90 lessons completed and no certificate exists yet
  let certificates = userCertificates
  if (completedLessons >= 90 && userCertificates.length === 0) {
    try {
      const issued = await issueCertificate(supabase, user.id, 'full_curriculum')
      certificates = [issued]
    } catch (e) {
      console.warn('Failed to auto-issue certificate:', e)
    }
  }

  // Capstones status map
  const capstoneMap = new Map<string, string>()
  if (capstoneRows) {
    for (const sub of capstoneRows) {
      capstoneMap.set(sub.module_slug, sub.status)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8 pb-16">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl md:text-4xl font-bold font-serif text-foreground mt-3">
          My Progress &amp; Competency
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Single source of truth for your product management skill radar, XP performance, capstones, and verified credentials.
        </p>
      </div>

      {/* Where am I? / What have I achieved? / What should I do next? */}
      <RecommendedActionCard personalizedPath={personalizedPath} milestone={recommendedMilestone} />

      {/* 1. Skill Radar (DOMINANT VISUAL) */}
      <SkillRadarCard
        skillValues={radarSummary.scores}
        breakdown={radarSummary.breakdown}
        overallScore={radarSummary.overallScore}
      />

      {/* 2. Primary Performance Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <LevelCard level={xpSummary.levelInfo.level} totalXp={xpSummary.totalXp} />
        <StreakCard streakStatus={streakStatus} />
        <ProgressRingCard completedLessons={completedLessons} totalLessons={90} />
      </div>

      {/* 3. Badge & Achievement Case */}
      <BadgeShowcaseCard
        unlockedCount={badgesData.totalEarned}
        totalBadges={badgesData.totalAvailable}
        badges={badgesData.allBadges}
      />

      {/* 4. Capstone Projects Section */}
      <CapstonesOverviewCard capstoneStatusByModule={capstoneMap} />

      {/* 5. Certificates & Credentials Section */}
      <CertificatesCard
        certificates={certificates}
        completedLessons={completedLessons}
        completedPercentage={completedPercentage}
      />
    </div>
  )
}
