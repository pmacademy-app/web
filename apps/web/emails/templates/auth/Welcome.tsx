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
    <EmailWrapper previewText="Welcome to PM Academy! Start your product journey today." unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Welcome to PM Academy, {userName}! 🎉</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        You&apos;ve unlocked full access to a structured, 90-lesson product management curriculum designed with the rigor of a top business school and the habit-building power of daily learning.
      </p>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Here is what awaits you:
      </p>
      <ul style={{ fontSize: '14px', color: '#525252', paddingLeft: '20px' }}>
        <li><strong>9 Structured Modules</strong> — From foundational principles to advanced strategy.</li>
        <li><strong>Interactive Quizzes & Spaced Repetition</strong> — Lock in core concepts.</li>
        <li><strong>Real-World Capstones & Portfolio</strong> — Build verifiable PM artifacts.</li>
      </ul>
      <Button href={`${appUrl}/dashboard`}>Start Lesson 1</Button>
    </EmailWrapper>
  )
}
