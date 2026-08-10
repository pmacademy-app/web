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
    <EmailWrapper previewText="Welcome to Prodily PM Academy! Start your product management journey today." unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Welcome to Prodily PM Academy, {userName}! 🎉</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        You&apos;ve unlocked full access to a structured, 90-lesson product management curriculum designed to build real product judgment through daily habit learning.
      </p>
      <p style={{ fontSize: '14px', color: '#70685A', fontWeight: 600 }}>
        Here is what awaits you:
      </p>
      <ul style={{ fontSize: '14px', color: '#70685A', paddingLeft: '20px', lineHeight: 1.8 }}>
        <li><strong>9 Structured Modules</strong> — From PM foundations to product strategy &amp; execution.</li>
        <li><strong>Interactive Quizzes &amp; Spaced Repetition</strong> — Retain core concepts.</li>
        <li><strong>Real-World Capstones &amp; Portfolio</strong> — Build verifiable PM project credentials.</li>
      </ul>
      <Button href={`${appUrl}/dashboard`}>Start Lesson 1</Button>
    </EmailWrapper>
  )
}
