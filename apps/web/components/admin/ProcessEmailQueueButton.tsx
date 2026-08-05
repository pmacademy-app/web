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
        className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-lg disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin fill-slate-950" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-slate-950" />
        )}
        <span>Process Queue Now</span>
      </button>

      {result && (
        <div className={`text-[11px] font-mono p-2 rounded border ${result.error ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'}`}>
          {result.error ? (
            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-rose-400" /> {result.error}</span>
          ) : (
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" /> Processed: {result.processed}, Delivered: {result.delivered}, Failed: {result.failed}</span>
          )}
        </div>
      )}
    </div>
  )
}
