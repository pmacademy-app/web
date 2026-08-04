import { Award, Zap, ChevronRight } from 'lucide-react'
import { calculateLevel } from '@/lib/xp'

interface LevelCardProps {
  level: number
  totalXp: number
}

export function LevelCard({ totalXp }: LevelCardProps) {
  const levelInfo = calculateLevel(totalXp)
  const isMaxLevel = levelInfo.nextLevelMinXp === Infinity || levelInfo.level >= 9

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-bold font-serif text-foreground">
            Level & Career Rank
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <Zap className="w-3 h-3 fill-current" />
          {totalXp} XP Total
        </span>
      </div>

      <div className="space-y-3 my-1">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-primary">
              Level {levelInfo.level}
            </span>
            <h4 className="text-lg font-extrabold text-foreground font-serif">
              {levelInfo.title}
            </h4>
          </div>
          {!isMaxLevel && (
            <span className="text-xs font-mono text-muted-foreground font-medium">
              {levelInfo.xpRemaining} XP to Level {levelInfo.level + 1}
            </span>
          )}
        </div>

        {/* Level XP Progress Bar */}
        <div className="space-y-1">
          <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-500 to-amber-400 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${levelInfo.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>{levelInfo.currentLevelMinXp} XP</span>
            <span>{levelInfo.progress}%</span>
            <span>{isMaxLevel ? 'Max Rank' : `${levelInfo.nextLevelMinXp} XP`}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/50 pt-3">
        <span>Complete lessons & quizzes to gain XP</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </div>
  )
}
