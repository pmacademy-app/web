'use client'

import { useState } from 'react'
import { ROLE_OPTIONS, type RoleOption } from '@/types'

export default function WaitlistPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [currentRole, setCurrentRole] = useState<RoleOption>('Aspiring Product Manager')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, current_role: currentRole }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        setMessage(data.message || 'You are on the waitlist!')
        setName('')
        setEmail('')
      } else {
        setStatus('error')
        setMessage(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again in a moment.')
    }
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold font-serif text-foreground mb-2">
          Join the PM Academy Waitlist
        </h1>
        <p className="text-sm text-muted-foreground">
          90 lessons. 9 modules. Free forever. Get early launch updates and preview access.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {status === 'success' ? (
          <div className="text-center py-6 space-y-4">
            <div className="text-4xl">🎉</div>
            <h2 className="text-xl font-bold text-foreground">You&apos;re on the list!</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-xs font-semibold uppercase text-foreground/80 mb-1">
                Current Role / Position
              </label>
              <select
                id="role"
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value as RoleOption)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {status === 'error' && (
              <p className="text-xs text-destructive font-medium">{message}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Joining...' : 'Join Waitlist →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
