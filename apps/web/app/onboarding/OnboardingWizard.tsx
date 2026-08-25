'use client'

import React, { useState, useEffect, useTransition, useId } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Target,
  Compass,
  Sparkles,
  User,
  Briefcase,
  BookOpen,
  CheckCircle2,
  TrendingUp,
  Map,
  Sliders,
  FileText,
  Zap,
  Rocket,
  Search,
  Users,
  Award,
  ListOrdered,
  Hammer,
  FileSpreadsheet,
  Globe,
  Clock,
  GraduationCap,
  Layers,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { submitOnboarding, checkUsernameAvailability, OnboardingData } from './actions'
import { AvatarUpload } from '@/components/profile/AvatarUpload'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { CURRICULUM_MODULE_META, CurriculumModuleMeta } from '@/lib/admin/curriculum-meta'
import {
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_EXPERIENCE_OPTIONS,
  DEFAULT_TOPIC_OPTIONS,
  DEFAULT_PREFERENCE_OPTIONS,
  DEFAULT_ONBOARDING_STEPS,
} from '@/lib/admin/settings-service'
import type { OnboardingSettings, OnboardingFieldOption } from '@/lib/admin/types'

interface OnboardingUser {
  id: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
    username?: string
  }
}

interface OnboardingProfile {
  name?: string | null
  username?: string | null
  avatar_url?: string | null
  bio?: string | null
  career_role?: string | null
  goal?: string | null
  learning_purpose?: string | null
  linkedin_url?: string | null
  github_url?: string | null
  website_url?: string | null
}

interface OnboardingWizardProps {
  user: OnboardingUser
  profile: OnboardingProfile | null
  onboardingSettings?: OnboardingSettings
}

const DRAFT_STORAGE_KEY = 'prodily_onboarding_draft_v2'

// SVG Social Icons
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.64 1.64 0 1 0-.01-3.28 1.64 1.64 0 0 0 .01 3.28m1.4 9.74v-8.37H5.06v8.37h2.8z" />
    </svg>
  )
}

function TwitterXIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

// Map icon string names to Lucide icons
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Target,
  Compass,
  Sparkles,
  TrendingUp,
  BookOpen,
  Briefcase,
  Award,
  Search,
  Users,
  Map,
  Sliders,
  FileText,
  Zap,
  Rocket,
  ListOrdered,
  Hammer,
  FileSpreadsheet,
}

function getIconComponent(iconName?: string, fallback = Sparkles) {
  if (!iconName) return fallback
  return ICON_MAP[iconName] || fallback
}

/**
 * Intelligent recommendation engine that maps onboarding choices to a primary starting module.
 */
function computeRecommendation(
  goalId?: string,
  experienceId?: string,
  topics?: string[],
  goalOptions?: OnboardingFieldOption[]
): CurriculumModuleMeta {
  // 1. Check if chosen goal specifies a recommended module
  const selectedGoal = goalOptions?.find((g) => g.id === goalId)
  if (selectedGoal?.recommendedModule && CURRICULUM_MODULE_META[selectedGoal.recommendedModule]) {
    if (experienceId === 'beginner' || experienceId === 'learning') {
      return CURRICULUM_MODULE_META.foundations || CURRICULUM_MODULE_META[selectedGoal.recommendedModule]
    }
    return CURRICULUM_MODULE_META[selectedGoal.recommendedModule]
  }

  // 2. Check topic affinity
  if (topics && topics.length > 0) {
    if (topics.includes('discovery') || topics.includes('user_research')) {
      return CURRICULUM_MODULE_META.discovery || CURRICULUM_MODULE_META.foundations
    }
    if (topics.includes('strategy') || topics.includes('roadmapping') || topics.includes('prioritization')) {
      return CURRICULUM_MODULE_META.strategy || CURRICULUM_MODULE_META.foundations
    }
    if (topics.includes('prds') || topics.includes('agile')) {
      return CURRICULUM_MODULE_META.execution || CURRICULUM_MODULE_META.foundations
    }
    if (topics.includes('metrics') || topics.includes('launch')) {
      return CURRICULUM_MODULE_META.growth || CURRICULUM_MODULE_META.foundations
    }
    if (topics.includes('stakeholders')) {
      return CURRICULUM_MODULE_META.leadership || CURRICULUM_MODULE_META.foundations
    }
  }

  return CURRICULUM_MODULE_META.foundations || Object.values(CURRICULUM_MODULE_META)[0]
}

export default function OnboardingWizard({ user, profile, onboardingSettings }: OnboardingWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const nameInputId = useId()
  const usernameInputId = useId()
  const bioInputId = useId()
  const linkedinInputId = useId()
  const twitterInputId = useId()
  const githubInputId = useId()
  const websiteInputId = useId()

  // Resolve active configured options or fall back to rich defaults
  const goalOptions: OnboardingFieldOption[] =
    onboardingSettings?.fieldOptions?.goal?.filter((o) => o.enabled !== false) || DEFAULT_GOAL_OPTIONS
  const experienceOptions: OnboardingFieldOption[] =
    onboardingSettings?.fieldOptions?.experience_level?.filter((o) => o.enabled !== false) || DEFAULT_EXPERIENCE_OPTIONS
  const topicOptions: OnboardingFieldOption[] =
    onboardingSettings?.fieldOptions?.topics?.filter((o) => o.enabled !== false) || DEFAULT_TOPIC_OPTIONS
  const preferenceOptions: OnboardingFieldOption[] =
    onboardingSettings?.fieldOptions?.learning_preference?.filter((o) => o.enabled !== false) || DEFAULT_PREFERENCE_OPTIONS
  const stepsConfig = onboardingSettings?.steps && onboardingSettings.steps.length === 4
    ? onboardingSettings.steps
    : DEFAULT_ONBOARDING_STEPS

  const [step, setStep] = useState<number>(() => {
    if (typeof window === 'undefined') return 1
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed._savedStep && parsed._savedStep >= 1 && parsed._savedStep <= 4) {
          return parsed._savedStep
        }
      }
    } catch {
      // Storage unavailable
    }
    return 1
  })

  const [formData, setFormData] = useState<OnboardingData>(() => {
    const base: OnboardingData = {
      name: profile?.name || user?.user_metadata?.full_name || '',
      username: profile?.username || user?.user_metadata?.username || '',
      avatar_url: profile?.avatar_url || user?.user_metadata?.avatar_url || null,
      bio: profile?.bio || '',
      career_role: profile?.career_role || 'beginner',
      goal: profile?.goal || 'become_pm',
      topics: ['discovery', 'strategy', 'metrics', 'prds'],
      learning_preference: 'mix',
      linkedin_url: profile?.linkedin_url || '',
      twitter_url: '',
      github_url: profile?.github_url || '',
      website_url: profile?.website_url || '',
    }

    if (typeof window === 'undefined') return base

    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          ...base,
          ...parsed,
          name: parsed.name || base.name,
          username: parsed.username || base.username,
          avatar_url: parsed.avatar_url || base.avatar_url,
        }
      }
    } catch {
      // Storage unavailable
    }
    return base
  })

  // Username validation & availability state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Validate username debounced
  useEffect(() => {
    const raw = (formData.username || '').trim().toLowerCase()
    if (!raw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsernameStatus('idle')
      setUsernameError(null)
      return
    }

    if (raw.length < 3) {
      setUsernameStatus('invalid')
      setUsernameError('Username must be at least 3 characters.')
      return
    }

    if (raw.length > 24) {
      setUsernameStatus('invalid')
      setUsernameError('Username must be at most 24 characters.')
      return
    }

    if (!/^[a-z0-9_]+$/.test(raw)) {
      setUsernameStatus('invalid')
      setUsernameError('Only lowercase letters, numbers, and underscores are allowed.')
      return
    }

    setUsernameStatus('checking')
    setUsernameError(null)

    const timer = setTimeout(async () => {
      const res = await checkUsernameAvailability(raw, user.id)
      if (!res.available) {
        setUsernameStatus('taken')
        setUsernameError(res.error || 'Username is already taken.')
      } else {
        setUsernameStatus('available')
        setUsernameError(null)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [formData.username, user.id])

  const updateForm = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...next, _savedStep: step }))
      } catch {
        // Storage unavailable
      }
      return next
    })
  }

  const toggleTopic = (topicId: string) => {
    setFormData((prev) => {
      const current = prev.topics || []
      const exists = current.includes(topicId)
      const nextTopics = exists ? current.filter((t) => t !== topicId) : [...current, topicId]
      const next = { ...prev, topics: nextTopics }
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...next, _savedStep: step }))
      } catch {
        // Storage unavailable
      }
      return next
    })
  }

  const nextStep = () => {
    setErrorMsg(null)

    // Step 1 Validation
    if (step === 1) {
      const u = (formData.username || '').trim().toLowerCase()
      if (!u) {
        setErrorMsg('Please enter a username.')
        return
      }
      if (u.length < 3 || u.length > 24 || !/^[a-z0-9_]+$/.test(u)) {
        setErrorMsg('Username must be 3–24 characters and only contain letters, numbers, and underscores.')
        return
      }
      if (usernameStatus === 'taken') {
        setErrorMsg('Please choose an available username.')
        return
      }
      if (!formData.name?.trim()) {
        setErrorMsg('Please enter your full display name.')
        return
      }
    }

    // Step 2 Validation
    if (step === 2) {
      if (!formData.career_role) {
        setErrorMsg('Please select your current experience level.')
        return
      }
      if (!formData.goal) {
        setErrorMsg('Please select your primary learning goal.')
        return
      }
    }

    // Step 3 Validation
    if (step === 3) {
      if (!formData.topics || formData.topics.length === 0) {
        setErrorMsg('Please select at least one learning topic of interest.')
        return
      }
      if (!formData.learning_preference) {
        setErrorMsg('Please choose a preferred learning style.')
        return
      }
    }

    const nextS = Math.min(4, step + 1)
    setStep(nextS)
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...formData, _savedStep: nextS }))
    } catch {
      // Storage unavailable
    }
  }

  const prevStep = () => {
    setErrorMsg(null)
    const prevS = Math.max(1, step - 1)
    setStep(prevS)
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...formData, _savedStep: prevS }))
    } catch {
      // Storage unavailable
    }
  }

  const handleComplete = async (targetDestination: '/academy' | '/dashboard' = '/academy') => {
    setErrorMsg(null)

    startTransition(async () => {
      const result = await submitOnboarding(formData)

      if (result.error) {
        setErrorMsg(result.error)
        return
      }

      // Clear draft storage
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
      } catch {
        // Storage unavailable
      }

      // Refresh Supabase session on client so token JWT contains updated user_metadata
      const supabase = createBrowserSupabaseClient()
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (refreshError) {
        console.warn('[onboarding] Session refresh warning:', refreshError.message)
      }

      router.push(targetDestination)
      router.refresh()
    })
  }

  // Recommended course calculation for Step 4
  const recommendedModule = computeRecommendation(
    formData.goal,
    formData.career_role,
    formData.topics,
    goalOptions
  )

  const selectedGoalObj = goalOptions.find((g) => g.id === formData.goal)
  const selectedExpObj = experienceOptions.find((e) => e.id === formData.career_role)
  const selectedPrefObj = preferenceOptions.find((p) => p.id === formData.learning_preference)

  const stepTitles = [
    stepsConfig[0]?.title || 'Build Your Profile',
    stepsConfig[1]?.title || 'Tell Us About You',
    stepsConfig[2]?.title || 'Choose What You Want to Learn',
    stepsConfig[3]?.title || 'Your Prodily Path',
  ]

  const stepDescriptions = [
    stepsConfig[0]?.description || 'Personalize your learner identity and shareable public portfolio.',
    stepsConfig[1]?.description || 'Help us calibrate your starting point and customized recommendations.',
    stepsConfig[2]?.description || 'Select your priority topics and preferred learning format.',
    stepsConfig[3]?.description || 'Your personalized learning plan is ready to launch.',
  ]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl w-full space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <BrandMarkProdily className="w-8 h-8 text-primary" />
            <span className="font-serif text-xl font-bold tracking-tight text-foreground">Prodily</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground tracking-tight">
            {stepTitles[step - 1]}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
            {stepDescriptions[step - 1]}
          </p>
        </div>

        {/* 4-Step Progress Indicator */}
        <div className="grid grid-cols-4 gap-2 px-1">
          {[
            { num: 1, label: 'Profile', icon: User },
            { num: 2, label: 'About You', icon: Briefcase },
            { num: 3, label: 'Interests', icon: BookOpen },
            { num: 4, label: 'Your Path', icon: Sparkles },
          ].map((s) => {
            const isActive = step === s.num
            const isDone = step > s.num
            return (
              <div
                key={s.num}
                className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                  isActive
                    ? 'border-primary bg-primary/5 text-primary shadow-xs'
                    : isDone
                    ? 'border-primary/30 bg-card text-muted-foreground'
                    : 'border-border/60 bg-card/40 text-muted-foreground/60'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : isDone
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : s.num}
                </div>
                <span className="text-xs font-medium truncate hidden sm:inline">{s.label}</span>
              </div>
            )
          })}
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            className="p-3.5 text-xs rounded-xl bg-destructive/10 border border-destructive/20 text-destructive font-medium flex items-center gap-2 animate-in fade-in duration-200"
            role="alert"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Main Card Container */}
        <div className="bg-card p-6 sm:p-8 rounded-2xl border border-border shadow-sm space-y-6">
          {/* STEP 1: Build Your Profile */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Avatar Upload */}
              <div className="flex flex-col items-center justify-center pb-2">
                <AvatarUpload
                  userId={user.id}
                  currentAvatarUrl={formData.avatar_url || undefined}
                  onUploadSuccess={(url) => updateForm('avatar_url', url)}
                  onRemove={() => updateForm('avatar_url', null)}
                />
                <p className="text-[11px] text-muted-foreground mt-2">Upload a profile photo (Optional)</p>
              </div>

              {/* Username Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground" htmlFor={usernameInputId}>
                    Username <span className="text-primary">*</span>
                  </label>
                  {usernameStatus === 'checking' && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                    </span>
                  )}
                  {usernameStatus === 'available' && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" /> Available
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono select-none">
                    prodily.me/p/
                  </span>
                  <Input
                    id={usernameInputId}
                    value={formData.username || ''}
                    onChange={(e) => updateForm('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="alexrivera"
                    className={`pl-28 rounded-xl border font-mono text-sm ${
                      usernameStatus === 'taken' || usernameStatus === 'invalid'
                        ? 'border-destructive focus-visible:ring-destructive'
                        : usernameStatus === 'available'
                        ? 'border-emerald-500/50'
                        : 'border-border'
                    }`}
                    maxLength={24}
                  />
                </div>
                {usernameError ? (
                  <p className="text-[11px] text-destructive">{usernameError}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Unique handle for your public PM portfolio & certificate sharing.</p>
                )}
              </div>

              {/* Full Display Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor={nameInputId}>
                  Display Name <span className="text-primary">*</span>
                </label>
                <Input
                  id={nameInputId}
                  value={formData.name || ''}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="rounded-xl border-border"
                  maxLength={60}
                />
                <p className="text-[11px] text-muted-foreground">Appears on verified certificates and leaderboard rankings.</p>
              </div>

              {/* Short Bio */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground" htmlFor={bioInputId}>
                    Short Bio <span className="text-muted-foreground font-normal">(Optional)</span>
                  </label>
                  <span className="text-[10px] text-muted-foreground">{(formData.bio || '').length}/160</span>
                </div>
                <textarea
                  id={bioInputId}
                  value={formData.bio || ''}
                  onChange={(e) => updateForm('bio', e.target.value)}
                  placeholder="e.g. Aspiring PM with an engineering background. Passionate about B2B SaaS and AI products."
                  className="w-full h-20 px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none placeholder:text-muted-foreground"
                  maxLength={160}
                />
              </div>

              {/* Social Links Section */}
              <div className="space-y-3 pt-3 border-t border-border/60">
                <p className="text-xs font-semibold text-foreground">Social & Portfolio Links (Optional)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground flex items-center gap-1.5" htmlFor={linkedinInputId}>
                      <LinkedInIcon className="w-3.5 h-3.5 text-blue-600" /> LinkedIn
                    </label>
                    <Input
                      id={linkedinInputId}
                      value={formData.linkedin_url || ''}
                      onChange={(e) => updateForm('linkedin_url', e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                      className="rounded-xl border-border text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground flex items-center gap-1.5" htmlFor={twitterInputId}>
                      <TwitterXIcon className="w-3.5 h-3.5 text-foreground" /> X / Twitter
                    </label>
                    <Input
                      id={twitterInputId}
                      value={formData.twitter_url || ''}
                      onChange={(e) => updateForm('twitter_url', e.target.value)}
                      placeholder="@handle or https://x.com/handle"
                      className="rounded-xl border-border text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground flex items-center gap-1.5" htmlFor={githubInputId}>
                      <GitHubIcon className="w-3.5 h-3.5 text-foreground" /> GitHub
                    </label>
                    <Input
                      id={githubInputId}
                      value={formData.github_url || ''}
                      onChange={(e) => updateForm('github_url', e.target.value)}
                      placeholder="https://github.com/username"
                      className="rounded-xl border-border text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground flex items-center gap-1.5" htmlFor={websiteInputId}>
                      <Globe className="w-3.5 h-3.5 text-emerald-600" /> Website / Portfolio
                    </label>
                    <Input
                      id={websiteInputId}
                      value={formData.website_url || ''}
                      onChange={(e) => updateForm('website_url', e.target.value)}
                      placeholder="https://yourportfolio.me"
                      className="rounded-xl border-border text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Tell Us About You */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Experience Level Section */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    What is your current experience level? <span className="text-primary">*</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground">Helps us match case studies and quiz difficulties to your background.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {experienceOptions.map((opt) => {
                    const isSelected = formData.career_role === opt.id
                    const Icon = getIconComponent(opt.icon, Briefcase)
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateForm('career_role', opt.id)}
                        className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                            : 'border-border bg-card hover:bg-muted/40 hover:border-border-strong'
                        }`}
                      >
                        <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-foreground">{opt.label}</p>
                            {opt.badge && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          {opt.description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{opt.description}</p>}
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Primary Goal Section */}
              <div className="space-y-3 pt-3 border-t border-border/60">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    What is your primary learning goal? <span className="text-primary">*</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground">We tailor your primary starting trajectory and capstone milestone path.</p>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {goalOptions.map((opt) => {
                    const isSelected = formData.goal === opt.id
                    const Icon = getIconComponent(opt.icon, Target)
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateForm('goal', opt.id)}
                        className={`p-3.5 rounded-xl border text-left flex items-start gap-3.5 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                            : 'border-border bg-card hover:bg-muted/40 hover:border-border-strong'
                        }`}
                      >
                        <div className={`p-2.5 rounded-lg shrink-0 ${isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-foreground">{opt.label}</p>
                            {opt.badge && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          {opt.description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.description}</p>}
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Choose What You Want to Learn */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Topics Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-foreground">
                      Select Topics of Interest <span className="text-primary">*</span>
                    </label>
                    <p className="text-[11px] text-muted-foreground">Pick the competencies you want to prioritize (select multiple).</p>
                  </div>
                  <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {(formData.topics || []).length} selected
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {topicOptions.map((t) => {
                    const isSelected = (formData.topics || []).includes(t.id)
                    const Icon = getIconComponent(t.icon, Sparkles)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTopic(t.id)}
                        className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-foreground font-semibold ring-1 ring-primary/30 shadow-xs'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                          {isSelected ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-xs truncate">{t.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Learning Preference Selection */}
              <div className="space-y-3 pt-3 border-t border-border/60">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Preferred Learning Style <span className="text-primary">*</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground">How do you learn best?</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {preferenceOptions.map((p) => {
                    const isSelected = formData.learning_preference === p.id
                    const Icon = getIconComponent(p.icon, BookOpen)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => updateForm('learning_preference', p.id)}
                        className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                            : 'border-border bg-card hover:bg-muted/40 hover:border-border-strong'
                        }`}
                      >
                        <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground">{p.label}</p>
                          {p.description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{p.description}</p>}
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Your Prodily Path (Recommendation Step) */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Personalized Summary Card */}
              <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary shrink-0" />
                  <h3 className="text-base font-bold text-foreground">Your Prodily journey is ready 🚀</h3>
                </div>
                <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
                  You are starting as a <strong className="text-foreground">{selectedExpObj?.label || 'Learner'}</strong> and your goal is to{' '}
                  <strong className="text-foreground">{selectedGoalObj?.label || 'Master Product Management'}</strong>.
                </p>
              </div>

              {/* Recommended Course / Module */}
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-primary" /> Recommended Starting Module
                </p>

                <div className={`p-5 rounded-2xl border bg-card shadow-xs flex flex-col sm:flex-row items-start gap-4 ${recommendedModule.accentBorder} border-l-4`}>
                  <div className="text-3xl shrink-0 p-3 rounded-2xl bg-muted/60 flex items-center justify-center">
                    {recommendedModule.icon}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-foreground">{recommendedModule.name}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${recommendedModule.color}`}>
                        Recommended Match
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{recommendedModule.description}</p>
                  </div>
                </div>
              </div>

              {/* Selected Focus Topics */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-primary" /> Your Focus Competencies
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(formData.topics || []).map((tId) => {
                    const top = topicOptions.find((t) => t.id === tId)
                    return (
                      <span key={tId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted text-foreground text-xs font-medium border border-border/80">
                        <Check className="w-3 h-3 text-primary" /> {top?.label || tId}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Key Milestones & Curriculum Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-border/60">
                <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Curriculum Size</p>
                  <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5">90 Lessons · 9 Modules</p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Estimated Pace
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5">~18–24 Hours</p>
                </div>

                <div className="p-3 rounded-xl bg-muted/40 border border-border/60 col-span-2 sm:col-span-1">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Learning Style</p>
                  <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5 truncate">{selectedPrefObj?.label || 'Balanced Mix'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center justify-between gap-3">
          {step > 1 && step <= 4 && (
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={isPending}
              className="flex-1 rounded-xl h-11 border-border font-medium"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          )}

          {step < 4 ? (
            <Button
              type="button"
              onClick={nextStep}
              className="flex-1 rounded-xl h-11 bg-primary text-white hover:text-white hover:bg-primary/90 font-semibold shadow-xs"
            >
              Continue <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <div className="flex-1 flex flex-col sm:flex-row items-center gap-2.5 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleComplete('/dashboard')}
                disabled={isPending}
                className="w-full sm:flex-1 rounded-xl h-11 border-border font-medium text-foreground hover:bg-muted"
              >
                Explore Prodily
              </Button>
              <Button
                type="button"
                onClick={() => handleComplete('/academy')}
                disabled={isPending}
                className="w-full sm:flex-1 rounded-xl h-11 bg-primary text-white hover:text-white hover:bg-primary/90 font-semibold shadow-xs"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Rocket className="w-4 h-4 mr-1.5" />}
                {isPending ? 'Launching...' : 'Start Learning'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
