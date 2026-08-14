'use client'

import React, { useState } from 'react'
import { Play, Loader2, Check, AlertCircle } from 'lucide-react'

export function ProcessEmailQueueButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ processed?: number; delivered?: number; failed?: number; error?: string } | null>(null)

  const handleProcessQueue = async () => {
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/admin/emails/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setResult(data.result)
      } else {
        setResult({ error: data.error || 'Failed to process email queue.' })
      }
    } catch {
      setResult({ error: 'Network error trigger processing queue.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleProcessQueue}
        disabled={loading}
        className="px-3.5 py-2 rounded-lg bg-admin-accent hover:bg-admin-accent/90 text-admin-accent-fg text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-lg disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin fill-admin-accent-fg" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-admin-accent-fg" />
        )}
        <span>Process Queue Now</span>
      </button>

      {result && (
        <div className={`text-[11px] font-mono p-2 rounded border ${result.error ? 'bg-admin-danger-soft text-admin-danger border-admin-danger/25' : 'bg-admin-success-soft text-admin-success border-admin-success/25'}`}>
          {result.error ? (
            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-admin-danger" /> {result.error}</span>
          ) : (
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-admin-success" /> Processed: {result.processed}, Delivered: {result.delivered}, Failed: {result.failed}</span>
          )}
        </div>
      )}
    </div>
  )
}
