'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Trophy, Zap, Flame, BarChart3, ArrowRight, Home, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { trackFirstRewardCelebrated } from '@/lib/analytics'

interface FirstSessionCelebrationModalProps {
  isOpen: boolean
  onClose: () => void
  lessonId: string
  xpEarned?: number
  nextLessonUrl?: string | null
  /** Growth R5 B11: shows "Invite a peer". The caller closes this dialog before opening the next. */
  onInvitePeers?: () => void
}

export function FirstSessionCelebrationModal({
  isOpen,
  onClose,
  lessonId,
  xpEarned = 50,
  nextLessonUrl,
  onInvitePeers,
}: FirstSessionCelebrationModalProps) {
  useEffect(() => {
    if (isOpen) {
      trackFirstRewardCelebrated(lessonId, xpEarned)
    }
  }, [isOpen, lessonId, xpEarned])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="first-session-celebration-modal"
        className="sm:max-w-md p-6 text-center overflow-x-hidden"
      >
        {/* Celebration Trophy Icon */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 via-primary to-primary text-white shadow-xl ring-4 ring-primary/20 animate-bounce">
            <Trophy className="w-10 h-10 stroke-[2.2]" />
          </div>
        </div>

        <DialogHeader className="space-y-2 pt-2">
          <DialogTitle className="text-2xl font-bold font-serif text-foreground">
            First Lesson Completed! 🎉
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
            You&apos;ve officially started your product management journey. Here is what you achieved in your first session:
          </DialogDescription>
        </DialogHeader>

        {/* Rewards summary grid */}
        <div className="grid grid-cols-3 gap-2.5 py-4">
          <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-center space-y-1">
            <div className="flex justify-center text-amber-500">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div className="text-sm font-bold text-foreground font-mono">+{xpEarned} XP</div>
            <div className="text-[10px] text-muted-foreground font-medium">Earned</div>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-center space-y-1">
            <div className="flex justify-center text-orange-500">
              <Flame className="w-5 h-5 fill-current" />
            </div>
            <div className="text-sm font-bold text-foreground">Day 1</div>
            <div className="text-[10px] text-muted-foreground font-medium">Streak Started</div>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-center space-y-1">
            <div className="flex justify-center text-primary">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="text-sm font-bold text-foreground">Active</div>
            <div className="text-[10px] text-muted-foreground font-medium">Skill Radar</div>
          </div>
        </div>

        {/* Growth R5 B11: frame the work as proof from the very first lesson. */}
        <p className="text-xs text-muted-foreground leading-relaxed" data-testid="portfolio-teaser">
          Every lesson you finish builds your public PM portfolio, the proof of your work you can share with recruiters.
        </p>

        {/* Primary and secondary navigation actions */}
        <div className="flex flex-col gap-2.5 pt-2">
          {nextLessonUrl ? (
            <Link
              href={nextLessonUrl}
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Continue to Lesson 2
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/academy"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Explore Academy
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}

          <Link
            href="/dashboard"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
          >
            <Home className="w-3.5 h-3.5" />
            Go to Dashboard
          </Link>

          {onInvitePeers && (
            <Button type="button" variant="ghost" size="sm" onClick={onInvitePeers}>
              <UserPlus aria-hidden="true" />
              Invite a peer
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
