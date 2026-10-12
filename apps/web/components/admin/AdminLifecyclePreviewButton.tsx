'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPost } from '@/lib/api/client'
import type { AdminLifecyclePreviewResponse } from '@/lib/api/contracts/admin'

export const LIFECYCLE_PREVIEW_PATH = '/api/admin/automations/lifecycle-preview?force=true'

export type LifecyclePreviewResponse = AdminLifecyclePreviewResponse

/** Optional display names for sequence / nudge keys. Falls back to the key. */
interface AdminLifecyclePreviewButtonProps {
  names?: Record<string, string>
}

/**
 * Admin R6 C2: dry-run the lifecycle cron for every learner and show what today's run would
 * queue. The route always runs with dryRun on, so nothing is sent or written.
 */
export function AdminLifecyclePreviewButton({ names }: AdminLifecyclePreviewButtonProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LifecyclePreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runPreview = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost<LifecyclePreviewResponse>(LIFECYCLE_PREVIEW_PATH)
      if (res.ok && res.data.success) {
        setResult(res.data)
      } else {
        setResult(null)
        setError(!res.ok ? res.error.message : res.data.error || 'Preview failed.')
      }
    } catch {
      setResult(null)
      setError('Network error running the preview.')
    } finally {
      setLoading(false)
    }
  }

  const label = (key: string) => names?.[key] ?? key

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={loading}
        onClick={runPreview}
        className="border-admin-border bg-admin-surface text-admin-fg hover:bg-admin-surface-raised transition-colors"
      >
        {!loading && <Eye aria-hidden="true" />}
        Preview today&apos;s run (no emails sent)
      </Button>

      <div aria-live="polite">
        {error && (
          <p data-testid="lifecycle-preview-error" className="text-xs text-admin-danger">
            {error}
          </p>
        )}

        {result && (
          <div
            data-testid="lifecycle-preview-result"
            className="rounded-xl border border-admin-border bg-admin-surface p-4 space-y-3 text-xs"
          >
            <p className="text-admin-fg-muted">
              Dry run across all learners. Nothing was sent or recorded.
              {result.paused && (
                <span className="block mt-1 font-semibold text-admin-warning">
                  Lifecycle sends are paused, so a real run would send nothing.
                </span>
              )}
            </p>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <PreviewStat label="Lifecycle queued" value={result.lifecycleQueued} />
              <PreviewStat label="Lifecycle held out" value={result.heldOut} />
              <PreviewStat label="Nudges held out" value={result.nudgesHeldOut} />
              <PreviewStat label="No segment" value={result.skippedNoSegment} />
            </dl>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PreviewList title="Per sequence" entries={result.queuedBySequence} label={label} />
              <PreviewList title="Per nudge" entries={result.nudges} label={label} />
            </div>

            {(result.skippedTimezone > 0 || result.nudgePagesSkipped > 0) && (
              <p className="text-[11px] text-admin-fg-muted">
                Skipped: {result.skippedTimezone} outside their delivery hour, {result.nudgePagesSkipped} page(s)
                that failed to load
                {(result.pagesSkipped ?? 0) > 0
                  ? ` (${result.pagesSkipped} of them skipped entirely, lifecycle emails included)`
                  : ''}
                .
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] text-admin-fg-muted">{label}</dt>
      <dd className="font-mono tabular-nums text-base font-bold text-admin-fg">{value}</dd>
    </div>
  )
}

function PreviewList({
  title,
  entries,
  label,
}: {
  title: string
  entries: Record<string, number>
  label: (key: string) => string
}) {
  const rows = Object.entries(entries ?? {})
  return (
    <div>
      <p className="text-[11px] font-semibold text-admin-fg-muted uppercase tracking-wider mb-1">{title}</p>
      {rows.length === 0 ? (
        <p className="text-admin-fg-muted">None</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(([key, n]) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="text-admin-fg truncate">{label(key)}</span>
              <span className="font-mono tabular-nums text-admin-fg">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
