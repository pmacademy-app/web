import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12" role="status" aria-busy="true">
      {/* 0. Personalized Goal Header Skeleton */}
      <div className="rounded-2xl border border-border/70 bg-card/40 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3.5 w-80" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      {/* 1. Continue Learning Hero Skeleton */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs">
        <div className="space-y-3 max-w-xl w-full">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-8 w-72" />
          <div className="flex gap-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-12 w-44 rounded-xl" />
      </div>

      {/* 2. Action Prompts Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-2xl border border-border/80 bg-card/60 space-y-4 flex flex-col justify-between h-40 shadow-xs"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-full" />
            </div>
            <Skeleton className="h-4 w-28 pt-2" />
          </div>
        ))}
      </div>

      {/* 3. Portfolio & Proof Card Skeleton */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-72" />
          </div>
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
