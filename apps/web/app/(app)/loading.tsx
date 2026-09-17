import { Skeleton } from '@/components/ui/skeleton'

export default function AppLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-8" role="status" aria-busy="true">
      {/* Profile/Header Banner Skeleton */}
      <div className="bg-card border border-border rounded-xl p-6 h-28 flex flex-col justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-56" />
        </div>
        <Skeleton className="h-3 w-40" />
      </div>

      {/* Hero CTA Skeleton */}
      <div className="border border-border/50 bg-secondary/20 rounded-xl p-6 h-24 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      {/* Dashboard Skill Radar Grid Skeleton */}
      <div className="border border-border bg-card rounded-xl p-6 md:p-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-80" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="rounded-lg bg-secondary/40 p-4 border border-border/50 h-24 flex flex-col justify-between">
              <Skeleton className="h-3 w-28" />
              <div className="flex justify-between items-end mt-2">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3.5 w-16" />
              </div>
              <Skeleton className="w-full h-1.5 rounded-full mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
