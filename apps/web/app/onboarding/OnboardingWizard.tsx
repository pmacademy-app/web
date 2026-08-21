'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { submitOnboarding, OnboardingData } from './actions'
import { AvatarUpload } from '@/components/profile/AvatarUpload'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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

  const updateForm = (key: keyof OnboardingData, value: string | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const nextStep = () => {
    setErrorMsg(null)
    if (step === 1 && !formData.name) {
      setErrorMsg('Name is required.')
      return
    }
    if (step === 2 && !formData.goal) {
      setErrorMsg('Please select a primary goal.')
      return
    }
    setStep((s) => s + 1)
  }

  const prevStep = () => setStep((s) => Math.max(1, s - 1))

  const handleSubmit = async () => {
    setErrorMsg(null)

    startTransition(async () => {
      const result = await submitOnboarding(formData)

      if (result.error) {
        setErrorMsg(result.error)
        return
      }

      // Refresh Supabase session on client so token JWT contains updated user_metadata
      const supabase = createBrowserSupabaseClient()
      const { error: refreshError } = await supabase.auth.refreshSession()

      if (refreshError) {
        console.error('[onboarding] Session refresh error:', refreshError.message)
      }

      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-primary">
            Step {step} of 3
          </span>
          <h1 className="text-3xl font-bold font-serif text-foreground mt-2">
            {step === 1 && 'Complete Your Profile'}
            {step === 2 && 'Your Background'}
            {step === 3 && 'Connect Socials'}
          </h1>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs rounded-lg bg-destructive/10 border border-destructive/20 text-destructive font-medium" role="alert">
            {errorMsg}
          </div>
        )}

        <div className="space-y-6 bg-card p-6 rounded-2xl border shadow-sm">
          {step === 1 && (
            <div className="space-y-4">
              <AvatarUpload userId={user.id} currentAvatarUrl={formData.avatar_url || undefined} onUploadSuccess={(url) => updateForm('avatar_url', url)} />
              
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="name">Full Name *</label>
                <Input 
                  id="name" 
                  value={formData.name || ''} 
                  onChange={(e) => updateForm('name', e.target.value)} 
                  placeholder="Jane Doe" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="username">Username (Optional)</label>
                <Input 
                  id="username" 
                  value={formData.username || ''} 
                  onChange={(e) => updateForm('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
                  placeholder="janedoe" 
                />
                <p className="text-xs text-muted-foreground">This will be used for your public profile link.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="career_role">Current Role</label>
                <Input 
                  id="career_role" 
                  value={formData.career_role || ''} 
                  onChange={(e) => updateForm('career_role', e.target.value)} 
                  placeholder="e.g. Data Analyst, Software Engineer, Student" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="goal">Primary Goal *</label>
                <Select value={formData.goal} onValueChange={(val) => updateForm('goal', val as 'job_search' | 'fill_gaps' | 'exploring')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a goal..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="job_search">Landing a PM Role</SelectItem>
                    <SelectItem value="fill_gaps">Filling Knowledge Gaps</SelectItem>
                    <SelectItem value="exploring">Exploring Product Management</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="learning_purpose">Specific Learning Purpose</label>
                <Input 
                  id="learning_purpose" 
                  value={formData.learning_purpose || ''} 
                  onChange={(e) => updateForm('learning_purpose', e.target.value)} 
                  placeholder="e.g. Master product strategy for B2B SaaS" 
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="linkedin_url">LinkedIn URL</label>
                <Input 
                  id="linkedin_url" 
                  value={formData.linkedin_url || ''} 
                  onChange={(e) => updateForm('linkedin_url', e.target.value)} 
                  placeholder="https://linkedin.com/in/janedoe" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="website_url">Portfolio / Website URL</label>
                <Input 
                  id="website_url" 
                  value={formData.website_url || ''} 
                  onChange={(e) => updateForm('website_url', e.target.value)} 
                  placeholder="https://janedoe.com" 
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={prevStep} 
            disabled={step === 1 || isPending}
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          {step < 3 ? (
            <Button type="button" onClick={nextStep} className="w-full">
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button 
              type="button" 
              onClick={handleSubmit} 
              disabled={isPending}
              className="w-full"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isPending ? 'Saving...' : 'Finish Setup'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
