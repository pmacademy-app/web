'use client'

import React, { useState, useEffect } from 'react'
import type {
  PortfolioSettingsData,
  PortfolioSectionId,
  LearnerSubmittedCapstoneSummary,
} from '@/lib/portfolio-db'
import { DEFAULT_PORTFOLIO_LAYOUT } from '@/lib/portfolio-db'
import {
  trackPortfolioLayoutUpdated,
  trackPortfolioFeaturedCapstoneSet,
} from '@/lib/analytics'
import { AvatarUpload } from '@/components/profile/AvatarUpload'
import {
  User,
  Globe,
  Lock,
  Link as LinkIcon,
  Check,
  AlertCircle,
  Save,
  ExternalLink,
  Layers,
  Sparkles,
  Eye,
  ArrowUp,
  ArrowDown,
  Share2,
} from 'lucide-react'

function LinkedInIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.74a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28Z" />
    </svg>
  )
}

function GitHubIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z" />
    </svg>
  )
}

const SECTION_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  radar: {
    label: 'Skill Radar Overview',
    description: 'Dynamic 6-cluster competency evaluation & score breakdown.',
  },
  capstones: {
    label: 'Verified Applied Capstones',
    description: 'Submitted proof-of-work deliverables & retrospectives.',
  },
  progress: {
    label: 'Curriculum Progress',
    description: 'Sequential completion percentage across the 90-lesson curriculum.',
  },
  achievements: {
    label: 'Achievements & Badges',
    description: 'Verified mastery badges and accredited certificate status.',
  },
}

export function PortfolioSettingsForm() {
  const [formData, setFormData] = useState<PortfolioSettingsData>({
    username: '',
    name: '',
    bio: '',
    avatarUrl: '',
    linkedinUrl: '',
    githubUrl: '',
    websiteUrl: '',
    isPortfolioPublic: true,
    portfolioLayout: DEFAULT_PORTFOLIO_LAYOUT,
    featuredCapstoneId: null,
    portfolioViewCount: 0,
  })

  const [submittedCapstones, setSubmittedCapstones] = useState<LearnerSubmittedCapstoneSummary[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Fetch initial portfolio settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true)
        const res = await fetch('/api/settings/portfolio')
        if (res.ok) {
          const data = await res.json()
          if (data.settings) {
            setFormData({
              ...data.settings,
              portfolioLayout: data.settings.portfolioLayout || DEFAULT_PORTFOLIO_LAYOUT,
              featuredCapstoneId: data.settings.featuredCapstoneId || null,
              portfolioViewCount: data.settings.portfolioViewCount || 0,
            })
          }
          if (Array.isArray(data.submittedCapstones)) {
            setSubmittedCapstones(data.submittedCapstones)
          }
        }
      } catch (err) {
        console.error('Failed to load portfolio settings:', err)
        setErrorMsg('Failed to load portfolio settings.')
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleChange = (field: keyof PortfolioSettingsData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setErrorMsg(null)
    setSuccessMsg(null)
  }

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const activeLayout = (formData.portfolioLayout || DEFAULT_PORTFOLIO_LAYOUT).filter((s) => s !== 'hero')
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= activeLayout.length) return

    const newLayout = [...activeLayout]
    const temp = newLayout[index]
    newLayout[index] = newLayout[targetIndex]
    newLayout[targetIndex] = temp

    const fullLayout: PortfolioSectionId[] = ['hero', ...newLayout]
    setFormData((prev) => ({ ...prev, portfolioLayout: fullLayout }))
    trackPortfolioLayoutUpdated(fullLayout)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await fetch('/api/settings/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update portfolio settings.')
      }

      setFormData((prev) => ({
        ...prev,
        ...data.settings,
      }))
      setSuccessMsg('Portfolio settings and layout updated successfully!')

      if (formData.featuredCapstoneId) {
        const feat = submittedCapstones.find((c) => c.id === formData.featuredCapstoneId)
        trackPortfolioFeaturedCapstoneSet(feat?.moduleSlug)
      }
      if (formData.portfolioLayout) {
        trackPortfolioLayoutUpdated(formData.portfolioLayout)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating settings.'
      setErrorMsg(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
        Loading portfolio settings...
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-500 flex items-center gap-2 font-bold">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Public / Private Toggle */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold font-serif text-foreground flex items-center gap-2">
              {formData.isPortfolioPublic ? (
                <Globe className="w-4 h-4 text-emerald-500" />
              ) : (
                <Lock className="w-4 h-4 text-amber-500" />
              )}
              <span>Portfolio Visibility</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {formData.isPortfolioPublic
                ? 'Your portfolio is public and accessible at /p/' + (formData.username || 'username')
                : 'Your portfolio is hidden from public view and search engine indexing.'}
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isPortfolioPublic}
              onChange={(e) => handleChange('isPortfolioPublic', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>
      </div>

      {/* Identity & Basic Profile */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-bold font-serif text-foreground flex items-center gap-2 border-b border-border pb-3">
          <User className="w-4 h-4 text-primary" /> Profile Identity
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Username */}
          <div className="space-y-1.5">
            <label htmlFor="setting-username" className="text-xs font-bold text-foreground block">
              Portfolio Handle / Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">
                /p/
              </span>
              <input
                id="setting-username"
                type="text"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="johndoe"
                required
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background text-xs md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">3–30 characters, letters, numbers, and hyphens.</p>
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <label htmlFor="setting-name" className="text-xs font-bold text-foreground block">
              Display Name
            </label>
            <input
              id="setting-name"
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="John Doe"
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-1.5">
          <label htmlFor="setting-bio" className="text-xs font-bold text-foreground block">
            Bio / Professional Headline
          </label>
          <textarea
            id="setting-bio"
            value={formData.bio}
            onChange={(e) => handleChange('bio', e.target.value)}
            rows={3}
            placeholder="Product Manager passionate about user discovery, B2B SaaS growth, and data-driven execution."
            className="w-full p-3 rounded-lg border border-border bg-background text-xs md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 leading-relaxed resize-y"
          />
        </div>

        {/* Avatar Upload */}
        <div className="p-4 rounded-xl border border-border bg-card/40 space-y-3">
          <label className="text-xs font-bold text-foreground block uppercase tracking-wider">
            Profile Photo
          </label>
          <AvatarUpload
            currentAvatarUrl={formData.avatarUrl}
            onUploadSuccess={(url) => handleChange('avatarUrl', url)}
            onRemove={() => handleChange('avatarUrl', '')}
          />
        </div>
      </div>

      {/* Social Links */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-bold font-serif text-foreground flex items-center gap-2 border-b border-border pb-3">
          <Globe className="w-4 h-4 text-primary" /> Social & Professional Links
        </h3>

        <div className="space-y-3">
          {/* LinkedIn */}
          <div className="space-y-1.5">
            <label htmlFor="setting-linkedin" className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <LinkedInIcon className="w-3.5 h-3.5 text-blue-500" /> LinkedIn Profile URL
            </label>
            <input
              id="setting-linkedin"
              type="url"
              value={formData.linkedinUrl}
              onChange={(e) => handleChange('linkedinUrl', e.target.value)}
              placeholder="https://linkedin.com/in/username"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>

          {/* GitHub */}
          <div className="space-y-1.5">
            <label htmlFor="setting-github" className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <GitHubIcon className="w-3.5 h-3.5 text-foreground" /> GitHub Profile URL
            </label>
            <input
              id="setting-github"
              type="url"
              value={formData.githubUrl}
              onChange={(e) => handleChange('githubUrl', e.target.value)}
              placeholder="https://github.com/username"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>

          {/* Website */}
          <div className="space-y-1.5">
            <label htmlFor="setting-website" className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-primary" /> Personal Website / Portfolio URL
            </label>
            <input
              id="setting-website"
              type="url"
              value={formData.websiteUrl}
              onChange={(e) => handleChange('websiteUrl', e.target.value)}
              placeholder="https://yourwebsite.com"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Featured Deliverable Selection */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold font-serif text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" /> Featured Deliverable Spotlight
          </h3>
          <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            Proof-of-Work Pinning
          </span>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Feature one of your submitted module capstones in a prominent showcase card at the top of your public portfolio.
        </p>

        <div className="space-y-1.5">
          <label htmlFor="setting-featured-capstone" className="text-xs font-bold text-foreground block">
            Select Featured Capstone Project
          </label>

          {submittedCapstones.length > 0 ? (
            <select
              id="setting-featured-capstone"
              value={formData.featuredCapstoneId || ''}
              onChange={(e) => handleChange('featuredCapstoneId', e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">None (Display standard chronological portfolio)</option>
              {submittedCapstones.map((cap) => (
                <option key={cap.id} value={cap.id}>
                  Module {cap.moduleNumber.toString().padStart(2, '0')}: {cap.title} ({cap.deliverableType}) {cap.isPublic ? '' : '— [Private]'}
                </option>
              ))}
            </select>
          ) : (
            <div className="p-3 rounded-lg border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">
              You haven&apos;t submitted any module capstones yet. Complete a module capstone to feature it on your portfolio.
            </div>
          )}

          <p className="text-[11px] text-muted-foreground pt-1">
            Privacy note: If a featured deliverable is marked private or restricted by safety moderation, it will not be displayed on your public portfolio.
          </p>
        </div>
      </div>

      {/* Portfolio Section Layout Ordering */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold font-serif text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> Portfolio Section Ordering
          </h3>
          <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            Layout Customization
          </span>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Customize the order of sections on your public portfolio page. The Identity Hero header is always anchored at the top.
        </p>

        <div className="space-y-2">
          {((formData.portfolioLayout || DEFAULT_PORTFOLIO_LAYOUT).filter((s) => s !== 'hero')).map((sectionKey, index, arr) => {
            const info = SECTION_DESCRIPTIONS[sectionKey] || {
              label: sectionKey,
              description: 'Portfolio content section',
            }

            return (
              <div
                key={sectionKey}
                className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card/60 gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[11px] font-mono font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">{info.label}</h4>
                    <p className="text-[11px] text-muted-foreground">{info.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveSection(index, 'up')}
                    aria-label={`Move ${info.label} up`}
                    className="p-1.5 rounded-lg border border-border hover:bg-secondary text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === arr.length - 1}
                    onClick={() => moveSection(index, 'down')}
                    aria-label={`Move ${info.label} down`}
                    className="p-1.5 rounded-lg border border-border hover:bg-secondary text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Portfolio Visitor Analytics & Social Card */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold font-serif text-foreground flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-500" /> Visitor Engagement &amp; Social Sharing
          </h3>
          <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
            Public Metrics
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-border bg-background space-y-1">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Lifetime Portfolio Visitors
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">
                {(formData.portfolioViewCount || 0).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">unique views</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Counts views on your public portfolio page. Private portfolios do not increment views.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-background space-y-2 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Dynamic OpenGraph Card
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                When you share your portfolio on LinkedIn, X, or Slack, a rich 1200x630 dynamic preview card is automatically displayed.
              </p>
            </div>

            {formData.username && (
              <a
                href={`/api/og/portfolio/${formData.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline pt-1"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Inspect Dynamic Social Preview Card</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Links Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
        <div className="flex items-center gap-4">
          {formData.username && (
            <a
              href={`/p/${formData.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <span>Preview Public Portfolio</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <a
            href="/progress"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:underline"
          >
            <span>View Progress &amp; Certificates</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="ml-auto px-6 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Portfolio Settings</span>
            </>
          )}
        </button>
      </div>
    </form>
  )
}
