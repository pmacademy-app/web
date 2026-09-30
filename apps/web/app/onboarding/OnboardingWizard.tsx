'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Target,
  Compass,
  Sparkles,
  Briefcase,
  BookOpen,
  CheckCircle2,
  TrendingUp,
  Rocket,
  Award,
  GraduationCap,
} from 'lucide-react'
import { submitOnboarding, recordOnboardingStep, OnboardingData } from './actions'
import {
  ONBOARDING_PRIMARY_DESTINATION,
  ONBOARDING_SECONDARY_DESTINATION,
  type OnboardingDestination,
} from './onboarding-destinations'
import { Button } from '@/components/ui/button'
import { BrandMarkProdily } from '@/components/brand/BrandLogo'
import { CURRICULUM_MODULE_META, CurriculumModuleMeta } from '@/lib/admin/curriculum-meta'
import { CurriculumModuleIcon } from '@/components/curriculum/CurriculumModuleIcon'
import { DEFAULT_GOAL_OPTIONS, DEFAULT_EXPERIENCE_OPTIONS } from '@/lib/admin/onboarding-defaults'
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
  goal?: string | null
  career_role?: string | null
}

interface OnboardingWizardProps {
  user: OnboardingUser
  profile: OnboardingProfile | null
  onboardingSettings?: OnboardingSettings
}

// Phase 4 (Collapse the Entrance): the draft key is bumped from _v2 so a learner who had a
// partially-filled 4-step draft in progress is not fed stale identity fields into the new
// single-screen flow. Only goal + experience are persisted here.
const DRAFT_STORAGE_KEY = 'prodily_onboarding_path_v1'

// Icons referenced by the default goal/experience option sets, plus a safe fallback.
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Target,
  Compass,
  Sparkles,
  TrendingUp,
  BookOpen,
  Briefcase,
  Award,
}

function getIconComponent(iconName?: string, fallback = Sparkles) {
  if (!iconName) return fallback
  return ICON_MAP[iconName] || fallback
}

/**
 * Maps the learner's goal + experience to a recommended starting module. Used only to render a
 * non-blocking hint on this screen; the recommendation is not required to complete onboarding.
 */
function computeRecommendation(
  goalId?: string,
  experienceId?: string,
  goalOptions?: OnboardingFieldOption[]
): CurriculumModuleMeta {
  const selectedGoal = goalOptions?.find((g) => g.id === goalId)
  if (selectedGoal?.recommendedModule && CURRICULUM_MODULE_META[selectedGoal.recommendedModule]) {
    if (experienceId === 'beginner' || experienceId === 'learning') {
      return CURRICULUM_MODULE_META.foundations || CURRICULUM_MODULE_META[selectedGoal.recommendedModule]
    }
    return CURRICULUM_MODULE_META[selectedGoal.recommendedModule]
  }
  return CURRICULUM_MODULE_META.foundations || Object.values(CURRICULUM_MODULE_META)[0]
}

interface PathDraft {
  goal: string
  career_role: string
}

/**
 * Phase 4 — one-screen onboarding.
 *
 * The critical path collects only what makes the learning path meaningful: a primary goal and an
 * experience level. Everything the old 4-step wizard demanded up front — username, display name,
 * avatar, bio and social/portfolio URLs — is DEFERRED. A public portfolio identity is only useful
 * once the learner has something to show, so it is collected later in Settings → Portfolio (which
 * validates the same fields identically). This shortens the distance between "I signed up" and
 * "I can start learning" to a single focused screen.
 */
// Note: `user` is accepted for a stable prop contract (and future use) but the collapsed
// single-screen flow needs no per-user client state, so it is intentionally not destructured.
export default function OnboardingWizard({ profile, onboardingSettings }: OnboardingWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Resolve admin-configured options or fall back to the rich defaults.
  const activeGoalList = onboardingSettings?.fieldOptions?.goal?.filter((o) => o.enabled !== false)
  const goalOptions: OnboardingFieldOption[] =
    activeGoalList && activeGoalList.length > 0 ? activeGoalList : DEFAULT_GOAL_OPTIONS

  const activeExpList = onboardingSettings?.fieldOptions?.experience_level?.filter((o) => o.enabled !== false)
  const experienceOptions: OnboardingFieldOption[] =
    activeExpList && activeExpList.length > 0 ? activeExpList : DEFAULT_EXPERIENCE_OPTIONS

  const [goal, setGoal] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<PathDraft>
          if (parsed.goal) return parsed.goal
        }
      } catch {
        // Storage unavailable
      }
    }
    return profile?.goal || ''
  })

  const [careerRole, setCareerRole] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<PathDraft>
          if (parsed.career_role) return parsed.career_role
        }
      } catch {
        // Storage unavailable
      }
    }
    return profile?.career_role || ''
  })

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Phase 2 — record that the learner reached the onboarding screen for the per-step funnel.
  // The flow is now a single step; recording step 1 keeps the marker accurate. Best-effort and
  // fire-and-forget: the action is monotonic and swallows its own errors, so it never blocks the
  // wizard.
  useEffect(() => {
    void recordOnboardingStep(1)
  }, [])

  const persistDraft = (next: PathDraft) => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage unavailable
    }
  }

  const selectGoal = (id: string) => {
    setErrorMsg(null)
    setGoal(id)
    persistDraft({ goal: id, career_role: careerRole })
  }

  const selectExperience = (id: string) => {
    setErrorMsg(null)
    setCareerRole(id)
    persistDraft({ goal, career_role: id })
  }

  const handleComplete = (targetDestination: OnboardingDestination) => {
    setErrorMsg(null)

    if (!goal) {
      setErrorMsg('Please choose your primary learning goal.')
      return
    }
    if (!careerRole) {
      setErrorMsg('Please choose your experience level.')
      return
    }

    // Only the two required fields are sent. Deferred identity fields are omitted so the server
    // leaves them untouched (NULL for a new learner, collected later in Settings → Portfolio).
    const payload: OnboardingData = { goal, career_role: careerRole }

    startTransition(async () => {
      const result = await submitOnboarding(payload)

      if (result.error) {
        setErrorMsg(result.error)
        return
      }

      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
      } catch {
        // Storage unavailable
      }

      // Phase 6: "Start Learning" (primary CTA) lands on the recommended module's entry lesson
      // resolved server-side — meaningful under the module-entry unlock treatment, and safely
      // falling back to the first actionable lesson otherwise. "Explore Curriculum" (secondary)
      // still opens the full /academy list.
      const recommendedLessonPath =
        'recommendedLessonPath' in result ? result.recommendedLessonPath : null
      const destination =
        targetDestination === ONBOARDING_PRIMARY_DESTINATION && recommendedLessonPath
          ? recommendedLessonPath
          : targetDestination

      router.push(destination)
      router.refresh()
    })
  }

  const recommendedModule =
    goal && careerRole ? computeRecommendation(goal, careerRole, goalOptions) : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <div className="max-w-xl w-full space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="mb-1">
            <BrandMarkProdily size="md" priority />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground tracking-tight">
            Let&apos;s set up your path
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
            Two quick choices and you&apos;re learning. You can add your profile and portfolio details
            anytime in Settings.
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            className="p-3.5 text-xs rounded-xl bg-destructive/10 border border-destructive/20 text-destructive font-medium flex items-center gap-2"
            role="alert"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" aria-hidden="true" />
            {errorMsg}
          </div>
        )}

        <div className="bg-card p-6 sm:p-8 rounded-2xl border border-border shadow-sm space-y-8">
          {/* Goal */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-foreground">
              What&apos;s your primary goal? <span className="text-primary" aria-hidden="true">*</span>
            </legend>
            <p className="text-[11px] text-muted-foreground">
              This sets your recommended starting point and capstone path.
            </p>
            <div className="grid grid-cols-1 gap-2.5" role="radiogroup" aria-label="Primary learning goal" aria-required="true">
              {goalOptions.map((opt) => {
                const isSelected = goal === opt.id
                const Icon = getIconComponent(opt.icon, Target)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => selectGoal(opt.id)}
                    disabled={isPending}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3.5 transition-all disabled:opacity-60 ${
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
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Experience */}
          <fieldset className="space-y-3 pt-2 border-t border-border/60">
            <legend className="text-sm font-semibold text-foreground">
              What&apos;s your experience level? <span className="text-primary" aria-hidden="true">*</span>
            </legend>
            <p className="text-[11px] text-muted-foreground">
              Helps us calibrate examples and quiz difficulty to your background.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Experience level" aria-required="true">
              {experienceOptions.map((opt) => {
                const isSelected = careerRole === opt.id
                const Icon = getIconComponent(opt.icon, Briefcase)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => selectExperience(opt.id)}
                    disabled={isPending}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all disabled:opacity-60 ${
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
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Non-blocking recommendation hint */}
          {recommendedModule && (
            <div
              className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 animate-in fade-in duration-200"
              aria-live="polite"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary shrink-0 flex items-center justify-center">
                <CurriculumModuleIcon slugOrIcon={recommendedModule.slug} className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-primary" aria-hidden="true" /> Recommended start
                </p>
                <p className="text-sm font-bold text-foreground mt-0.5">{recommendedModule.name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{recommendedModule.description}</p>
              </div>
            </div>
          )}
        </div>

        {/* Completion CTAs — one obvious primary action, plus a low-emphasis explore option. */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <Button
            type="button"
            onClick={() => handleComplete(ONBOARDING_PRIMARY_DESTINATION)}
            disabled={isPending}
            className="w-full sm:flex-1 order-1 sm:order-2 rounded-xl h-11 bg-primary text-white hover:text-white hover:bg-primary/90 font-semibold shadow-xs"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" aria-hidden="true" />
            ) : (
              <Rocket className="w-4 h-4 mr-1.5" aria-hidden="true" />
            )}
            {isPending ? 'Launching…' : 'Start Learning'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleComplete(ONBOARDING_SECONDARY_DESTINATION)}
            disabled={isPending}
            className="w-full sm:flex-1 order-2 sm:order-1 rounded-xl h-11 border-border font-medium text-foreground hover:bg-muted"
          >
            Explore Curriculum
          </Button>
        </div>
      </div>
    </div>
  )
}
