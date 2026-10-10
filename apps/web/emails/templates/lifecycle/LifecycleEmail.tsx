import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

/**
 * Lifecycle reactivation emails (Growth R5 / B10), replacing the generic Welcome template the three
 * sequences used to share. Each sequence has its own copy; the two comeback sequences also carry
 * the learner's own next step toward their proof (selectProofNextStep), when there is one.
 */
export type LifecycleSequence =
  | 'lifecycle.d1_never_started'
  | 'lifecycle.d3_started_not_finished'
  | 'lifecycle.streak_broken'

export interface LifecycleEmailProps {
  userName?: string
  sequence?: LifecycleSequence
  proofStepText?: string | null
  proofStepUrl?: string | null
  appUrl?: string
  unsubscribeToken?: string
}

const COPY: Record<LifecycleSequence, { preview: string; heading: string; body: string; cta: string; path: string }> = {
  'lifecycle.d1_never_started': {
    preview: 'Your first lesson takes about 10 minutes',
    heading: 'Ready for your first lesson?',
    body: 'Your first lesson takes about ten minutes, and every lesson you finish builds toward a public product management portfolio you can share.',
    cta: 'Start your first lesson',
    path: '/academy',
  },
  'lifecycle.d3_started_not_finished': {
    preview: 'Pick up where you left off',
    heading: 'Pick up where you left off',
    body: 'You made a start. Finishing your first lessons is the fastest way to turn them into proof on your portfolio.',
    cta: 'Continue learning',
    path: '/dashboard',
  },
  'lifecycle.streak_broken': {
    preview: 'Your learning streak is waiting',
    heading: 'Your streak is waiting for you',
    body: 'You built a real habit before. One lesson today gets it going again.',
    cta: 'Restart with one lesson',
    path: '/dashboard',
  },
}

export const LifecycleEmail: React.FC<LifecycleEmailProps> = ({
  userName = 'Learner',
  sequence = 'lifecycle.d1_never_started',
  proofStepText = null,
  proofStepUrl = null,
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  const copy = COPY[sequence] ?? COPY['lifecycle.d1_never_started']
  const showProof = sequence !== 'lifecycle.d1_never_started' && proofStepText && proofStepUrl

  return (
    <EmailWrapper previewText={copy.preview} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>{copy.heading}</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Hi {userName}, {copy.body}
      </p>
      {showProof ? (
        <p style={{ fontSize: '14px', color: '#171A17' }}>
          <strong>Where you are:</strong> {proofStepText}{' '}
          <a href={proofStepUrl!} style={{ color: '#1F6B4E', fontWeight: 600 }}>
            Take the next step
          </a>
        </p>
      ) : null}
      <Button href={`${appUrl}${copy.path}`}>{copy.cta}</Button>
    </EmailWrapper>
  )
}
