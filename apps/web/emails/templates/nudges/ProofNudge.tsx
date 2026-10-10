import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

/**
 * Growth R5 B6/B7 proof nudges. One component, two templates (portfolio ready, Fellow eligible),
 * so the keys stay independently toggleable and measurable in email_queue. Fellow is a
 * distinction: never called a certificate or credential here.
 */
export interface ProofNudgeEmailProps {
  userName?: string
  /** Which nudge: decides the copy. */
  nudge?: 'portfolio_ready' | 'fellow_eligible'
  /** The second (and last) send of this nudge. */
  isReminder?: boolean
  ctaUrl?: string
  appUrl?: string
  unsubscribeToken?: string
}

const COPY = {
  portfolio_ready: {
    preview: 'Your portfolio is ready to share',
    heading: 'Your portfolio is ready to share',
    body: 'Everything recruiters and peers need is in place: your profile, your published work and your links. One step left: make your portfolio public so you can share it.',
    cta: 'Publish my portfolio',
  },
  fellow_eligible: {
    preview: 'You qualify for PM Fellow',
    heading: 'You qualify for PM Fellow',
    body: `Your portfolio meets the bar for PM Fellow, a distinction the ${BRAND.company} team grants to learners with a complete, portfolio-ready profile. Request it from your portfolio settings.`,
    cta: 'Request PM Fellow',
  },
} as const

export const ProofNudgeEmail: React.FC<ProofNudgeEmailProps> = ({
  userName = 'Learner',
  nudge = 'portfolio_ready',
  isReminder = false,
  ctaUrl = `${BRAND.siteUrl}/settings?tab=portfolio`,
  unsubscribeToken,
}) => {
  const copy = COPY[nudge]
  return (
    <EmailWrapper previewText={copy.preview} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>{copy.heading}</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hi {userName}, {isReminder ? 'a quick reminder: ' : ''}
        {copy.body}
      </p>
      <Button href={ctaUrl}>{copy.cta}</Button>
    </EmailWrapper>
  )
}
