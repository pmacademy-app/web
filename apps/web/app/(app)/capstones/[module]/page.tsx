'use client'

import React, { useState, useEffect, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  BookOpen,
  Send,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Lock,
  ExternalLink,
  Eye,
} from 'lucide-react'
import { getCapstoneDefinition } from '@/config/capstones'
import { validateCapstoneSubmission, type CapstoneStatus } from '@/lib/capstones'
import { useCapstoneAutosave } from '@/hooks/useCapstoneAutosave'
import { RichEditor } from '@/components/capstones/RichEditor'
import { CapstoneReflection } from '@/components/capstones/CapstoneReflection'
import { SubmitConfirmationModal } from '@/components/capstones/SubmitConfirmationModal'
import {
  trackCapstoneSubmitted,
  trackPortfolioArtifactCreated,
  trackPortfolioVisitedFromCapstone,
} from '@/lib/analytics'

interface PageProps {
  params: Promise<{ module: string }>
}

export default function CapstoneWorkspacePage({ params }: PageProps) {
  const { module: moduleSlug } = use(params)
  const capstoneDef = getCapstoneDefinition(moduleSlug)

  // Local component states
  const [submissionStatus, setSubmissionStatus] = useState<CapstoneStatus>('unlocked')
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [reflectionContent, setReflectionContent] = useState<string>('')
  const [reflectionIsPublic, setReflectionIsPublic] = useState<boolean>(false)
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null)
  const [isInstructionsCollapsed, setIsInstructionsCollapsed] = useState<boolean>(false)

  // Learner profile info for portfolio routing & privacy surface
  const [userProfile, setUserProfile] = useState<{
    username: string
    isPortfolioPublic: boolean
  } | null>(null)

  // Initial fetched draft content
  const [serverInitialContent, setServerInitialContent] = useState<string>('')

  // Fetch initial submission & reflection state on mount
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/capstones/${moduleSlug}`)
        if (res.ok) {
          const data = await res.json()
          if (data.submission) {
            setServerInitialContent(data.submission.content || '')
            setSubmissionStatus(data.status || 'unlocked')
            setSubmittedAt(data.submission.submitted_at || null)
          } else {
            setServerInitialContent(capstoneDef?.starterTemplate || '')
            setSubmissionStatus(data.status || 'locked')
          }
          if (data.reflection) {
            setReflectionContent(data.reflection.content || '')
            setReflectionIsPublic(Boolean(data.reflection.is_public))
          }
          if (data.userProfile) {
            setUserProfile(data.userProfile)
          }
        }
      } catch (err) {
        console.error('Error loading capstone data:', err)
      }
    }
    if (capstoneDef) {
      loadData()
    }
  }, [moduleSlug, capstoneDef])

  const isLocked = submissionStatus === 'submitted' || submissionStatus === 'reviewed'

  // Debounced Autosave Hook
  const {
    content,
    setContent,
    status: autosaveStatus,
    saveNow,
  } = useCapstoneAutosave({
    moduleSlug,
    initialContent: serverInitialContent,
    isLocked,
  })

  // Calculate live validation for requirements
  const validation = validateCapstoneSubmission(moduleSlug, content)

  // Handle Submission Confirm (Phase 4 Direct-to-Portfolio)
  const handleConfirmSubmit = async (isPublic: boolean) => {
    try {
      setIsSubmitting(true)
      await saveNow()

      const res = await fetch(`/api/capstones/${moduleSlug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          reflectionContent,
          reflectionIsPublic,
          isPublic,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed.')
      }

      setSubmissionStatus('submitted')
      setSubmittedAt(data.submission?.submitted_at || new Date().toISOString())
      setSubmitSuccessMsg(data.message || 'Capstone submitted successfully! 150 XP awarded.')
      setIsSubmitModalOpen(false)

      // Track Phase 4 analytics events safely (non-blocking, zero-PII)
      try {
        trackCapstoneSubmitted(moduleSlug, capstoneDef?.moduleTitle)
        trackPortfolioArtifactCreated(moduleSlug, isPublic)
      } catch (analyticsErr) {
        console.warn('Analytics tracking error:', analyticsErr)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit capstone.'
      alert(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!capstoneDef) {
    return (
      <div className="container mx-auto px-4 py-16 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
        <h1 className="text-xl font-bold font-serif">Module Capstone Not Found</h1>
        <p className="text-xs text-muted-foreground">Invalid module slug specified.</p>
        <Link href="/capstones" className="inline-flex items-center gap-2 text-xs font-bold text-primary">
          <ArrowLeft className="w-4 h-4" /> Return to Capstones Overview
        </Link>
      </div>
    )
  }

  if (submissionStatus === 'locked') {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center mx-auto text-muted-foreground shadow-sm">
          <Lock className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
            Module {String(capstoneDef.moduleNumber).padStart(2, '0')} Capstone
          </span>
          <h1 className="text-2xl font-bold font-serif text-foreground">
            {capstoneDef.title} is Locked
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            To unlock this capstone workspace and submit your deliverable, you must complete at least 8 lessons in {capstoneDef.moduleTitle}.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/capstones"
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-border bg-card text-foreground hover:bg-secondary transition-colors"
          >
            All Capstones
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Continue Learning
          </Link>
        </div>
      </div>
    )
  }

  const formattedSubmittedDate = submittedAt ? new Date(submittedAt).toLocaleDateString() : ''

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/capstones"
            className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label="Back to capstones"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                Module {String(capstoneDef.moduleNumber).padStart(2, '0')} Capstone
              </span>
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> {capstoneDef.estimatedHours}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-serif text-foreground mt-0.5">
              {capstoneDef.title}
            </h1>
          </div>
        </div>

        {/* Right Status & Submit CTA */}
        <div className="flex items-center gap-3">
          {/* Autosave Status Indicator */}
          {!isLocked && (
            <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
              {autosaveStatus === 'saving' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span className="text-amber-500 font-semibold">Saving...</span>
                </>
              )}
              {autosaveStatus === 'saved' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-emerald-500 font-semibold">Draft Saved</span>
                </>
              )}
              {autosaveStatus === 'error' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-red-500 font-semibold">Saved Locally</span>
                </>
              )}
            </div>
          )}

          {isLocked ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-bold border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
              <span>Submitted{formattedSubmittedDate ? ` on ${formattedSubmittedDate}` : ''}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsSubmitModalOpen(true)}
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-sm transition-all flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Submit Deliverable (+150 XP)</span>
            </button>
          )}
        </div>
      </div>

      {/* Post-Submission Portfolio Showcase Card (Phase 4 Direct-to-Portfolio) */}
      {isLocked && (
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-background p-6 md:p-7 shadow-xs space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-500 shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base md:text-lg font-bold font-serif text-foreground">
                    Your capstone is now part of your portfolio!
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                    +150 XP Awarded
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {userProfile?.isPortfolioPublic !== false ? (
                    <>
                      Live and showcased on your public portfolio at{' '}
                      <span className="font-mono text-foreground font-semibold">
                        /p/{userProfile?.username || 'you'}#capstones
                      </span>
                    </>
                  ) : (
                    <>
                      Saved securely to your personal portfolio. Your profile is currently set to Private in Settings.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1 sm:pt-0">
              {userProfile?.username && (
                <Link
                  href={`/p/${userProfile.username}#capstones`}
                  onClick={() => trackPortfolioVisitedFromCapstone(moduleSlug)}
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-xs flex items-center gap-2"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Portfolio</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </Link>
              )}
              <Link
                href="/dashboard"
                className="px-4 py-2.5 rounded-xl border border-border bg-card text-foreground font-semibold text-xs hover:bg-secondary transition-colors flex items-center gap-1.5"
              >
                <span>Continue Learning</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Alert Banner (Temporary feedback if freshly submitted) */}
      {submitSuccessMsg && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-center justify-between text-xs text-emerald-500 animate-in fade-in duration-300">
          <div className="flex items-center gap-2.5 font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{submitSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSubmitSuccessMsg(null)}
            className="text-xs underline hover:no-underline font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Collapsible Prompt & Instructions Panel */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsInstructionsCollapsed(!isInstructionsCollapsed)}
          className="w-full px-6 py-4 flex items-center justify-between bg-card hover:bg-secondary/30 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-serif text-foreground">
                Capstone Scenario & Submission Guidelines
              </h2>
              <p className="text-xs text-muted-foreground">{capstoneDef.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span>{isInstructionsCollapsed ? 'Expand Guidelines' : 'Collapse Guidelines'}</span>
            {isInstructionsCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </div>
        </button>

        {!isInstructionsCollapsed && (
          <div className="px-6 pb-6 border-t border-border/60 pt-4 space-y-5 text-xs text-foreground">
            {/* Scenario Description */}
            <div className="space-y-1.5">
              <h3 className="font-bold uppercase tracking-wider text-[11px] text-primary">
                Product Scenario Context
              </h3>
              <p className="text-muted-foreground leading-relaxed text-xs md:text-sm">
                {capstoneDef.scenario}
              </p>
            </div>

            {/* Grid: Instructions & Requirements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Instructions */}
              <div className="space-y-2">
                <h3 className="font-bold text-foreground text-xs flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-primary" /> Core Instructions
                </h3>
                <ul className="list-disc list-inside space-y-1.5 text-muted-foreground leading-relaxed">
                  {capstoneDef.instructions.map((inst, i) => (
                    <li key={i}>{inst}</li>
                  ))}
                </ul>
              </div>

              {/* Requirements Checklist */}
              <div className="space-y-2">
                <h3 className="font-bold text-foreground text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Submission Checklist
                </h3>
                <div className="space-y-2">
                  {capstoneDef.requirements.map((req) => (
                    <div
                      key={req.id}
                      className="p-2.5 rounded-lg border border-border/60 bg-background/60 space-y-0.5"
                    >
                      <span className="font-bold text-foreground block">{req.label}</span>
                      <span className="text-muted-foreground/80 text-[11px] leading-tight block">
                        {req.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Rich Text Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <label htmlFor="capstone-rich-editor" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Deliverable Workspace (Notion-Style Editor)
          </label>
          <span className="text-[11px] text-muted-foreground font-mono">
            {validation.wordCount} words (Min {capstoneDef.minWordCount})
          </span>
        </div>

        <RichEditor
          value={content}
          onChange={setContent}
          isLocked={isLocked}
          minWordCount={capstoneDef.minWordCount}
        />
      </div>

      {/* Reflection Component Integration */}
      <CapstoneReflection
        content={reflectionContent}
        isPublic={reflectionIsPublic}
        onChangeContent={setReflectionContent}
        onChangeIsPublic={setReflectionIsPublic}
        isLocked={isLocked}
      />

      {/* Submit Confirmation Modal (Phase 4 Direct-to-Portfolio Surface) */}
      <SubmitConfirmationModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onConfirm={handleConfirmSubmit}
        validation={validation}
        isSubmitting={isSubmitting}
        moduleTitle={capstoneDef.moduleTitle}
        userProfile={userProfile}
      />
    </div>
  )
}
