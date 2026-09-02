'use client'

import React, { useState, useEffect } from 'react'
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Fetch session data to pre-fill user name/email if logged in
  useEffect(() => {
    let mounted = true
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/session')
        const data = await res.json()
        if (mounted && data.user) {
          if (data.user.email) setEmail(data.user.email)
          if (data.user.full_name) setName(data.user.full_name)
        }
      } catch {
        // Ignored for anonymous visitors
      }
    }
    void checkSession()
    return () => {
      mounted = false
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, category, message }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setSuccess(true)
        setMessage('')
        setSubject('')
      } else {
        setError(data.error || 'Failed to submit contact message. Please try again.')
      }
    } catch (err) {
      console.error('[ContactForm] Error submitting contact message:', err)
      setError('An unexpected network error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-8 rounded-2xl border border-border bg-card space-y-5 shadow-xs">
      <h3 className="text-xl font-bold font-serif text-foreground">Send us a message</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Tell us what you need help with and we&apos;ll respond at the email address you provide.
      </p>

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-start gap-3 text-xs font-semibold">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Message Sent Successfully!</p>
            <p className="text-muted-foreground mt-0.5 font-normal">
              Thank you for reaching out. We received your message and will respond to <strong>{email}</strong> shortly.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-3 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Submission Error</p>
            <p className="mt-0.5 font-normal">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="contact-name" className="text-xs font-bold text-foreground">
            Your Name <span className="text-destructive">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-email" className="text-xs font-bold text-foreground">
            Your Email <span className="text-destructive">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="contact-subject" className="text-xs font-bold text-foreground">
            Subject <span className="text-destructive">*</span>
          </label>
          <input
            id="contact-subject"
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Question regarding Module 4 Capstone"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-category" className="text-xs font-bold text-foreground">
            Topic Category
          </label>
          <select
            id="contact-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
          >
            <option value="general">General Inquiry</option>
            <option value="curriculum">Curriculum / Content</option>
            <option value="bug">Technical Issue / Bug</option>
            <option value="partnership">Partnership / Press</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-message" className="text-xs font-bold text-foreground">
          Message <span className="text-destructive">*</span>
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help you?"
          className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 leading-relaxed"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Sending Message...</span>
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            <span>Send Message</span>
          </>
        )}
      </button>
    </form>
  )
}
