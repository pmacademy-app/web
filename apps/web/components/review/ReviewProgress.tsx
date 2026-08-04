interface ReviewProgressProps {
  currentIndex: number
  totalCards: number
}

export function ReviewProgress({ currentIndex, totalCards }: ReviewProgressProps) {
  const percentage = Math.min(
    100,
    Math.round(((currentIndex + 1) / Math.max(1, totalCards)) * 100)
  )

  return (
    <div className="w-full max-w-xl mx-auto space-y-1.5">
      <div className="flex justify-between items-center text-xs font-semibold">
        <span className="text-muted-foreground">
          Card {currentIndex + 1} of {totalCards}
        </span>
        <span className="text-primary font-mono">{percentage}%</span>
      </div>

      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
        <div
          className="bg-primary h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
