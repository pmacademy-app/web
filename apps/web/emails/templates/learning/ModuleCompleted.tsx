import React from 'react'
import { EmailWrapper } from '../../components/EmailWrapper'
import { Button } from '../../components/Button'
import { BRAND } from '@/lib/brand'

export interface ModuleCompletedEmailProps {
  userName?: string
  moduleName?: string
  moduleSlug?: string
  xpBonus?: number
  appUrl?: string
  unsubscribeToken?: string
}

export const ModuleCompletedEmail: React.FC<ModuleCompletedEmailProps> = ({
  userName = 'Learner',
  moduleName = 'Foundations of Product Management',
  moduleSlug = 'foundations',
  xpBonus = 200,
  appUrl = BRAND.siteUrl,
  unsubscribeToken,
}) => {
  return (
    <EmailWrapper previewText={`Congratulations on completing Module: ${moduleName}!`} unsubscribeToken={unsubscribeToken}>
      <h2 style={{ fontSize: '20px', color: '#1a1a1a', marginTop: 0 }}>Module Complete: {moduleName}! 🏆</h2>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        Fantastic effort, {userName}! You&apos;ve finished all 10 lessons in <strong>{moduleName}</strong> and earned a <strong>+{xpBonus} XP bonus</strong>.
      </p>
      <p style={{ fontSize: '14px', color: '#525252' }}>
        What&apos;s next?
      </p>
      <ul style={{ fontSize: '14px', color: '#525252', paddingLeft: '20px' }}>
        <li><strong>Capstone Assignment</strong> — Apply what you learned to build a portfolio artifact.</li>
        <li><strong>Next Module</strong> — Keep your momentum going and start the next module.</li>
      </ul>
      <Button href={`${appUrl}/capstones?module=${moduleSlug}`}>Start Capstone Project</Button>
    </EmailWrapper>
  )
}
