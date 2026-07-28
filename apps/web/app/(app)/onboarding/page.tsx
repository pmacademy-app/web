'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Briefcase, Compass, GraduationCap, Loader2 } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { submitOnboarding } from './actions'

type GoalType = 'job_search' | 'fill_gaps' | 'exploring'

interface Option {
  id: GoalType
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const GOAL_OPTIONS: Option[] = [
  {
    id: 'job_search',
    title: 'Landing a PM Role',
    description: 'Preparing for interviews and switching careers within 6-12 months.',
    icon: Briefcase,
  },
  {
    id: 'fill_gaps',
    title: 'Filling Knowledge Gaps',
    description: 'Already in product; sharpening structured thinking and judgment.',
    icon: GraduationCap,
  },
  {
    id: 'exploring',
    title: 'Exploring Product Management',
    description: 'Understanding the craft to see if it matches your future career plans.',
    icon: Compass,
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [selectedGoal, setSelectedGoal] = useState<GoalType | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGoal) return

    setErrorMsg(null)

    startTransition(async () => {
      const result = await submitOnboarding(selectedGoal)

      if (result.error) {
        setErrorMsg(result.error)
        return
      }

      // Refresh Supabase session on client so token JWT contains updated user_metadata
      const supabase = createBrowserSupabaseClient()
      const { error: refreshError } = await supabase.auth.refreshSession()

      if (refreshError) {
        console.error('[onboarding] Session refresh error:', refreshError.message)
        // Even if refresh failed locally, proceed to trigger middleware token check/refresh
      }

      router.push('/dashboard')
      router.refresh()
    })
  }

  const isLoading = isPending

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-primary">
            Quick Onboarding
          </span>
          <h1 className="text-3xl font-bold font-serif text-foreground mt-2">
            Tailor Your Path
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            What is your primary goal at PM Academy?
          </p>
        </div>

        {errorMsg && (
          <div
            className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium"
            role="alert"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div
            role="radiogroup"
            aria-label="Onboarding Goals"
            className="space-y-4"
          >
            {GOAL_OPTIONS.map((option) => {
              const Icon = option.icon
              const isSelected = selectedGoal === option.id

              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isLoading}
                  onClick={() => setSelectedGoal(option.id)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-secondary/40'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-primary/10 border-primary/20 text-primary'
                        : 'bg-background border-border text-muted-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {option.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          <button
            type="submit"
            disabled={!selectedGoal || isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting up your academy...
              </>
            ) : (
              'Enter Dashboard →'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
