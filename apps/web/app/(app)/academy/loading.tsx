import { Skeleton } from '@/components/ui/skeleton'

export default function AcademyLoading() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12" role="status" aria-busy="true">
      {/* Header Skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Modules List Skeleton */}
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, mIdx) => (
          <div
            key={mIdx}
            className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-48" />
                </div>
              </div>
              <Skeleton className="h-4 w-16" />
            </div>

            {/* Lesson Rows */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              {Array.from({ length: 3 }).map((_, lIdx) => (
                <div
                  key={lIdx}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
