import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { CapstonesOverviewCard } from '@/components/progress/CapstonesOverviewCard'
import { Briefcase } from 'lucide-react'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export const metadata: Metadata = {
  title: 'Capstone Projects | Progress',
  description: 'Applied product management capstone projects across all curriculum modules.',
}

export default async function CapstonesProgressPage() {
  const user = await getServerUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = createServiceRoleClient()

  const { data: capstoneRows } = (await (supabase
    .from('capstone_submissions') as unknown as DBChain)
    .select('module_slug, status')
    .eq('user_id', user.id)) as {
    data: Array<{ module_slug: string; status: string }> | null
  }

  const capstoneMap = new Map<string, string>()
  if (capstoneRows) {
    for (const sub of capstoneRows) {
      capstoneMap.set(sub.module_slug, sub.status)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
      <div className="border-b border-border/60 pb-4">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
        >
          ← Back to Dashboard
        </Link>
        <div className="flex items-center gap-2 mt-2">
          <Briefcase className="w-5 h-5 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Capstone Projects Overview
          </h1>
        </div>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Applied PRDs, launch plans, growth strategies, and real-world PM deliverables reviewed by experts.
        </p>
      </div>

      <CapstonesOverviewCard capstoneStatusByModule={capstoneMap} />
    </div>
  )
}
