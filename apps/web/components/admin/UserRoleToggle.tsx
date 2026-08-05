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
            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30'
        }`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
        ) : success ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Shield className="w-3 h-3 text-amber-400" />
        )}
        <span>{isAdmin ? 'Demote to Learner' : 'Make Admin'}</span>
      </button>
    </div>
  )
}
