'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Search, X, User, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectedUser {
  id: string
  name?: string | null
  email?: string | null
  username?: string | null
}

interface AdminUserMultiSelectPickerProps {
  selectedUsers: SelectedUser[]
  onChange: (users: SelectedUser[]) => void
  singleSelect?: boolean
  placeholder?: string
}

export function AdminUserMultiSelectPicker({
  selectedUsers,
  onChange,
  singleSelect = false,
  placeholder = 'Search by name, email, or username...',
}: AdminUserMultiSelectPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SelectedUser[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(query.trim())}&limit=8`)
        const data = await res.json()
        if (data.success && Array.isArray(data.users)) {
          setResults(
            data.users.map((u: { id: string; fullName?: string; email?: string; username?: string }) => ({
              id: u.id,
              name: u.fullName || null,
              email: u.email || null,
              username: u.username || null,
            }))
          )
        }
      } catch (err) {
        console.error('Error fetching users for picker:', err)
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [query])

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (user: SelectedUser) => {
    if (singleSelect) {
      onChange([user])
      setIsOpen(false)
      setQuery('')
    } else {
      const exists = selectedUsers.some((u) => u.id === user.id)
      if (exists) {
        onChange(selectedUsers.filter((u) => u.id !== user.id))
      } else {
        onChange([...selectedUsers, user])
      }
    }
  }

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(selectedUsers.filter((u) => u.id !== id))
  }

  return (
    <div ref={containerRef} className="relative space-y-2">
      {/* Selected chips (multi-select mode) */}
      {!singleSelect && selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-admin-surface rounded-lg border border-admin-border max-h-28 overflow-y-auto">
          {selectedUsers.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-admin-accent-soft text-admin-accent text-xs font-medium border border-admin-accent/20"
            >
              <User className="w-3 h-3 opacity-70" />
              <span className="truncate max-w-[140px]">{user.name || user.email || user.id.slice(0, 8)}</span>
              <button
                type="button"
                onClick={(e) => handleRemove(user.id, e)}
                className="hover:text-admin-danger ml-0.5 rounded p-0.5 cursor-pointer transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-admin-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={singleSelect && selectedUsers.length > 0 ? (selectedUsers[0].name || selectedUsers[0].email || '1 user selected') : placeholder}
          className="w-full pl-8.5 pr-8 py-2 text-xs bg-admin-surface-raised border border-admin-border rounded-lg text-admin-fg placeholder:text-admin-fg-subtle focus:outline-none focus:border-admin-accent font-sans"
        />
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-admin-accent animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-admin-fg-muted hover:text-admin-fg absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Dropdown Menu */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-admin-border bg-admin-surface shadow-2xl max-h-56 overflow-y-auto divide-y divide-admin-border/50">
          {results.length === 0 && !loading ? (
            <div className="p-3 text-center text-xs text-admin-fg-muted">No learners found matching &ldquo;{query}&rdquo;</div>
          ) : (
            results.map((user) => {
              const isSelected = selectedUsers.some((u) => u.id === user.id)
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleSelect(user)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-admin-surface-raised transition-colors cursor-pointer',
                    isSelected && 'bg-admin-accent-soft/40'
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-admin-fg truncate">{user.name || 'Unnamed Learner'}</div>
                    <div className="text-[10px] text-admin-fg-muted font-mono truncate">
                      {user.email} {user.username ? `(@${user.username})` : ''}
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-admin-accent shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
