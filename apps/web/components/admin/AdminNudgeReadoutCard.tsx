import { CheckCircle2, CircleDashed } from 'lucide-react'
import { NUDGE_RETIRE_MIN_TREATED, type AdminNudgeReadout } from '@/lib/admin/nudge-readout'
import type { ProofNudgeKey } from '@/lib/growth/proof-nudges'

/** What "converted" means for each nudge. The portfolio outcome has no timestamp. */
export const NUDGE_OUTCOME_LABELS: Record<ProofNudgeKey, string> = {
  'nudge.portfolio_ready': 'currently public (not time-bound)',
  'nudge.fellow_eligible': 'requested Fellow within 14 days',
}

const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`

/** Lift in percentage points, always signed. */
export function formatLift(lift: number): string {
  const points = lift * 100
  const rounded = Math.round(points * 10) / 10
  if (rounded === 0) return '0.0 pts'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)} pts`
}

interface AdminNudgeReadoutCardProps {
  nudges: AdminNudgeReadout[]
  retireReady: boolean
}

/** Proof-nudge readout: treated vs holdout outcome rates, lift, and whether the holdout can retire. */
export function AdminNudgeReadoutCard({ nudges, retireReady }: AdminNudgeReadoutCardProps) {
  return (
    <section
      aria-labelledby="nudge-readout-heading"
      className="rounded-xl border border-admin-border bg-admin-surface overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-admin-border">
        <h4 id="nudge-readout-heading" className="text-xs font-bold text-admin-fg uppercase tracking-wider">
          Proof Nudge Readout
        </h4>
        <p className="text-[11px] text-admin-fg-muted mt-0.5">
          Outcome rate for treated users vs the holdout, over distinct users. Lift is the treated rate minus
          the holdout rate.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-admin-fg-subtle border-b border-admin-border">
              <th scope="col" className="px-4 py-2 font-semibold">Nudge</th>
              <th scope="col" className="px-4 py-2 font-semibold text-right">Sent</th>
              <th scope="col" className="px-4 py-2 font-semibold text-right">Held out</th>
              <th scope="col" className="px-4 py-2 font-semibold text-right">Reminded</th>
              <th scope="col" className="px-4 py-2 font-semibold text-right">Treated rate</th>
              <th scope="col" className="px-4 py-2 font-semibold text-right">Holdout rate</th>
              <th scope="col" className="px-4 py-2 font-semibold text-right">Lift</th>
            </tr>
          </thead>
          <tbody>
            {nudges.map((n) => (
              <tr key={n.key} data-nudge={n.key} className="border-b border-admin-border/60 last:border-0">
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <span className="font-semibold text-admin-fg">{n.name}</span>
                  <span className="block text-[10px] text-admin-fg-subtle">
                    Outcome: {NUDGE_OUTCOME_LABELS[n.key] ?? n.key}
                  </span>
                </th>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-admin-fg">{n.sent}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-admin-fg">{n.heldOut}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-admin-fg">{n.reminded}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-admin-fg">{pct(n.treatedRate)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-admin-fg">{pct(n.holdoutRate)}</td>
                <td
                  className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                    n.lift > 0 ? 'text-admin-success' : n.lift < 0 ? 'text-admin-danger' : 'text-admin-fg-muted'
                  }`}
                >
                  {formatLift(n.lift)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        data-testid="nudge-retire-line"
        data-ready={retireReady ? 'true' : 'false'}
        className={`px-4 py-2.5 border-t border-admin-border text-[11px] flex items-start gap-2 ${
          retireReady ? 'text-admin-success' : 'text-admin-fg-subtle'
        }`}
      >
        {retireReady ? (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        ) : (
          <CircleDashed className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        )}
        <span>
          {retireReady
            ? 'Ready to retire the holdout: both nudges have enough treated users and a positive lift.'
            : `Keep the holdout: each nudge needs at least ${NUDGE_RETIRE_MIN_TREATED} treated users and a positive lift.`}
        </span>
      </div>
      <p className="px-4 pb-2.5 text-[11px] text-admin-fg-subtle">
        The portfolio outcome counts users whose portfolio is public now, so it is not tied to the nudge date.
      </p>
    </section>
  )
}
