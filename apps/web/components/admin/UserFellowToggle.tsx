'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, Loader2, Check } from 'lucide-react'
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog'
import { useAdminToast } from '@/components/admin/admin-toast'

export interface UserFellowToggleProps {
  userId: string
  initialIsFellow: boolean
  userEmail: string
}

export function UserFellowToggle({ userId, initialIsFellow, userEmail }: UserFellowToggleProps) {
  const { toast } = useAdminToast()
  const router = useRouter()
  const [isFellow, setIsFellow] = useState(initialIsFellow)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const nextState = !isFellow
  const actionLabel = nextState ? 'grant Fellow status to' : 'revoke Fellow status from'

  const handleToggleFellow = async () => {
    setConfirmOpen(false)
    setLoading(true)
    setSuccess(false)

    try {
      const res = await fetch(`/api/admin/users/${userId}/fellow-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFellow: nextState }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setIsFellow(nextState)
        setSuccess(true)
        toast(
          `User ${userEmail} is ${nextState ? 'now designated as a Product Management Fellow' : 'no longer designated as a Fellow'}.`,
          'success'
        )
        setTimeout(() => setSuccess(false), 3000)
        router.refresh()
      } else {
        toast(data.error || 'Failed to update Fellow status.', 'error')
      }
    } catch {
      toast('Network error updating Fellow status.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-3.5 rounded-xl bg-admin-surface border border-admin-border space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-admin-accent-soft text-admin-accent border border-admin-accent/20 shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-admin-fg">Product Management Fellow</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                  isFellow
                    ? 'bg-admin-accent-soft text-admin-accent border-admin-accent/30'
                    : 'bg-admin-surface-raised text-admin-fg-muted border-admin-border'
                }`}
              >
                {isFellow ? 'Designated Fellow' : 'Not a Fellow'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={loading}
          className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
            isFellow
              ? 'bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted border-admin-border'
              : 'bg-admin-accent-soft hover:bg-admin-accent/20 text-admin-accent border-admin-accent/25'
          }`}
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin text-admin-accent" />
          ) : success ? (
            <Check className="w-3 h-3 text-admin-success" />
          ) : (
            <GraduationCap className="w-3 h-3 text-admin-accent" />
          )}
          <span>{isFellow ? 'Revoke Fellow Status' : 'Designate as Fellow'}</span>
        </button>
      </div>

      <p className="text-[11px] text-admin-fg-muted leading-relaxed">
        Allows this user to display &ldquo;Product Management Fellow at Prodily&rdquo; on their public Portfolio.
      </p>

      <AdminConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${nextState ? 'Designate' : 'Revoke'} ${userEmail} as PM Fellow?`}
        description={`Are you sure you want to ${actionLabel} ${userEmail}? When active, their public portfolio will display "Product Management Fellow at Prodily".`}
        confirmLabel={nextState ? 'Designate as Fellow' : 'Revoke Fellow Status'}
        destructive={!nextState}
        onConfirm={handleToggleFellow}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
