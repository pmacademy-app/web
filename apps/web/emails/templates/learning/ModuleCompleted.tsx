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
      <h2 style={{ fontSize: '20px', color: '#171A17', marginTop: 0, fontWeight: 700 }}>Module Complete: {moduleName}! 🏆</h2>
      <p style={{ fontSize: '14px', color: '#70685A' }}>
        Fantastic effort, {userName}! You&apos;ve finished all lessons in <strong>{moduleName}</strong> and earned a <strong>+{xpBonus} XP bonus</strong> in Prodily PM Academy.
      </p>
      <p style={{ fontSize: '14px', color: '#70685A', fontWeight: 600 }}>
        What&apos;s next?
      </p>
      <ul style={{ fontSize: '14px', color: '#70685A', paddingLeft: '20px', lineHeight: 1.8 }}>
        <li><strong>Capstone Project</strong> — Apply what you learned to build a portfolio project.</li>
        <li><strong>Next Curriculum Module</strong> — Keep your momentum going into the next module.</li>
      </ul>
      <Button href={`${appUrl}/capstones?module=${moduleSlug}`}>Start Capstone Project</Button>
    </EmailWrapper>
  )
}
