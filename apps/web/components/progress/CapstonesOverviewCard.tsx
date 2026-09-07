import Link from 'next/link'
import { Shield, ArrowRight } from 'lucide-react'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'

interface CapstonesOverviewCardProps {
  capstoneStatusByModule: Map<string, string>
}

export function CapstonesOverviewCard({ capstoneStatusByModule }: CapstonesOverviewCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold font-serif text-foreground">
            Module Capstone Projects (9 Total)
          </h2>
        </div>
        <Link
          href="/capstones"
          className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
        >
          <span>View All Workspace</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.values(CAPSTONE_DEFINITIONS).map((cap) => {
          const status = capstoneStatusByModule.get(cap.moduleSlug) || 'not_started'
          const isDone = status === 'submitted' || status === 'reviewed'

          return (
            <div
              key={cap.moduleSlug}
              className="p-4 rounded-xl border border-border/80 bg-card/60 space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Module {cap.moduleNumber}
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                      isDone
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    {status.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="text-sm font-bold font-serif text-foreground">{cap.title}</h3>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{cap.deliverableType}</p>
              </div>

              <Link
                href={`/capstones/${cap.moduleSlug}`}
                className="mt-2 inline-flex items-center justify-between text-xs font-bold text-primary hover:underline"
              >
                <span>{isDone ? 'View Submission' : 'Open Workspace'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
