/**
 * Decorative marketing mockup of a module card.
 * Module 03 — Execution & Delivery, 42% progress.
 * aria-hidden — parent section provides a text summary.
 */
export function ModuleCardPreview() {
  return (
    <div
      aria-hidden="true"
      className="
        bg-surface border border-border rounded-lg p-4
        shadow-sm w-full max-w-[280px]
      "
    >
      {/* Module header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-xs bg-skill-execution/10 flex items-center justify-center flex-shrink-0">
          <span className="text-micro font-bold text-skill-execution">03</span>
        </div>
        <span className="text-body-sm font-semibold text-foreground truncate">
          Execution & Delivery
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-caption text-locked">Progress</span>
          <span className="text-caption font-medium text-foreground">42%</span>
        </div>
        <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-skill-execution rounded-full"
            style={{ width: '42%' }}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-skill-execution" />
          <span className="text-caption text-locked">Execution</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-skill-leadership" />
          <span className="text-caption text-locked">Leadership</span>
        </div>
        <span className="ml-auto text-caption text-locked">10 lessons</span>
      </div>
    </div>
  )
}
