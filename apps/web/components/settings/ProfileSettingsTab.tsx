'use client'

import React, { useState } from 'react'
import { User, Globe, Save, Loader2, CheckCircle2, Sparkles } from 'lucide-react'
import { AvatarUpload } from '@/components/profile/AvatarUpload'
import { useQuickStart } from '@/components/quick-start/QuickStartContext'
import { useApiQuery } from '@/lib/api/hooks'
import { apiPost } from '@/lib/api/client'
import type { ProfileGetResponse, ProfileUpdateResponse } from '@/lib/api/contracts/settings'

function LinkedInIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.78a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28z" />
    </svg>
  )
}

function GitHubIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function ProfileFormContent({
  profile,
  onSaveSuccess,
}: {
  profile?: ProfileGetResponse['profile']
  onSaveSuccess: () => void
}) {
  const { openQuickStart } = useQuickStart()
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: profile?.name || '',
    avatarUrl: profile?.avatar_url || '',
    bio: profile?.bio || '',
    linkedinUrl: profile?.linkedin_url || '',
    githubUrl: profile?.github_url || '',
    websiteUrl: profile?.website_url || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMessage(false)
    setErrorMessage(null)

    const result = await apiPost<ProfileUpdateResponse>('/api/settings/profile', {
      name: formData.name,
      bio: formData.bio,
      linkedin_url: formData.linkedinUrl,
      github_url: formData.githubUrl,
      website_url: formData.websiteUrl,
    })

    setSaving(false)

    if (!result.ok) {
      setErrorMessage(result.error.message)
      return
    }

    if (!result.data.success) {
      setErrorMessage(result.data.error || 'Failed to update profile.')
      return
    }

    setSuccessMessage(true)
    onSaveSuccess()
    setTimeout(() => setSuccessMessage(false), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Public Profile & Info
            </h2>
            <p className="text-xs text-muted-foreground">
              Manage your display name, headline, avatar, and social links.
            </p>
          </div>
        </div>

        {/* Avatar Upload */}
        <div className="p-4 rounded-xl border border-border bg-card/40 space-y-3">
          <label className="block text-xs font-bold text-foreground uppercase tracking-wider">
            Profile Photo
          </label>
          <AvatarUpload
            currentAvatarUrl={formData.avatarUrl}
            onUploadSuccess={(url) => setFormData((prev) => ({ ...prev, avatarUrl: url }))}
            onRemove={() => setFormData((prev) => ({ ...prev, avatarUrl: '' }))}
          />
        </div>

        {/* Full Name */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-foreground">
            Full Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Alex Morgan"
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Bio */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-foreground">
            Headline / Bio
          </label>
          <textarea
            rows={3}
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            placeholder="Product Manager passionate about AI platforms and user experience..."
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        {/* Social Links */}
        <div className="space-y-4 pt-2 border-t border-border">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Social & Portfolio Links
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <LinkedInIcon className="w-3.5 h-3.5 text-sky-600" /> LinkedIn URL
              </label>
              <input
                type="url"
                value={formData.linkedinUrl}
                onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                placeholder="https://linkedin.com/in/username"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <GitHubIcon className="w-3.5 h-3.5 text-foreground" /> GitHub URL
              </label>
              <input
                type="url"
                value={formData.githubUrl}
                onChange={(e) => setFormData({ ...formData, githubUrl: e.target.value })}
                placeholder="https://github.com/username"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-600" /> Website URL
              </label>
              <input
                type="url"
                value={formData.websiteUrl}
                onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                placeholder="https://yourwebsite.com"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>

        {/* Quick Start Tour Reopen */}
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Product Tour & Workspace Guide
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Need a refresher on Prodily features and navigation? Reopen the Quick Start tour anytime.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openQuickStart('manual')}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground hover:bg-secondary/60 transition-all cursor-pointer shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Reopen Tour
            </button>
          </div>
        </div>


        {/* Feedback Messages & Save Button */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div>
            {successMessage && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 animate-in fade-in-0">
                <CheckCircle2 className="w-4 h-4" /> Profile updated successfully!
              </span>
            )}
            {errorMessage && (
              <span className="text-xs font-semibold text-destructive animate-in fade-in-0">
                {errorMessage}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-xs disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Profile
          </button>
        </div>
      </div>
    </form>
  )
}

export function ProfileSettingsTab() {
  const { data, isLoading, mutate } = useApiQuery<ProfileGetResponse>('/api/settings/profile')

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading profile settings...</span>
      </div>
    )
  }

  return (
    <ProfileFormContent
      key={data?.profile?.name ?? 'empty'}
      profile={data?.profile}
      onSaveSuccess={() => void mutate()}
    />
  )
}
