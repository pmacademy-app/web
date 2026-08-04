import { Activity, BookOpen, CheckCircle, Zap, Flame } from 'lucide-react'

export interface ActivityItem {
  id: string
  type: 'lesson_completed' | 'quiz_completed' | 'streak_maintained' | 'xp_earned'
  title: string
  description: string
  xpAmount?: number
  timestamp: string
}

interface RecentActivityCardProps {
  activities: ActivityItem[]
}

export function RecentActivityCard({ activities }: RecentActivityCardProps) {
  const getItemIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'lesson_completed':
        return <BookOpen className="w-4 h-4 text-primary" />
      case 'quiz_completed':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case 'streak_maintained':
        return <Flame className="w-4 h-4 text-amber-500" />
      case 'xp_earned':
      default:
        return <Zap className="w-4 h-4 text-sky-500" />
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold font-serif text-foreground">
            Recent Learning Activity
          </h3>
        </div>
        <span className="text-xs text-muted-foreground font-medium">
          Last 5 Milestones
        </span>
      </div>

      {activities.length > 0 ? (
        <div className="space-y-3">
          {activities.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 p-3 rounded-xl bg-secondary/20 border border-border/40 hover:bg-secondary/40 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-background border border-border/60 mt-0.5">
                  {getItemIcon(item.type)}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end shrink-0">
                {item.xpAmount ? (
                  <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                    +{item.xpAmount} XP
                  </span>
                ) : null}
                <span className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                  {item.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">No recent activity logged yet.</p>
          <p>Complete your first lesson to record learning milestones!</p>
        </div>
      )}
    </div>
  )
}
