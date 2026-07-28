'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, Sparkles, AlertCircle, FileText } from 'lucide-react'
import MarkdownRenderer from '@/components/ui/MarkdownRenderer'

interface ReflectionFormProps {
  lessonSlug: string
  prompt: string
  onComplete: () => void
}

export default function ReflectionForm({
  lessonSlug,
  prompt,
  onComplete,
}: ReflectionFormProps) {
  const [content, setContent] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successXp, setSuccessXp] = useState<number | null>(null)

  // 1. Fetch existing reflection on mount
  useEffect(() => {
    async function loadReflection() {
      try {
        setLoading(true)
        const res = await fetch(`/api/reflections?lesson_slug=${lessonSlug}`)
        if (!res.ok) throw new Error('Failed to load reflection')
        const data = await res.json()
        if (data) {
          setContent(data.content || '')
          setIsPublic(data.is_public || false)
        }
      } catch (err) {
        console.error('[reflection-form] Error loading existing reflection:', err)
      } finally {
        setLoading(false)
      }
    }
    loadReflection()
  }, [lessonSlug])

  // 2. Handle reflection submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || saving) return

    setError(null)
    setSaving(true)
    setSuccessXp(null)

    try {
      const res = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_slug: lessonSlug,
          content: content.trim(),
          is_public: isPublic,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save reflection')
      }

      setSuccessXp(data.xpEarned ?? 0)
      
      // Delay transition slightly to allow XP animation to settle
      setTimeout(() => {
        onComplete()
      }, 2000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Something went wrong saving your reflection.'
      setError(errorMsg)
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading reflection prompt...</p>
      </div>
    )
  }

  if (successXp !== null) {
    return (
      <div className="max-w-md mx-auto text-center py-10 space-y-6 animate-scale-up">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-emerald-500 blur opacity-45 animate-pulse" />
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500 text-white shadow-lg">
              <CheckCircle2 className="h-8 w-8 animate-scale-up" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold font-serif text-foreground">Reflection Saved!</h2>
          <p className="text-muted-foreground text-sm">
            Your insights have been recorded in your private learning journal.
          </p>
        </div>

        {successXp > 0 ? (
          <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-sm font-bold animate-bounce">
            <Sparkles className="h-4 w-4" />
            <span>+{successXp} XP Earned</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
            Journal Updated
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-start gap-3 border-b border-border pb-4">
        <FileText className="h-6 w-6 text-primary shrink-0 mt-0.5" />
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Reflection Exercise
          </span>
          <h3 className="text-base font-bold text-foreground mt-1">
            Apply the theory to your real-world observations or plans.
          </h3>
        </div>
      </div>

      {/* Prompt Card */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
        <MarkdownRenderer content={prompt} className="text-sm font-medium text-foreground/90 leading-relaxed font-sans italic" />
      </div>

      {/* Textarea */}
      <div className="space-y-2">
        <label htmlFor="reflection-content" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Your Response
        </label>
        <textarea
          id="reflection-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your thoughts here..."
          rows={6}
          disabled={saving}
          className="w-full rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
        />
      </div>

      {/* Public Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="space-y-1">
          <label htmlFor="public-toggle" className="text-sm font-bold text-foreground cursor-pointer">
            Make public on portfolio export
          </label>
          <p className="text-xs text-muted-foreground max-w-md">
            If enabled, this reflection will be showcased on your public resume/portfolio link for recruiters.
          </p>
        </div>

        {/* Custom Toggle Switch */}
        <button
          type="button"
          id="public-toggle"
          role="switch"
          aria-checked={isPublic}
          onClick={() => setIsPublic(!isPublic)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
            isPublic ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              isPublic ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-destructive/10 text-destructive border border-destructive/20 animate-shake">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Button Controls */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onComplete}
          disabled={saving}
          className="font-medium"
        >
          Skip Reflection
        </Button>
        <Button
          type="submit"
          disabled={!content.trim() || saving}
          className="font-medium px-6"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            'Save Reflection (+15 XP)'
          )}
        </Button>
      </div>
    </form>
  )
}
