import { Zap, Flame } from 'lucide-react'

/**
 * Decorative XP and streak row for the hero mockup cluster.
 * aria-hidden — parent section provides a text summary.
 */
export function XPRowPreview() {
  return (
    <div
      aria-hidden="true"
      className="
        bg-surface border border-border rounded-lg px-4 py-3
        shadow-sm w-full max-w-[280px]
        flex items-center justify-between gap-4
      "
    >
      {/* XP */}
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-xs bg-accent/15 flex items-center justify-center">
          <Zap size={11} className="text-accent" />
        </div>
        <span className="text-body-sm font-semibold text-foreground">1,240</span>
        <span className="text-caption text-locked">XP</span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Streak */}
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-xs bg-warning-bg flex items-center justify-center">
          <Flame size={11} className="text-warning" />
        </div>
        <span className="text-body-sm font-semibold text-foreground">7</span>
        <span className="text-caption text-locked">day streak</span>
      </div>

      {/* Level */}
      <div className="ml-auto">
        <span className="text-caption text-locked">Level </span>
        <span className="text-caption font-semibold text-foreground">3</span>
      </div>
    </div>
  )
}
