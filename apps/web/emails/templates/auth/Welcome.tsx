import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

export interface WelcomeEmailProps {
  userName?: string
  appUrl?: string
  unsubscribeToken?: string
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  userName = 'Learner',
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText="Welcome to Prodily! Start your product management journey today." unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Welcome to Prodily, {userName}! 🎉</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        You&apos;ve unlocked full access to a structured, 90-lesson product management curriculum designed to build real product judgment through daily habit learning.
      </p>
      <p style={{ fontSize: '14px', color: '#70685A', fontWeight: 600 }}>
        Here is what awaits you:
      </p>
      <ul style={{ fontSize: '14px', color: '#70685A', paddingLeft: '20px', lineHeight: 1.8 }}>
        <li><strong>9 Structured Modules</strong>: From PM foundations to product strategy &amp; execution.</li>
        <li><strong>Interactive Quizzes &amp; Spaced Repetition</strong>: Retain core concepts.</li>
        <li><strong>Real-World Capstones &amp; Portfolio</strong>: Turn your work into proof on a public PM portfolio.</li>
      </ul>
      {/* Growth R5 B12a: frame the outcome from day one. */}
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        You&apos;re building a public PM portfolio you can share with recruiters.{' '}
        <a href={`${appUrl}/settings?tab=portfolio`} style={{ color: '#1F6B4E', fontWeight: 600 }}>
          Set up your portfolio
        </a>
      </p>
      <Button href={`${appUrl}/dashboard`}>Open your dashboard</Button>
    </EmailWrapper>
  )
}
