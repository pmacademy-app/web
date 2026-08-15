'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Loader2, Check } from 'lucide-react'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog'
import { useAdminToast } from '@/components/admin/admin-toast'

export interface UserRoleToggleProps {
  userId: string
  initialIsAdmin: boolean
  userEmail: string
}

export function UserRoleToggle({ userId, initialIsAdmin, userEmail }: UserRoleToggleProps) {
  const { toast } = useAdminToast()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const nextRole = !isAdmin
  const actionLabel = nextRole ? 'promote to ADMIN' : 'demote to LEARNER'

  const handleToggleRole = async () => {
    setConfirmOpen(false)
    setLoading(true)
    setSuccess(false)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: userId,
          makeAdmin: nextRole,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setIsAdmin(nextRole)
        setSuccess(true)
        toast(`User ${userEmail} is now ${nextRole ? 'an Admin' : 'a Learner'}.`, 'success')
        setTimeout(() => setSuccess(false), 3000)
        // Re-fetch the server-rendered list so the table's role badge stays in sync.
        router.refresh()
      } else {
        toast(data.error || 'Failed to update user role.', 'error')
      }
    } catch {
      toast('Network error updating user role.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <AdminStatusBadge
        status={isAdmin ? 'admin' : 'learner'}
        label={isAdmin ? 'Admin' : 'Learner'}
      />
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-all inline-flex items-center gap-1 ${
          isAdmin
            ? 'bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted border-admin-border'
            : 'bg-admin-info-soft hover:bg-admin-info/20 text-admin-info border-admin-info/25'
        }`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-admin-accent" />
        ) : success ? (
          <Check className="w-3 h-3 text-admin-success" />
        ) : (
          <Shield className="w-3 h-3 text-admin-accent" />
        )}
        <span>{isAdmin ? 'Demote to Learner' : 'Make Admin'}</span>
      </button>

      <AdminConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`${nextRole ? 'Promote' : 'Demote'} ${userEmail}?`}
        description={`Are you sure you want to ${actionLabel}? This changes their access level in the console.`}
        confirmLabel={nextRole ? 'Make Admin' : 'Demote to Learner'}
        destructive={!nextRole}
        onConfirm={handleToggleRole}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}