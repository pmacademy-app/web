import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getModuleCapstonesOverview } from '@/lib/capstones-db'
import { CapstoneCard } from '@/components/capstones/CapstoneCard'
import { Award, BookOpen, Layers, CheckCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Capstone Workspace | PM Academy',
  description: 'Applied module capstone deliverables for practical product management mastery.',
}

export default async function CapstonesOverviewPage() {
  const user = await getServerUser()
  const supabase = createServerSupabaseClient()

  const userId = user?.id ?? ''
  const overviewItems = userId ? await getModuleCapstonesOverview(supabase, userId) : []

  const submittedCount = overviewItems.filter((i) => i.status === 'submitted' || i.status === 'reviewed').length
  const draftCount = overviewItems.filter((i) => i.status === 'draft').length
  const totalCount = overviewItems.length

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            PM Portfolio &amp; Applied Work
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
              Capstone Workspace
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-1.5 leading-relaxed">
              Transform your product management theory into real-world, portfolio-ready artifacts.
              Each module ends in an applied deliverable resembling genuine product work.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 bg-card border border-border p-3 rounded-xl shadow-xs self-start md:self-auto">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-bold">
              <CheckCircle className="w-4 h-4" />
              <span>{submittedCount} / {totalCount} Submitted</span>
            </div>
            {draftCount > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 text-xs font-bold">
                {draftCount} Drafts in Progress
              </div>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex flex-wrap items-center gap-4 pt-2">
          {[
            { icon: Layers, label: '9 Applied Capstones' },
            { icon: BookOpen, label: 'Real Product Deliverables' },
            { icon: Award, label: '150 XP Earned Per Submission' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Icon className="h-3.5 w-3.5 text-primary" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Capstone Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {overviewItems.map((item) => (
          <CapstoneCard key={item.moduleSlug} item={item} />
        ))}
      </div>
    </div>
  )
}
