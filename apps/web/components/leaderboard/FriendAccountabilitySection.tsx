'use client'

import React, { useState } from 'react'
import { Shield, UserPlus, Trash2, Loader2, Check, AlertCircle } from 'lucide-react'
import type { LeaderboardEntry } from '@/lib/leaderboard'

interface FriendAccountabilitySectionProps {
  initialFriends: LeaderboardEntry[]
  currentUserId?: string
}

export function FriendAccountabilitySection({
  initialFriends,
  currentUserId,
}: FriendAccountabilitySectionProps) {
  const [friends, setFriends] = useState<LeaderboardEntry[]>(initialFriends)
  const [usernameInput, setUsernameInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanUsername = usernameInput.trim().replace(/^@/, '')
    if (!cleanUsername) return

    setLoading(true)
    setFeedback(null)

    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setFeedback({
          type: 'error',
          message: data.error || 'Failed to add friend. Please check the username.',
        })
        return
      }

      setFeedback({
        type: 'success',
        message: data.message || `Added @${cleanUsername} to your study friends!`,
      })
      setUsernameInput('')

      // Refresh friends list
      const listRes = await fetch('/api/friends')
      const listData = await listRes.json()
      if (listData.success && Array.isArray(listData.friendsEntries)) {
        setFriends(listData.friendsEntries)
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Network error while adding friend. Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    setRemovingId(friendId)
    setFeedback(null)

    try {
      const res = await fetch(`/api/friends?friendId=${encodeURIComponent(friendId)}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setFeedback({
          type: 'error',
          message: data.error || 'Failed to remove friend.',
        })
        return
      }

      setFriends((prev) => prev.filter((f) => f.userId !== friendId))
      setFeedback({
        type: 'success',
        message: `Removed ${friendName} from study friends.`,
      })
    } catch {
      setFeedback({
        type: 'error',
        message: 'Network error while removing friend.',
      })
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2 text-foreground font-bold font-serif text-base">
          <Shield className="w-5 h-5 text-emerald-500" /> Friend Accountability
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {friends.length} Friends
        </span>
      </div>

      {/* Add Friend Form */}
      <form onSubmit={handleAddFriend} className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">
              @
            </span>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="friend_username"
              className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !usernameInput.trim()}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors shrink-0"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UserPlus className="w-3.5 h-3.5" />
            )}
            Add Friend
          </button>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-1.5 text-xs p-2 rounded-lg ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </form>

      {/* Friends List */}
      {friends.length === 0 ? (
        <div className="text-center py-6 space-y-2">
          <p className="text-xs text-muted-foreground italic">
            You haven&apos;t added any study friends yet. Add friends using their handle to compare weekly consistency!
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {friends.map((f) => {
            const isSelf = currentUserId && f.userId === currentUserId
            const displayName = f.name || `@${f.username || 'learner'}`

            return (
              <div
                key={f.userId}
                className="p-3 rounded-xl border border-border/60 bg-card/40 flex items-center justify-between text-xs transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-foreground font-mono">#{f.rank}</span>
                  <span className="font-semibold text-foreground truncate">
                    {displayName}
                  </span>
                  {isSelf && (
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                      You
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-emerald-500 font-bold">
                    {f.daysStudied} / 7 Days
                  </span>

                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => handleRemoveFriend(f.userId, displayName)}
                      disabled={removingId === f.userId}
                      className="p-1 text-muted-foreground hover:text-rose-500 transition-colors rounded disabled:opacity-50"
                      title={`Remove ${displayName}`}
                    >
                      {removingId === f.userId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
