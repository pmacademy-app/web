import { BookOpen, Clock } from 'lucide-react'

/**
 * Decorative marketing mockup of a lesson card.
 * aria-hidden — parent section provides a text summary.
 */
export function LessonCardPreview() {
  return (
    <div
      aria-hidden="true"
      className="
        bg-surface border border-border rounded-lg p-3.5
        shadow-sm w-full max-w-[280px]
        flex items-center gap-3
      "
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center flex-shrink-0">
        <BookOpen size={16} className="text-primary" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-body-sm font-medium text-foreground truncate">
          Writing a PRD people can actually use
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <Clock size={11} className="text-locked" />
          <span className="text-caption text-locked">18 min</span>
          <span className="text-caption text-success font-medium">• Quiz ready</span>
        </div>
      </div>
    </div>
  )
}
