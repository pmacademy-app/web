'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowRight, ArrowLeft, Check, Target, Compass, Sparkles, User, Briefcase, Globe, CheckCircle2 } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { submitOnboarding, OnboardingData } from './actions'
import { AvatarUpload } from '@/components/profile/AvatarUpload'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'

interface OnboardingUser {
  id: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
  }
}

interface OnboardingProfile {
  name?: string
  username?: string
  avatar_url?: string
  career_role?: string
  goal?: 'job_search' | 'fill_gaps' | 'exploring'
  learning_purpose?: string
  linkedin_url?: string
  website_url?: string
}

interface OnboardingWizardProps {
  user: OnboardingUser
  profile: OnboardingProfile | null
}

const GOALS = [
  {
    id: 'job_search' as const,
    title: 'Landing a PM Role',
    description: 'Preparing for interviews, case studies, and breaking into product management.',
    icon: Target,
    badge: 'Career Focus',
  },
  {
    id: 'fill_gaps' as const,
    title: 'Filling Knowledge Gaps',
    description: 'Leveling up specific competencies in discovery, design, metrics, and strategy.',
    icon: Sparkles,
    badge: 'Skill Growth',
  },
  {
    id: 'exploring' as const,
    title: 'Exploring Product Management',
    description: 'Evaluating PM methodologies, frameworks, and career trajectories.',
    icon: Compass,
    badge: 'Foundations',
  },
]

const DRAFT_STORAGE_KEY = 'prodily_onboarding_draft'

export default function OnboardingWizard({ user, profile }: OnboardingWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [formData, setFormData] = useState<OnboardingData>({
    name: profile?.name || user?.user_metadata?.full_name || '',
    username: profile?.username || '',
    avatar_url: profile?.avatar_url || user?.user_metadata?.avatar_url || null,
    career_role: profile?.career_role || '',
    goal: profile?.goal || undefined,
    learning_purpose: profile?.learning_purpose || '',
    linkedin_url: profile?.linkedin_url || '',
    website_url: profile?.website_url || '',
  })

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setFormData((prev) => ({
          ...prev,
          ...parsed,
          // Preserve avatar and name from profile if not in draft
          name: parsed.name || prev.name,
          avatar_url: parsed.avatar_url || prev.avatar_url,
        }))
        if (parsed._savedStep && parsed._savedStep >= 1 && parsed._savedStep <= 3) {
          setStep(parsed._savedStep)
        }
      }
    } catch {
      // Ignore storage error
    }
  }, [])

  const updateForm = (key: keyof OnboardingData, value: string | null) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...next, _savedStep: step }))
      } catch {
        // Ignore storage error
      }
      return next
    })
  }

  const nextStep = () => {
    setErrorMsg(null)
    if (step === 1 && !formData.name?.trim()) {
      setErrorMsg('Please enter your name.')
      return
    }
    if (step === 2 && !formData.goal) {
      setErrorMsg('Please select your primary learning goal.')
      return
    }
    const nextS = Math.min(3, step + 1)
    setStep(nextS)
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...formData, _savedStep: nextS }))
    } catch {
      // Ignore
    }
  }

  const prevStep = () => {
    const prevS = Math.max(1, step - 1)
    setStep(prevS)
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...formData, _savedStep: prevS }))
    } catch {
      // Ignore
    }
  }

  const handleSubmit = async () => {
    setErrorMsg(null)

    startTransition(async () => {
      const result = await submitOnboarding(formData)

      if (result.error) {
        setErrorMsg(result.error)
        return
      }

      // Clear draft storage upon completion
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
      } catch {
        // Ignore
      }

      // Refresh Supabase session on client so token JWT contains updated user_metadata
      const supabase = createBrowserSupabaseClient()
      const { error: refreshError } = await supabase.auth.refreshSession()

      if (refreshError) {
        console.warn('[onboarding] Session refresh warning:', refreshError.message)
      }

      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12 relative overflow-hidden">
      {/* Ambient background blur */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-xl w-full space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <BrandMarkProdily className="w-8 h-8 text-primary" />
            <span className="font-serif text-xl font-bold tracking-tight text-foreground">Prodily</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground">
            {step === 1 && 'Welcome! Set up your profile'}
            {step === 2 && 'What is your primary goal?'}
            {step === 3 && 'Links & online presence'}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm">
            {step === 1 && 'Personalize your learner identity across the curriculum.'}
            {step === 2 && 'We tailor your learning track, capstone recommendations, and radar.'}
            {step === 3 && 'Optionally connect your professional profiles for your public PM portfolio.'}
          </p>
        </div>

        {/* Multi-step progress indicator */}
        <div className="grid grid-cols-3 gap-2 px-2">
          {[
            { num: 1, label: 'Profile', icon: User },
            { num: 2, label: 'Goals', icon: Briefcase },
            { num: 3, label: 'Links', icon: Globe },
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
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
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

        {errorMsg && (
          <div className="p-3.5 text-xs rounded-xl bg-destructive/10 border border-destructive/20 text-destructive font-medium flex items-center gap-2 animate-in fade-in duration-200" role="alert">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* Step Card Container */}
        <div className="bg-card p-6 sm:p-8 rounded-2xl border border-border shadow-sm space-y-6">
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex flex-col items-center justify-center pb-2">
                <AvatarUpload
                  userId={user.id}
                  currentAvatarUrl={formData.avatar_url || undefined}
                  onUploadSuccess={(url) => updateForm('avatar_url', url)}
                />
                <p className="text-[11px] text-muted-foreground mt-2">Upload a profile photo</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor="name">
                  Full Name <span className="text-primary">*</span>
                </label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="rounded-xl border-border"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor="username">
                  Username <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <Input
                  id="username"
                  value={formData.username || ''}
                  onChange={(e) => updateForm('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. alexrivera"
                  className="rounded-xl border-border font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Used for your shareable Prodily public profile link.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Select your primary objective <span className="text-primary">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2.5">
                  {GOALS.map((g) => {
                    const isSelected = formData.goal === g.id
                    const Icon = g.icon
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => updateForm('goal', g.id)}
                        className={`p-4 rounded-xl border text-left flex items-start gap-3.5 transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs'
                            : 'border-border bg-card hover:bg-muted/40 hover:border-border-strong'
                        }`}
                      >
                        <div className={`p-2.5 rounded-lg shrink-0 ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-foreground">{g.title}</p>
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {g.badge}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-border/60">
                <label className="text-xs font-semibold text-foreground" htmlFor="career_role">
                  Current Role / Background <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <Input
                  id="career_role"
                  value={formData.career_role || ''}
                  onChange={(e) => updateForm('career_role', e.target.value)}
                  placeholder="e.g. Associate PM, Software Engineer, Consultant, Student"
                  className="rounded-xl border-border"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor="learning_purpose">
                  Specific Learning Goal <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <Input
                  id="learning_purpose"
                  value={formData.learning_purpose || ''}
                  onChange={(e) => updateForm('learning_purpose', e.target.value)}
                  placeholder="e.g. Master product discovery and metrics trees for B2B SaaS"
                  className="rounded-xl border-border"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor="linkedin_url">
                  LinkedIn Profile URL <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <Input
                  id="linkedin_url"
                  value={formData.linkedin_url || ''}
                  onChange={(e) => updateForm('linkedin_url', e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  className="rounded-xl border-border font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor="website_url">
                  Personal Portfolio or GitHub URL <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <Input
                  id="website_url"
                  value={formData.website_url || ''}
                  onChange={(e) => updateForm('website_url', e.target.value)}
                  placeholder="https://portfolio.me or https://github.com/username"
                  className="rounded-xl border-border font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">You can also update or hide these anytime from your account settings.</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={step === 1 || isPending}
            className="flex-1 rounded-xl h-11 border-border font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>

          {step < 3 ? (
            <Button
              type="button"
              onClick={nextStep}
              className="flex-1 rounded-xl h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              Continue <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 rounded-xl h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {isPending ? 'Finalizing Setup...' : 'Complete & Start Learning'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

