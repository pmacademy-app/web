'use client'

import React, { useState, useEffect } from 'react'
import { MessageSquare, Star, X, Send, CheckCircle2, Loader2, Award } from 'lucide-react'

interface ContextualFeedbackModalProps {
  isOpen: boolean
  promptKey: string
  title?: string
  description?: string
  sourceEvent?: string
  onClose: () => void
}

export function ContextualFeedbackModal({
  isOpen,
  promptKey,
  title = 'Help Us Improve PM Academy',
  description = 'Your thoughts help shape the future of our product management curriculum.',
  sourceEvent = 'usage_1hr',
  onClose,
}: ContextualFeedbackModalProps) {
  const [feedbackType, setFeedbackType] = useState<'private' | 'public'>('private')
  const [content, setContent] = useState('')
  const [rating, setRating] = useState(5)
  const [authorName, setAuthorName] = useState('')
  const [headline, setHeadline] = useState('')
  const [authorRole, setAuthorRole] = useState('')
  const [allowPublicFeature, setAllowPublicFeature] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleDismiss = async () => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', promptKey }),
      })
    } catch {
      // Ignored
    }
    onClose()
  }

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (feedbackType === 'public') {
        if (!authorName || !authorName.trim()) {
          setError('Please provide your name for the public review.')
          setLoading(false)
          return
        }

        if (!allowPublicFeature) {
          setError('Please check the opt-in box to submit a public homepage review.')
          setLoading(false)
          return
        }

        const res = await fetch('/api/testimonials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorName: authorName.trim(),
            content,
            rating,
            headline,
            authorRole: authorRole || 'PM Academy Learner',
            allowPublicFeature,
          }),
        })

        const data = await res.json()
        if (res.ok && data.success) {
          setSuccess(true)
          setTimeout(() => onClose(), 1800)
        } else {
          setError(data.error || 'Failed to submit review.')
        }
      } else {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            category: 'curriculum',
            sourceEvent,
            rating,
            promptKey,
          }),
        })

        const data = await res.json()
        if (res.ok && data.success) {
          setSuccess(true)
          setTimeout(() => onClose(), 1800)
        } else {
          setError(data.error || 'Failed to submit feedback.')
        }
      }
    } catch {
      setError('An unexpected network error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="w-full max-w-lg bg-background border border-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 relative">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss feedback prompt"
          className="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Thank You!</h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {feedbackType === 'public'
                ? 'Your review has been submitted for moderation. Thank you for supporting PM Academy!'
                : 'Your feedback has been saved privately for our curriculum team.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 id="feedback-modal-title" className="text-base font-bold text-foreground font-serif">
                  {title}
                </h3>
                <p className="text-xs text-muted-foreground leading-snug">{description}</p>
              </div>
            </div>

            {/* Type selector: Private Feedback vs Public Review */}
            <div className="flex rounded-xl bg-secondary/60 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFeedbackType('private')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                  feedbackType === 'private'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Private Feedback
              </button>
              <button
                type="button"
                onClick={() => setFeedbackType('public')}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  feedbackType === 'public'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                Public Review
              </button>
            </div>

            {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold">{error}</div>}

            {/* Rating Stars */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground">Your Rating</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 cursor-pointer focus:outline-none"
                  >
                    <Star
                      className={`w-5 h-5 transition-colors ${
                        star <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {feedbackType === 'public' && (
              <>
                <div className="space-y-1">
                  <label htmlFor="review-name" className="text-xs font-bold text-foreground">
                    Your Full Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="review-name"
                    type="text"
                    required={feedbackType === 'public'}
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="review-headline" className="text-xs font-bold text-foreground">
                    Headline
                  </label>
                  <input
                    id="review-headline"
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Best structured PM curriculum I've taken"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="review-role" className="text-xs font-bold text-foreground">
                    Your Title / Role
                  </label>
                  <input
                    id="review-role"
                    type="text"
                    value={authorRole}
                    onChange={(e) => setAuthorRole(e.target.value)}
                    placeholder="e.g. Associate PM at Tech Startup"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </>
            )}

            <div className="space-y-1">
              <label htmlFor="feedback-content" className="text-xs font-bold text-foreground">
                {feedbackType === 'public' ? 'Your Public Review' : 'Your Private Feedback'} <span className="text-destructive">*</span>
              </label>
              <textarea
                id="feedback-content"
                required
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  feedbackType === 'public'
                    ? 'Share your experience with PM Academy...'
                    : 'What worked well? What could be improved?'
                }
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
              />
            </div>

            {feedbackType === 'public' && (
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={allowPublicFeature}
                  onChange={(e) => setAllowPublicFeature(e.target.checked)}
                  className="mt-0.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
                <span className="text-xs text-muted-foreground leading-snug">
                  I explicitly authorize PM Academy to feature this review publicly on the homepage after review.
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Maybe Later
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{feedbackType === 'public' ? 'Submit Review' : 'Submit Feedback'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
