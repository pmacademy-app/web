export function DashboardSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="h-24 bg-card border border-border rounded-2xl p-6" />

      {/* Hero CTA Skeleton */}
      <div className="h-36 bg-card border border-border rounded-2xl p-6" />

      {/* Hero Skill Radar Skeleton */}
      <div className="h-96 bg-card border border-border rounded-2xl p-6" />

      {/* 3-Column Metrics Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-44 bg-card border border-border rounded-2xl" />
        <div className="h-44 bg-card border border-border rounded-2xl" />
        <div className="h-44 bg-card border border-border rounded-2xl" />
      </div>

      {/* Recent Activity Skeleton */}
      <div className="h-64 bg-card border border-border rounded-2xl" />
    </div>
  )
}
