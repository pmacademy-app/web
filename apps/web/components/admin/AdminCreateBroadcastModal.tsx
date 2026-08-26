'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Send,
  Users,
  Eye,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Filter,
  Check,
} from 'lucide-react'
import { AdminDatePicker } from './AdminDatePicker'
import type { AdminUserFilters } from '@/lib/admin/types'

interface AdminCreateBroadcastModalProps {
  onClose: () => void
  onCreated: () => void
}

const TEMPLATE_OPTIONS = [
  { key: 'inactive.resume_learning', label: 'Re-engagement: Resume Learning', defaultSubject: 'You left something unfinished' },
  { key: 'admin.direct_message', label: 'Admin Direct Message / Announcement', defaultSubject: 'A message from Prodily' },
  { key: 'auth.welcome', label: 'Welcome to Prodily', defaultSubject: 'Welcome to Prodily!' },
  { key: 'learning.weekly_recap', label: 'Weekly Learning Recap', defaultSubject: 'Your Week in Prodily' },
  { key: 'learning.daily_reminder', label: 'Daily Streak Reminder', defaultSubject: 'Keep your learning streak alive on Prodily!' },
  { key: 'learning.module_complete', label: 'Module Completion', defaultSubject: 'Module Complete: {{moduleName}}!' },
  { key: 'achievement.badge_earned', label: 'Badge Unlocked', defaultSubject: 'New Badge Unlocked: {{badgeName}}!' },
  { key: 'achievement.certificate', label: 'Certificate Earned', defaultSubject: 'Your Prodily Certificate is Ready!' },
]

const EXPERIENCE_OPTIONS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'learning', label: 'Learning PM' },
  { id: 'working', label: 'Working in Product' },
  { id: 'experienced', label: 'Experienced PM' },
]

const GOAL_OPTIONS = [
  { id: 'become_pm', label: 'Become a PM' },
  { id: 'transition_pm', label: 'Transition into PM' },
  { id: 'grow_career', label: 'Grow in PM Career' },
  { id: 'build_skills', label: 'Build Practical Skills' },
  { id: 'explore_pm', label: 'Explore PM' },
]

const TOPIC_OPTIONS = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'user_research', label: 'User Research' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'roadmapping', label: 'Roadmapping' },
  { id: 'prioritization', label: 'Prioritization' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'prds', label: 'PRDs' },
  { id: 'agile', label: 'Agile' },
  { id: 'stakeholders', label: 'Stakeholders' },
  { id: 'launch', label: 'Launch' },
]

const PREFERENCE_OPTIONS = [
  { id: 'structured', label: 'Structured learning' },
  { id: 'hands_on', label: 'Hands-on practice' },
  { id: 'case_studies', label: 'Case studies' },
]

export function AdminCreateBroadcastModal({ onClose, onCreated }: AdminCreateBroadcastModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1: Details
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [templateKey, setTemplateKey] = useState('inactive.resume_learning')
  const [subjectOverride, setSubjectOverride] = useState('')
  const [batchSize, setBatchSize] = useState<number>(100)

  // Step 2: Filters
  const [filters, setFilters] = useState<AdminUserFilters>({})

  // Step 3: Calculation & Sample
  const [calculating, setCalculating] = useState(false)
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [sampleUsers, setSampleUsers] = useState<Array<{ id: string; name: string | null; email: string; career_role: string | null; onboarding_completed: boolean }>>([])
  const [loadingSample, setLoadingSample] = useState(false)

  // Step 4: Schedule / Action
  const [sendTiming, setSendTiming] = useState<'immediate' | 'schedule' | 'draft'>('immediate')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('09:00')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Visual Email Preview State
  const [showEmailPreview, setShowEmailPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const loadEmailPreview = async () => {
    setLoadingPreview(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/admin/emails/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_key: templateKey,
          subject_override: subjectOverride || undefined,
        }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setPreviewHtml(json.data.html)
        setPreviewSubject(json.data.subject)
        setShowEmailPreview(true)
      } else {
        setErrorMsg(json.error || 'Failed to generate preview')
      }
    } catch {
      setErrorMsg('Failed to connect to preview service')
    } finally {
      setLoadingPreview(false)
    }
  }

  // Update recipient count when reaching step 3
  useEffect(() => {
    if (step === 3) {
      calculateRecipients()
    }
  }, [step])

  const calculateRecipients = async () => {
    setCalculating(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/admin/emails/broadcasts/recipient-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      })
      const json = await res.json()
      if (json.success) {
        setRecipientCount(json.count)
      } else {
        setErrorMsg(json.error || 'Failed to calculate recipients')
      }
    } catch {
      setErrorMsg('Network error while estimating recipients')
    } finally {
      setCalculating(false)
    }
  }

  const fetchSample = async () => {
    setLoadingSample(true)
    try {
      const res = await fetch('/api/admin/emails/broadcasts/recipient-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, limit: 20 }),
      })
      const json = await res.json()
      if (json.success) {
        setSampleUsers(json.sample)
      }
    } catch {
      // ignore
    } finally {
      setLoadingSample(false)
    }
  }

  const toggleArrayFilter = (field: 'experienceLevels' | 'goals' | 'topics', val: string) => {
    const curr = filters[field] || []
    const next = curr.includes(val) ? curr.filter((x) => x !== val) : [...curr, val]
    setFilters({ ...filters, [field]: next.length ? next : undefined })
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMsg('Broadcast name is required.')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)

    try {
      // 1. Create the broadcast
      const res = await fetch('/api/admin/emails/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          template_key: templateKey,
          subject_override: subjectOverride || undefined,
          batch_size: batchSize,
          recipient_filters: filters,
        }),
      })

      const json = await res.json()
      if (!json.success || !json.data?.id) {
        throw new Error(json.error || 'Failed to create broadcast')
      }

      const broadcastId = json.data.id

      // 2. Perform schedule or execute if requested
      if (sendTiming === 'immediate') {
        const execRes = await fetch(`/api/admin/emails/broadcasts/${broadcastId}/execute`, {
          method: 'POST',
        })
        const execJson = await execRes.json()
        if (!execJson.success) {
          console.warn('Initial batch execution warning:', execJson.error)
        }
      } else if (sendTiming === 'schedule') {
        const dt = new Date(`${scheduledDate}T${scheduledTime}:00`)
        await fetch(`/api/admin/emails/broadcasts/${broadcastId}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledAt: dt.toISOString() }),
        })
      }

      onCreated()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Broadcast creation failed')
    } finally {
      setSubmitting(false)
    }
  }

  const selectClass =
    'h-9 rounded-lg border border-admin-border bg-admin-surface px-3 text-xs text-admin-fg transition-colors outline-none focus-visible:border-admin-accent/60 focus-visible:ring-2 focus-visible:ring-admin-accent/30'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-admin-surface border border-admin-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-admin-border bg-admin-surface-raised/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-admin-accent-soft text-admin-accent border border-admin-accent/25">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-admin-fg">Create Email Broadcast</h2>
              <p className="text-xs text-admin-fg-muted">Target, preview, and send emails in safe automated batches.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-8 py-3 bg-admin-bg/50 border-b border-admin-border text-xs">
          {[
            { num: 1, label: 'Details' },
            { num: 2, label: 'Targeting Filters' },
            { num: 3, label: 'Audience Preview' },
            { num: 4, label: 'Review & Send' },
          ].map((s) => (
            <div
              key={s.num}
              className={`flex items-center gap-2 ${
                step === s.num
                  ? 'text-admin-accent font-bold'
                  : step > s.num
                  ? 'text-admin-success font-semibold'
                  : 'text-admin-fg-subtle'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  step === s.num
                    ? 'bg-admin-accent text-admin-accent-fg'
                    : step > s.num
                    ? 'bg-admin-success-soft text-admin-success border border-admin-success/30'
                    : 'bg-admin-surface-raised text-admin-fg-subtle'
                }`}
              >
                {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
              </div>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-admin-danger-soft border border-admin-danger/30 text-xs font-semibold text-admin-danger flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* STEP 1: Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-admin-fg">
                  Broadcast Name <span className="text-admin-danger">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Winter 2026 Re-engagement Batch 1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 rounded-lg border border-admin-border bg-admin-surface px-3 text-xs text-admin-fg outline-none focus:border-admin-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-admin-fg">Description (Internal Notes)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Target users who signed up in Jan but haven't started Module 1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-admin-border bg-admin-surface p-2.5 text-xs text-admin-fg outline-none focus:border-admin-accent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-admin-fg">
                    Email Template <span className="text-admin-danger">*</span>
                  </label>
                  <select
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                    className={cn(selectClass, 'w-full')}
                  >
                    {TEMPLATE_OPTIONS.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-admin-fg">Batch Size (Per Execution)</label>
                  <select
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className={cn(selectClass, 'w-full')}
                  >
                    <option value={50}>50 recipients / batch</option>
                    <option value={100}>100 recipients / batch (Recommended)</option>
                    <option value={200}>200 recipients / batch</option>
                    <option value={500}>500 recipients / batch</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-admin-fg">Subject Line Override (Optional)</label>
                  <button
                    type="button"
                    onClick={loadEmailPreview}
                    disabled={loadingPreview}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-admin-accent hover:underline cursor-pointer"
                  >
                    {loadingPreview ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    Preview Email Design
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Leave blank to use default template subject line"
                  value={subjectOverride}
                  onChange={(e) => setSubjectOverride(e.target.value)}
                  className="w-full h-9 rounded-lg border border-admin-border bg-admin-surface px-3 text-xs text-admin-fg outline-none focus:border-admin-accent"
                />
                <p className="text-[11px] text-admin-fg-muted">
                  Default: {TEMPLATE_OPTIONS.find((t) => t.key === templateKey)?.defaultSubject}
                </p>
              </div>

              {/* Visual Email Preview Modal */}
              {showEmailPreview && previewHtml && (
                <div className="p-4 rounded-xl border border-admin-border bg-admin-bg/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-admin-accent">Email Preview</span>
                      <p className="text-xs font-bold text-admin-fg">{previewSubject}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEmailPreview(false)}
                      className="text-xs text-admin-fg-muted hover:text-admin-fg"
                    >
                      Hide Preview
                    </button>
                  </div>
                  <div className="w-full h-80 rounded-lg border border-admin-border bg-white overflow-hidden shadow-inner">
                    <iframe
                      title="Email Preview"
                      srcDoc={previewHtml}
                      sandbox="allow-same-origin"
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Targeting Filters */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Account & Activity Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-admin-accent flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5" /> Account & Eligibility
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Verification</span>
                    <select
                      value={filters.verification || ''}
                      onChange={(e) => setFilters({ ...filters, verification: (e.target.value || undefined) as AdminUserFilters['verification'] })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">All Users</option>
                      <option value="verified">Verified Only</option>
                      <option value="unverified">Unverified Only</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Role</span>
                    <select
                      value={filters.role || ''}
                      onChange={(e) => setFilters({ ...filters, role: (e.target.value || undefined) as AdminUserFilters['role'] })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">All Roles</option>
                      <option value="learner">Learners Only</option>
                      <option value="admin">Admins Only</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Curriculum Progress</span>
                    <select
                      value={filters.progress || ''}
                      onChange={(e) => setFilters({ ...filters, progress: (e.target.value || undefined) as AdminUserFilters['progress'] })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">Any Progress</option>
                      <option value="none">No Progress (0 Lessons)</option>
                      <option value="started">In Progress (1-99%)</option>
                      <option value="completed">Completed (100%)</option>
                    </select>
                  </label>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(filters.marketingEmailOptIn)}
                      onChange={(e) => setFilters({ ...filters, marketingEmailOptIn: e.target.checked || undefined })}
                      className="rounded border-admin-border text-admin-accent focus:ring-admin-accent/30"
                    />
                    <span className="text-xs text-admin-fg">Only target users with explicit marketing email opt-in</span>
                  </label>
                </div>
              </div>

              {/* Activity & Inactivity Timing */}
              <div className="space-y-3 pt-2 border-t border-admin-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-admin-accent">Activity & Inactivity Timing</h3>
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Active in the last</span>
                    <select
                      value={filters.activeLastDays || ''}
                      onChange={(e) => setFilters({ ...filters, activeLastDays: e.target.value ? Number(e.target.value) : undefined, inactiveLastDays: undefined })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">Any</option>
                      <option value="7">Last 7 days</option>
                      <option value="14">Last 14 days</option>
                      <option value="30">Last 30 days</option>
                      <option value="60">Last 60 days</option>
                      <option value="90">Last 90 days</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Inactive for at least</span>
                    <select
                      value={filters.inactiveLastDays || ''}
                      onChange={(e) => setFilters({ ...filters, inactiveLastDays: e.target.value ? Number(e.target.value) : undefined, activeLastDays: undefined })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">Any</option>
                      <option value="7">At least 7 days</option>
                      <option value="14">At least 14 days</option>
                      <option value="30">At least 30 days</option>
                      <option value="60">At least 60 days</option>
                      <option value="90">At least 90 days</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Joined Date Range</span>
                    <div className="flex items-center gap-1.5">
                      <AdminDatePicker
                        value={filters.joinedFrom || ''}
                        onValueChange={(v) => setFilters({ ...filters, joinedFrom: v || undefined })}
                        className="flex-1"
                      />
                      <span className="text-xs text-admin-fg-subtle">→</span>
                      <AdminDatePicker
                        value={filters.joinedTo || ''}
                        onValueChange={(v) => setFilters({ ...filters, joinedTo: v || undefined })}
                        className="flex-1"
                      />
                    </div>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Last Active Date Range</span>
                    <div className="flex items-center gap-1.5">
                      <AdminDatePicker
                        value={filters.activeFrom || ''}
                        onValueChange={(v) => setFilters({ ...filters, activeFrom: v || undefined })}
                        className="flex-1"
                      />
                      <span className="text-xs text-admin-fg-subtle">→</span>
                      <AdminDatePicker
                        value={filters.activeTo || ''}
                        onValueChange={(v) => setFilters({ ...filters, activeTo: v || undefined })}
                        className="flex-1"
                      />
                    </div>
                  </label>
                </div>
              </div>

              {/* Onboarding Persona Targeting */}
              <div className="space-y-3 pt-2 border-t border-admin-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-admin-accent">Onboarding & Persona</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Onboarding Status</span>
                    <select
                      value={filters.onboardingStatus || ''}
                      onChange={(e) => setFilters({ ...filters, onboardingStatus: (e.target.value || undefined) as AdminUserFilters['onboardingStatus'] })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">All Users</option>
                      <option value="completed">Completed Onboarding</option>
                      <option value="incomplete">Incomplete Onboarding</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Learning Preference</span>
                    <select
                      value={filters.learningPreference || ''}
                      onChange={(e) => setFilters({ ...filters, learningPreference: e.target.value || undefined })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">All Preferences</option>
                      {PREFERENCE_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-semibold text-admin-fg-muted block">Experience Level</span>
                  <div className="flex flex-wrap gap-2">
                    {EXPERIENCE_OPTIONS.map((exp) => {
                      const selected = (filters.experienceLevels || []).includes(exp.id)
                      return (
                        <button
                          key={exp.id}
                          type="button"
                          onClick={() => toggleArrayFilter('experienceLevels', exp.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-admin-accent text-admin-accent-fg border-admin-accent'
                              : 'bg-admin-surface border-admin-border text-admin-fg-muted hover:text-admin-fg'
                          }`}
                        >
                          {exp.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-semibold text-admin-fg-muted block">Primary Goal</span>
                  <div className="flex flex-wrap gap-2">
                    {GOAL_OPTIONS.map((g) => {
                      const selected = (filters.goals || []).includes(g.id)
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleArrayFilter('goals', g.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-admin-accent text-admin-accent-fg border-admin-accent'
                              : 'bg-admin-surface border-admin-border text-admin-fg-muted hover:text-admin-fg'
                          }`}
                        >
                          {g.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-semibold text-admin-fg-muted block">Topics of Interest</span>
                  <div className="flex flex-wrap gap-1.5">
                    {TOPIC_OPTIONS.map((t) => {
                      const selected = (filters.topics || []).includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleArrayFilter('topics', t.id)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-admin-accent text-admin-accent-fg border-admin-accent'
                              : 'bg-admin-surface border-admin-border text-admin-fg-muted hover:text-admin-fg'
                          }`}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Email History & Exclusion */}
              <div className="space-y-3 pt-2 border-t border-admin-border">
                <h3 className="text-xs font-bold uppercase tracking-wider text-admin-accent">Email History & Exclusion</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Exclude if user already received template</span>
                    <select
                      value={filters.excludeIfReceivedTemplate || ''}
                      onChange={(e) => setFilters({ ...filters, excludeIfReceivedTemplate: e.target.value || undefined })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">None (Don't exclude by template)</option>
                      {TEMPLATE_OPTIONS.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] font-semibold text-admin-fg-muted">Only if user previously received template</span>
                    <select
                      value={filters.onlyIfReceivedTemplate || ''}
                      onChange={(e) => setFilters({ ...filters, onlyIfReceivedTemplate: e.target.value || undefined })}
                      className={cn(selectClass, 'w-full')}
                    >
                      <option value="">None (No prerequisite)</option>
                      {TEMPLATE_OPTIONS.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Audience Preview */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl border border-admin-border bg-admin-bg/60 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-admin-fg">Estimated Recipients</h3>
                  <p className="text-xs text-admin-fg-muted">Calculated server-side using your applied filters snapshot.</p>
                </div>
                <div className="text-right">
                  {calculating ? (
                    <div className="flex items-center gap-2 text-admin-accent text-sm font-bold">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Calculating…
                    </div>
                  ) : (
                    <div className="text-2xl font-black text-admin-fg font-mono">
                      {recipientCount !== null ? recipientCount.toLocaleString() : '—'}{' '}
                      <span className="text-xs font-normal text-admin-fg-muted">users</span>
                    </div>
                  )}
                </div>
              </div>

              {recipientCount === 0 && !calculating && (
                <div className="p-4 rounded-xl bg-admin-warning-soft border border-admin-warning/30 text-xs text-admin-warning flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">No users match your criteria</p>
                    <p className="mt-0.5 text-admin-warning/90">Please go back and loosen some filters (e.g. verification, activity days, or goals) to include recipients.</p>
                  </div>
                </div>
              )}

              {recipientCount !== null && recipientCount > 500 && (
                <div className="p-3 rounded-lg bg-admin-info-soft border border-admin-info/30 text-xs text-admin-info flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>
                    Large audience ({recipientCount.toLocaleString()} users). This broadcast will be delivered automatically in batches of {batchSize}.
                  </span>
                </div>
              )}

              {/* Sample Preview Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-admin-fg uppercase tracking-wider">Sample Recipients (First 20)</h4>
                  <button
                    type="button"
                    onClick={fetchSample}
                    disabled={loadingSample}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-admin-accent hover:underline cursor-pointer"
                  >
                    {loadingSample ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    {sampleUsers.length > 0 ? 'Refresh Sample' : 'Load Sample'}
                  </button>
                </div>

                {sampleUsers.length > 0 ? (
                  <div className="rounded-xl border border-admin-border overflow-hidden bg-admin-surface">
                    <table className="w-full text-xs">
                      <thead className="bg-admin-bg/60 border-b border-admin-border">
                        <tr>
                          <th className="text-left px-3 py-2 text-admin-fg-muted font-bold">Name</th>
                          <th className="text-left px-3 py-2 text-admin-fg-muted font-bold">Email</th>
                          <th className="text-left px-3 py-2 text-admin-fg-muted font-bold">Experience</th>
                          <th className="text-left px-3 py-2 text-admin-fg-muted font-bold">Onboarding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-admin-border">
                        {sampleUsers.map((u) => (
                          <tr key={u.id}>
                            <td className="px-3 py-2 font-medium text-admin-fg">{u.name || '—'}</td>
                            <td className="px-3 py-2 text-admin-fg-muted font-mono">{u.email}</td>
                            <td className="px-3 py-2 text-admin-fg-muted capitalize">{u.career_role || '—'}</td>
                            <td className="px-3 py-2">
                              {u.onboarding_completed ? (
                                <span className="text-[10px] text-admin-success font-bold">Complete</span>
                              ) : (
                                <span className="text-[10px] text-admin-fg-subtle">Incomplete</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-6 text-center border border-dashed border-admin-border rounded-xl text-xs text-admin-fg-muted">
                    Click &ldquo;Load Sample&rdquo; to preview user records matching these filters.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Review & Send */}
          {step === 4 && (
            <div className="space-y-6">
              {/* Summary Card */}
              <div className="p-4 rounded-xl border border-admin-border bg-admin-surface space-y-3">
                <h3 className="text-xs font-bold text-admin-fg uppercase tracking-wider">Broadcast Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-admin-fg-muted block">Name:</span>
                    <span className="font-semibold text-admin-fg">{name}</span>
                  </div>
                  <div>
                    <span className="text-admin-fg-muted block">Template:</span>
                    <span className="font-mono text-admin-fg">{templateKey}</span>
                  </div>
                  <div>
                    <span className="text-admin-fg-muted block">Subject:</span>
                    <span className="font-semibold text-admin-fg">
                      {subjectOverride || TEMPLATE_OPTIONS.find((t) => t.key === templateKey)?.defaultSubject}
                    </span>
                  </div>
                  <div>
                    <span className="text-admin-fg-muted block">Estimated Audience:</span>
                    <span className="font-bold text-admin-accent font-mono">
                      {recipientCount !== null ? recipientCount.toLocaleString() : '—'} users
                    </span>
                  </div>
                  <div>
                    <span className="text-admin-fg-muted block">Batch Configuration:</span>
                    <span className="font-medium text-admin-fg">{batchSize} emails per batch</span>
                  </div>
                </div>
              </div>

              {/* Timing selector */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-admin-fg block">Delivery Timing</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSendTiming('immediate')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      sendTiming === 'immediate'
                        ? 'border-admin-accent bg-admin-accent-soft text-admin-fg font-semibold'
                        : 'border-admin-border bg-admin-surface text-admin-fg-muted'
                    }`}
                  >
                    <Send className="w-4 h-4 text-admin-accent mb-1.5" />
                    <div className="text-xs font-bold text-admin-fg">Send Immediately</div>
                    <div className="text-[10px] text-admin-fg-muted mt-0.5">Start first batch now</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSendTiming('schedule')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      sendTiming === 'schedule'
                        ? 'border-admin-accent bg-admin-accent-soft text-admin-fg font-semibold'
                        : 'border-admin-border bg-admin-surface text-admin-fg-muted'
                    }`}
                  >
                    <Calendar className="w-4 h-4 text-admin-info mb-1.5" />
                    <div className="text-xs font-bold text-admin-fg">Schedule Delivery</div>
                    <div className="text-[10px] text-admin-fg-muted mt-0.5">Automated future time</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSendTiming('draft')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      sendTiming === 'draft'
                        ? 'border-admin-accent bg-admin-accent-soft text-admin-fg font-semibold'
                        : 'border-admin-border bg-admin-surface text-admin-fg-muted'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-admin-success mb-1.5" />
                    <div className="text-xs font-bold text-admin-fg">Save as Draft</div>
                    <div className="text-[10px] text-admin-fg-muted mt-0.5">Send manually later</div>
                  </button>
                </div>

                {sendTiming === 'schedule' && (
                  <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-admin-bg/60 border border-admin-border">
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-admin-fg-muted">Schedule Date</span>
                      <AdminDatePicker
                        value={scheduledDate}
                        onValueChange={(v) => setScheduledDate(v)}
                        className="w-full"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-admin-fg-muted">Schedule Time (24h)</span>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className={cn(selectClass, 'w-full')}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Confirmation Checkbox */}
              <div className="p-4 rounded-xl bg-admin-surface border border-admin-border">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-admin-border text-admin-accent focus:ring-admin-accent/30"
                  />
                  <div className="text-xs text-admin-fg">
                    <span className="font-bold">I confirm this broadcast audience and content</span>
                    <p className="text-[11px] text-admin-fg-muted mt-0.5">
                      Emails will be queued with duplicate protection and sent via Resend API.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-admin-border bg-admin-surface-raised/40">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-admin-border text-xs font-semibold text-admin-fg hover:bg-admin-surface-raised transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9 px-4 rounded-lg text-xs font-semibold text-admin-fg-muted hover:text-admin-fg transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !name.trim()) {
                    setErrorMsg('Please enter a broadcast name.')
                    return
                  }
                  setErrorMsg(null)
                  setStep((s) => (s + 1) as 1 | 2 | 3 | 4)
                }}
                className="inline-flex items-center gap-1.5 h-9 px-5 rounded-lg bg-admin-accent text-admin-accent-fg text-xs font-bold hover:bg-admin-accent/90 transition-colors cursor-pointer"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!confirmed || submitting || (sendTiming === 'schedule' && !scheduledDate)}
                className="inline-flex items-center gap-2 h-9 px-6 rounded-lg bg-admin-accent text-admin-accent-fg text-xs font-bold hover:bg-admin-accent/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {sendTiming === 'immediate'
                      ? 'Launch Broadcast'
                      : sendTiming === 'schedule'
                      ? 'Schedule Broadcast'
                      : 'Save Draft'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
