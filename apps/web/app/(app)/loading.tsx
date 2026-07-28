export default function AppLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-pulse">
      {/* Profile/Header Banner Skeleton */}
      <div className="bg-card border border-border rounded-xl p-6 h-28 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="h-3 w-32 bg-secondary rounded" />
          <div className="h-6 w-56 bg-secondary rounded" />
        </div>
        <div className="h-3 w-40 bg-secondary rounded" />
      </div>

      {/* Hero CTA Skeleton */}
      <div className="border border-border/50 bg-secondary/20 rounded-xl p-6 h-24 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3.5 w-24 bg-secondary rounded" />
          <div className="h-5 w-72 bg-secondary rounded" />
        </div>
        <div className="h-10 w-28 bg-secondary rounded-lg" />
      </div>

      {/* Dashboard Skill Radar Grid Skeleton */}
      <div className="border border-border bg-card rounded-xl p-6 md:p-8 space-y-6">
        <div className="space-y-2">
          <div className="h-5 w-48 bg-secondary rounded" />
          <div className="h-3.5 w-80 bg-secondary rounded" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="rounded-lg bg-secondary/40 p-4 border border-border/50 h-24 flex flex-col justify-between">
              <div className="h-3 w-28 bg-secondary rounded" />
              <div className="flex justify-between items-end mt-2">
                <div className="h-6 w-12 bg-secondary rounded" />
                <div className="h-3.5 w-16 bg-secondary rounded" />
              </div>
              <div className="w-full bg-secondary h-1.5 rounded-full mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
