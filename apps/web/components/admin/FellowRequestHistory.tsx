'use client'

import React, { useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FellowHistoryEvent } from '@/lib/admin/fellow-request-service'

interface FellowRequestHistoryProps {
  /** The learner's Fellow history, oldest first (AdminFellowRequestItem.history). */
  history: FellowHistoryEvent[] | undefined
  /** The queue row's own request id; its `request` event is marked as the current one. */
  currentRequestId: string
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

function describe(event: FellowHistoryEvent, currentRequestId: string): { label: string; detail: string | null } {
  switch (event.kind) {
    case 'request': {
      const parts: string[] = []
      if (event.reviewedAt) parts.push(`reviewed ${formatDate(event.reviewedAt)}`)
      if (event.rejectionReason) parts.push(`reason: ${event.rejectionReason}`)
      const current = event.requestId === currentRequestId ? ' (this request)' : ''
      return { label: `Request ${event.status}${current}`, detail: parts.length ? parts.join(' · ') : null }
    }
    case 'admin_grant':
      return { label: 'Fellow status set by admin', detail: event.adminEmail }
    case 'admin_revoke':
      return { label: 'Fellow status removed by admin', detail: event.adminEmail }
    case 'celebration':
      return { label: 'Fellow celebration sent', detail: event.seen ? 'seen' : 'not seen yet' }
  }
}

function eventKey(event: FellowHistoryEvent, index: number): string {
  return event.kind === 'request' ? `request-${event.requestId}` : `${event.kind}-${event.at}-${index}`
}

/**
 * Compact, collapsible Fellow history for one learner (admin R6 C4): every request, admin
 * grants and removals, and the Fellow celebration. Collapsed by default to keep rows short.
 */
export function FellowRequestHistory({ history, currentRequestId }: FellowRequestHistoryProps) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const events = history ?? []

  if (events.length === 0) return null

  return (
    <div className="mt-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="h-5 px-1 -ml-1 text-[10px] font-semibold text-admin-fg-muted hover:text-admin-fg"
      >
        {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        History ({events.length})
      </Button>
      {open && (
        <div id={listId} className="mt-1 max-w-[260px]">
          <ol className="space-y-1 border-l border-admin-border pl-2">
            {events.map((event, i) => {
              const { label, detail } = describe(event, currentRequestId)
              return (
                <li key={eventKey(event, i)} className="text-[10px] leading-snug">
                  <time dateTime={event.at} className="font-mono text-admin-fg-muted">
                    {formatDate(event.at)}
                  </time>{' '}
                  <span className="text-admin-fg">{label}</span>
                  {detail && <span className="block text-admin-fg-muted break-words">{detail}</span>}
                </li>
              )
            })}
          </ol>
          <p className="mt-1 text-[9px] text-admin-fg-muted">Celebrations older than 45 days may not be listed.</p>
        </div>
      )}
    </div>
  )
}
