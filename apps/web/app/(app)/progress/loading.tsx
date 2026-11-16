import { Skeleton } from '@/components/ui/skeleton'

export default function ProgressLoading() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12" role="status" aria-busy="true">
      {/* Header & Sub-Nav Skeleton */}
      <div className="space-y-4 border-b border-border pb-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Progress Metric / Radar Card Skeleton */}
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-6 shadow-xs">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-72" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="flex items-center justify-center py-8">
            <Skeleton className="h-56 w-56 rounded-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-2"
              >
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3.5 w-12" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
