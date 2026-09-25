import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser, type UserProfile } from '@/lib/auth'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { resolvePersonalizedPath, resolveNextRecommendedMilestone } from '@/lib/personalization/path-resolver'
import { RecommendedActionCard } from '@/components/progress/RecommendedActionCard'
import { Sparkles } from 'lucide-react'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Next Milestone | Progress',
  description: 'Personalized next action recommendations and curriculum milestones.',
}

export default async function MilestoneProgressPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

  const [
    { data: progressRows },
    { data: personalizationRow },
    curriculum,
  ] = await Promise.all([
    (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('lesson_id, status')
      .eq('user_id', user.id) as unknown as Promise<{
      data: Array<{ lesson_id: string; status: 'not_started' | 'in_progress' | 'completed' }> | null
    }>,
    (supabase
      .from('users') as unknown as DBChain)
      .select('goal, career_role, onboarding_topics, onboarding_preference, learning_purpose')
      .eq('id', user.id)
      .maybeSingle() as unknown as Promise<{ data: Pick<UserProfile, 'goal' | 'career_role' | 'onboarding_topics' | 'onboarding_preference' | 'learning_purpose'> | null }>,
    fetchCurriculumData().catch(() => null),
  ])

  const completedLessonIds = new Set((progressRows || []).filter((p) => p.status === 'completed').map((p) => p.lesson_id))
  const allLessons = curriculum?.lessons || []
  const personalizedPath = resolvePersonalizedPath(personalizationRow)
  const recommendedMilestone = resolveNextRecommendedMilestone(personalizedPath, completedLessonIds, allLessons)

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
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Next Milestone &amp; Recommendations
          </h1>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Your goal-aware next steps, structured according to your learning path and role aspirations.
        </p>
      </div>

      <RecommendedActionCard personalizedPath={personalizedPath} milestone={recommendedMilestone} />
    </div>
  )
}
