import React from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { AdminStatusBadge } from './AdminStatusBadge'
import type { AdminUserProofSummary } from '@/lib/admin/user-proof-service'

/**
 * Proof state for one learner in the admin user drawer (Admin R6 / C3).
 *
 * Purely presentational: the summary is loaded server-side by `getUserProofSummary` and passed in.
 * `null` means the load failed, so the panel shows a compact inline note instead of the data.
 * Wording: Fellow is a designation, never a "certificate" or "credential".
 */

const FELLOW_STATE: Record<AdminUserProofSummary['fellowState'], { label: string; status: string }> = {
  not_eligible: { label: 'Not eligible yet', status: 'archived' },
  eligible: { label: 'Eligible, not requested', status: 'info' },
  pending: { label: 'Request pending', status: 'pending' },
  approved: { label: 'Fellow', status: 'success' },
  rejected: { label: 'Request declined', status: 'danger' },
}

const REQUEST_STATUS: Record<NonNullable<AdminUserProofSummary['latestRequest']>['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Declined',
}

const NUDGE_NAME: Record<NonNullable<AdminUserProofSummary['lastNudge']>['key'], string> = {
  'nudge.portfolio_ready': 'Portfolio ready',
  'nudge.fellow_eligible': 'Fellow eligible',
}

/** Fixed locale and time zone so server and client render the same string. */
export function formatProofDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function portfolioLabel(portfolio: AdminUserProofSummary['portfolio']): { label: string; status: string } {
  if (portfolio.isPublic) return { label: 'Public', status: 'success' }
  if (portfolio.readyButPrivate) return { label: 'Ready but private', status: 'warning' }
  return { label: 'Not ready', status: 'archived' }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-admin-border last:border-b-0">
      <dt className="text-xs text-admin-fg-muted shrink-0">{label}</dt>
      <dd className="text-xs font-semibold text-admin-fg text-right min-w-0">{children}</dd>
    </div>
  )
}

export function UserProofPanel({ proof }: { proof: AdminUserProofSummary | null }) {
  return (
    <section
      aria-labelledby="user-proof-heading"
      className="p-4 rounded-xl bg-admin-bg/60 border border-admin-border space-y-3"
    >
      <h3
        id="user-proof-heading"
        className="text-xs font-bold text-admin-fg-muted uppercase tracking-wider flex items-center gap-1.5"
      >
        <Sparkles className="w-3.5 h-3.5 text-admin-accent" aria-hidden="true" />
        Proof state
      </h3>

      {!proof ? (
        <p role="status" className="flex items-center gap-2 text-xs text-admin-fg-muted">
          <AlertTriangle className="w-3.5 h-3.5 text-admin-warning shrink-0" aria-hidden="true" />
          Proof state could not be loaded. Refresh the page to try again.
        </p>
      ) : (
        <ProofDetails proof={proof} />
      )}
    </section>
  )
}

function ProofDetails({ proof }: { proof: AdminUserProofSummary }) {
  const portfolio = portfolioLabel(proof.portfolio)
  const fellow = FELLOW_STATE[proof.fellowState]

  return (
    <>
      <p className="text-sm font-semibold text-admin-fg" data-testid="proof-next-step">
        {proof.nextStep.text}
      </p>
      <dl>
        <Row label="Portfolio">
          <span className="inline-flex items-center gap-2">
            <AdminStatusBadge status={portfolio.status} label={portfolio.label} />
            <span className="text-admin-fg-muted font-normal">{proof.portfolio.readinessPercent}% ready</span>
          </span>
        </Row>
        <Row label="Fellow">
          <AdminStatusBadge status={fellow.status} label={fellow.label} />
        </Row>
        <Row label="Latest request">
          {proof.latestRequest ? (
            <span>
              {REQUEST_STATUS[proof.latestRequest.status]}
              <span className="block text-admin-fg-muted font-normal">
                Requested {formatProofDate(proof.latestRequest.requestedAt)}
                {proof.latestRequest.reviewedAt
                  ? `, reviewed ${formatProofDate(proof.latestRequest.reviewedAt)}`
                  : ''}
              </span>
            </span>
          ) : (
            <span className="text-admin-fg-muted font-normal">None</span>
          )}
        </Row>
        <Row label="Lessons">
          {proof.lessons.completed} of {proof.lessons.total}
          {proof.lessons.curriculumComplete ? ' (curriculum complete)' : ''}
        </Row>
        <Row label="Next capstone">
          {proof.nextCapstone ? (
            <span className="break-words">{proof.nextCapstone.title}</span>
          ) : (
            <span className="text-admin-fg-muted font-normal">None</span>
          )}
        </Row>
        <Row label="Last nudge">
          {proof.lastNudge ? (
            <span>
              {NUDGE_NAME[proof.lastNudge.key]} ({proof.lastNudge.round === 'reminder' ? 'reminder' : 'first send'})
              <span className="block text-admin-fg-muted font-normal">
                {proof.lastNudge.heldOut ? 'Held out (no nudge sent)' : 'Sent'}, {formatProofDate(proof.lastNudge.at)}
              </span>
            </span>
          ) : (
            <span className="text-admin-fg-muted font-normal">None</span>
          )}
        </Row>
      </dl>
    </>
  )
}
