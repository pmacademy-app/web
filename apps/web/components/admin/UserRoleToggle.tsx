'use client'

import React, { useState } from 'react'
import { Shield, Loader2, Check } from 'lucide-react'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'

export interface UserRoleToggleProps {
  userId: string
  initialIsAdmin: boolean
  userEmail: string
}

export function UserRoleToggle({ userId, initialIsAdmin, userEmail }: UserRoleToggleProps) {
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleToggleRole = async () => {
    const nextRole = !isAdmin
    const actionLabel = nextRole ? 'promote to ADMIN' : 'demote to LEARNER'
    if (!confirm(`Are you sure you want to ${actionLabel} for user ${userEmail}?`)) {
      return
    }

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
        setTimeout(() => setSuccess(false), 3000)
      } else {
        alert(data.error || 'Failed to update user role.')
      }
    } catch {
      alert('Network error updating user role.')
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
        onClick={handleToggleRole}
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
    </div>
  )
}
