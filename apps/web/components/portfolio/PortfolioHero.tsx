'use client'

import React from 'react'
import Image from 'next/image'
import { Flame, Zap, Award, GraduationCap, Globe } from 'lucide-react'
import type { PublicPortfolioPayload } from '@/lib/portfolio-db'
import { ShareButton } from '@/components/portfolio/ShareButton'

interface PortfolioHeroProps {
  user: PublicPortfolioPayload['user']
}

function LinkedInIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.74a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28Z" />
    </svg>
  )
}

function GitHubIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z" />
    </svg>
  )
}

export function PortfolioHero({ user }: PortfolioHeroProps) {
  const {
    name,
    username,
    bio,
    avatarUrl,
    linkedinUrl,
    githubUrl,
    websiteUrl,
    currentStreak,
    totalXp,
    levelInfo,
  } = user

  const getInitials = (text: string) => {
    return text
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Left: Avatar + Details */}
        <div className="flex items-start gap-4 md:gap-5">
          {/* Avatar Image or Initials Circle */}
          <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border-2 border-primary/20 bg-primary/10 flex items-center justify-center shrink-0 shadow-sm">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${name}'s avatar`}
                fill
                unoptimized
                className="object-cover"
                sizes="(max-width: 768px) 80px, 96px"
              />
            ) : (
              <span className="text-2xl md:text-3xl font-bold font-serif text-primary">
                {getInitials(name || username)}
              </span>
            )}
          </div>

          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                Product Management Portfolio
              </span>
              {user.isFellow && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                  <GraduationCap className="w-3 h-3" />
                  Product Management Fellow
                </span>
              )}
              <span className="text-xs text-muted-foreground font-mono">@{username}</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground leading-tight truncate">
              {name}
            </h1>

            {user.isFellow && (
              <p className="text-xs md:text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 shrink-0" />
                Product Management Fellow at Prodily
              </p>
            )}

            {/* Progression Level & XP */}
            <div className="flex items-center gap-2 flex-wrap text-xs md:text-sm font-semibold text-muted-foreground">
              <span className="text-primary font-bold">Level {levelInfo.level}</span>
              <span>•</span>
              <span className="text-foreground">{totalXp.toLocaleString()} Total XP</span>
            </div>
          </div>
        </div>

        {/* Right: Share Button */}
        <div className="self-start md:self-auto shrink-0">
          <ShareButton username={username} />
        </div>
      </div>

      {/* Bio */}
      {bio && (
        <p className="text-xs md:text-sm text-muted-foreground leading-relaxed max-w-3xl border-t border-border/50 pt-4">
          {bio}
        </p>
      )}

      {/* Metrics & Social Links Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4 text-xs font-semibold">
        {/* Metric Badges */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-bold">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>{currentStreak} Day Streak</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-bold">
            <Zap className="w-4 h-4" />
            <span>{totalXp.toLocaleString()} Total XP</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground border border-border font-medium">
            <Award className="w-4 h-4 text-primary" />
            <span>Level {levelInfo.level} Learner</span>
          </div>
        </div>

        {/* Social Links */}
        <div className="flex items-center gap-2.5">
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-border bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
              title={`${name}'s LinkedIn Profile`}
              aria-label={`${name}'s LinkedIn Profile`}
            >
              <LinkedInIcon className="w-4 h-4 text-blue-500" />
            </a>
          )}
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-border bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
              title={`${name}'s GitHub Profile`}
              aria-label={`${name}'s GitHub Profile`}
            >
              <GitHubIcon className="w-4 h-4" />
            </a>
          )}
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-border bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
              title={`${name}'s Personal Website`}
              aria-label={`${name}'s Personal Website`}
            >
              <Globe className="w-4 h-4 text-primary" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
