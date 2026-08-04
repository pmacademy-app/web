import Link from 'next/link'
import { Sparkles, ArrowRight, Zap, RefreshCw } from 'lucide-react'

interface ReviewCompleteProps {
  cardsReviewedCount: number
  totalXpEarned: number
  passedCount: number
  onRestartSession?: () => void
}

export function ReviewComplete({
  cardsReviewedCount,
  totalXpEarned,
  passedCount,
  onRestartSession,
}: ReviewCompleteProps) {
  const recallAccuracy = cardsReviewedCount > 0
    ? Math.round((passedCount / cardsReviewedCount) * 100)
    : 100

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-8 md:p-12 text-center max-w-xl mx-auto space-y-6 shadow-md">
      <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/40 text-primary flex items-center justify-center mx-auto">
        <Sparkles className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <span className="text-xs uppercase tracking-wider font-semibold text-primary">
          Session Complete
        </span>
        <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground">
          Great Job! Review Finished 🎯
        </h2>
        <p className="text-sm text-muted-foreground">
          Your reviews have been processed by the SM-2 algorithm. Your next interval dates are scheduled!
        </p>
      </div>

      {/* Metric Badges */}
      <div className="grid grid-cols-3 gap-3 py-2">
        <div className="bg-card border border-border/80 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">
            Reviewed
          </span>
          <p className="text-xl font-extrabold font-mono text-foreground mt-0.5">
            {cardsReviewedCount}
          </p>
        </div>

        <div className="bg-card border border-border/80 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">
            XP Earned
          </span>
          <p className="text-xl font-extrabold font-mono text-amber-500 mt-0.5 flex items-center justify-center gap-1">
            <Zap className="w-4 h-4 fill-current" />
            +{totalXpEarned}
          </p>
        </div>

        <div className="bg-card border border-border/80 rounded-xl p-3">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">
            Recall Rate
          </span>
          <p className="text-xl font-extrabold font-mono text-emerald-500 mt-0.5">
            {recallAccuracy}%
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <Link
          href="/dashboard"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Back to Dashboard
          <ArrowRight className="w-4 h-4" />
        </Link>

        {onRestartSession && (
          <button
            type="button"
            onClick={onRestartSession}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-3 text-sm font-semibold text-foreground border border-border hover:bg-secondary/80 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Review Queue Again
          </button>
        )}
      </div>
    </div>
  )
}
