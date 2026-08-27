'use client'

/**
 * LessonFeedbackWidget — Phase 6: Lesson Feedback & Rating Loop
 *
 * Provides a learner-facing 1–5 clarity rating with optional clarity tags
 * and comment. Positioned at the end of the lesson content without obstructing
 * completion or navigation.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Star, CheckCircle, AlertCircle, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import { trackLessonFeedbackSubmitted } from '@/lib/analytics'

interface LessonFeedbackWidgetProps {
  lessonId: string
  className?: string
}

interface TagOption {
  id: string
  label: string
  category: 'positive' | 'critical'
}

const TAG_OPTIONS: TagOption[] = [
  { id: 'great_breakdown', label: '✨ Great Breakdown', category: 'positive' },
  { id: 'clear_and_actionable', label: '🎯 Clear & Actionable', category: 'positive' },
  { id: 'too_technical', label: '🧠 Too Technical', category: 'critical' },
  { id: 'confusing_example', label: '❓ Confusing Example', category: 'critical' },
  { id: 'pacing_too_fast', label: '⚡ Pacing Too Fast', category: 'critical' },
  { id: 'outdated', label: '⏳ Outdated Info', category: 'critical' },
]

export function LessonFeedbackWidget({ lessonId, className = '' }: LessonFeedbackWidgetProps) {
  const [rating, setRating] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [showCommentBox, setShowCommentBox] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isUpdate, setIsUpdate] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)

  // Fetch existing feedback on mount
  useEffect(() => {
    let isMounted = true
    async function loadExisting() {
      try {
        const res = await fetch(`/api/v2/lessons/${encodeURIComponent(lessonId)}/feedback`)
        if (!res.ok) return
        const data = await res.json()
        if (isMounted && data?.feedback) {
          setRating(data.feedback.rating)
          setSelectedTags(Array.isArray(data.feedback.tags) ? data.feedback.tags : [])
          if (data.feedback.comment) {
            setComment(data.feedback.comment)
            setShowCommentBox(true)
          }
          setSubmitted(true)
          setIsUpdate(true)
        }
      } catch (err) {
        console.warn('[LessonFeedbackWidget] Failed to load existing feedback:', err)
      } finally {
        if (isMounted) setInitialLoading(false)
      }
    }
    loadExisting()
    return () => {
      isMounted = false
    }
  }, [lessonId])

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    )
  }

  const handleSubmit = useCallback(async () => {
    if (!rating) {
      setErrorMsg('Please select a clarity rating from 1 to 5 stars.')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/v2/lessons/${encodeURIComponent(lessonId)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          tags: selectedTags,
          comment: comment.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit lesson feedback.')
      }

      setSubmitted(true)
      setIsUpdate(true)

      // Track analytics with strictly ZERO PII
      trackLessonFeedbackSubmitted(
        lessonId,
        rating,
        selectedTags.length,
        Boolean(comment.trim())
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting feedback.'
      setErrorMsg(msg)
    } finally {
      setSubmitting(false)
    }
  }, [lessonId, rating, selectedTags, comment])

  if (initialLoading) {
    return null
  }

  return (
    <div
      aria-label="Lesson Clarity Feedback"
      className={`rounded-2xl border border-border/80 bg-card/60 p-5 md:p-6 transition-all space-y-4 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div>
          <h3 className="text-xs md:text-sm font-bold font-serif text-foreground flex items-center gap-2">
            <span>How clear was this lesson?</span>
            {submitted && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <CheckCircle className="w-3 h-3" /> Feedback Recorded
              </span>
            )}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Help improve curriculum clarity. Your rating is shared anonymously with instructors.
          </p>
        </div>

        {/* 1-5 Star Rating Controls */}
        <div
          role="radiogroup"
          aria-label="Rate lesson clarity from 1 to 5 stars"
          className="flex items-center gap-1.5 pt-1 sm:pt-0"
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const active = (hoverRating ?? rating ?? 0) >= star
            const isSelected = rating === star

            return (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Rate ${star} out of 5 stars`}
                onClick={() => {
                  setRating(star)
                  if (submitted) setSubmitted(false) // Allow changing and re-submitting
                }}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                className="p-1 rounded-lg hover:bg-secondary/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Star
                  className={`w-5 h-5 transition-transform ${
                    active
                      ? 'fill-amber-400 text-amber-400 scale-110'
                      : 'text-muted-foreground/40 hover:text-muted-foreground'
                  }`}
                />
              </button>
            )
          })}
          {rating && (
            <span className="text-xs font-mono font-bold text-foreground pl-1.5">
              {rating}/5
            </span>
          )}
        </div>
      </div>

      {/* Expanded options shown when a rating is selected */}
      {rating && !submitted && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Clarity Tag Chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Optional: What stood out most?
            </span>
            <div className="flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map((tag) => {
                const isSelected = selectedTags.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    aria-pressed={isSelected}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-all ${
                      isSelected
                        ? tag.category === 'positive'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                        : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {tag.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Optional Short Comment Collapsible */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowCommentBox((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{showCommentBox ? 'Hide note' : 'Add an optional note or suggestion'}</span>
              {showCommentBox ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showCommentBox && (
              <div className="space-y-1 animate-in fade-in duration-150">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 500))}
                  placeholder="What could make this explanation or example clearer?"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
                <div className="text-right text-[10px] text-muted-foreground font-mono">
                  {comment.length}/500
                </div>
              </div>
            )}
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-between pt-1">
            {errorMsg ? (
              <div className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errorMsg}</span>
              </div>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="ml-auto px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isUpdate ? 'Update Feedback' : 'Submit Feedback'}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Submitted State Summary Card */}
      {submitted && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-2">
            <span>You rated this lesson {rating}/5 stars.</span>
            {selectedTags.length > 0 && (
              <span className="text-[11px] font-mono text-muted-foreground/80">
                ({selectedTags.length} tags selected)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="text-xs text-primary hover:underline font-medium"
          >
            Change rating
          </button>
        </div>
      )}
    </div>
  )
}
