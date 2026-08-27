import Link from 'next/link'
import { BookOpen, ArrowRight, CheckCircle2, Play } from 'lucide-react'
import { FirstSessionKickoffCard } from './FirstSessionKickoffCard'

export { FirstSessionKickoffCard }

export interface NextLessonData {
  id: string
  order: number
  title: string
  module: string
  moduleTitle?: string
  estimatedTime: string
  progressPercentage?: number
}

interface ContinueLearningCardProps {
  nextLesson: NextLessonData | null
  totalLessonsCompleted: number
}

export function ContinueLearningCard({
  nextLesson,
  totalLessonsCompleted,
}: ContinueLearningCardProps) {
  if (!nextLesson) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Curriculum Complete
            </div>
            <h2 className="text-2xl font-bold font-serif text-foreground">
              Congratulations! All 90 Lessons Completed 👑
            </h2>
            <p className="text-sm text-muted-foreground">
              You have completed every lesson in PM Academy! Review past lessons, practice flashcards, or inspect your competency radar.
            </p>
          </div>

          <Link
            href="/academy"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Explore Curriculum
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  // First-session kickoff experience for new learners with 0 completed lessons
  if (totalLessonsCompleted === 0) {
    return <FirstSessionKickoffCard nextLesson={nextLesson} />
  }

  return (
    <div
      data-testid="continue-learning-card"
      className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-8 shadow-sm"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-wider">
            <BookOpen className="w-3.5 h-3.5" />
            Up Next
          </div>

          <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground leading-tight">
            Lesson {nextLesson.order}: {nextLesson.title}
          </h2>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">
              Module: <span className="capitalize">{nextLesson.module.replace('-', ' ')}</span>
            </span>
            <span>•</span>
            <span>Est. Time: {nextLesson.estimatedTime}</span>
            <span>•</span>
            <span>Theory + Practice Quiz</span>
          </div>
        </div>

        <Link
          href={`/academy/${nextLesson.module}/${nextLesson.id}`}
          className="inline-flex items-center gap-2.5 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <Play className="w-4 h-4 fill-current" />
          Continue Lesson →
        </Link>
      </div>
    </div>
  )
}
